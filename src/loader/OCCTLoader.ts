import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TFunc } from "../theme/Locales";

export class OCCTLoader {
    private wasmUrl: string;

    // STEP/IGES 读取参数 (类似于 StepIO.h)
    public readParameters: {
        productContext: number; // Both = 1, OnlyOne = 0
        assemblyLevel: number;  // All = 1, One = 0
        shapeRepr: number;      // All = 1, One = 0
        shapeAspect: number;    // true = 1, false = 0
        subShapesNames: number; // true = 1, false = 0
        codePage: string;       // STEP 文件编码
        linearDeflection: number; // 细分线性偏差
        angularDeflection: number; // 细分角度偏差 (弧度)
    };

    constructor(wasmUrl: string = '/libs/occt-import-js/occt-import-js.wasm') {
        this.wasmUrl = wasmUrl;
        
        // 初始化默认参数 (匹配 StepIO.h 默认值)
        this.readParameters = {
            productContext: 1,
            assemblyLevel: 1,
            shapeRepr: 1,
            shapeAspect: 1,
            subShapesNames: 0,
            codePage: 'UTF8',
            linearDeflection: 0.1,
            angularDeflection: 0.5
        };
    }

    async load(buffer: ArrayBuffer, t: TFunc, onProgress?: (p: number, msg: string) => void): Promise<THREE.Group> {
        // 输入验证
        if (!buffer || buffer.byteLength === 0) {
            throw new Error(t('error_empty_file'));
        }

        if (onProgress) onProgress(10, t('loading_cad_engine'));

        // 加载 occt-import-js (动态导入，避免未使用时的打包问题)
        let occt;
        try {
            // @ts-ignore
            const initOCCT = (await import('occt-import-js')).default;
            occt = await initOCCT({
                locateFile: (name: string) => {
                    if (name.endsWith('.wasm')) return this.wasmUrl;
                    return name;
                }
            });
        } catch (e) {
            console.error('初始化 OCCT 引擎失败:', e);
            throw new Error(t('error_cad_engine_init_failed'));
        }

        if (onProgress) onProgress(30, t('parsing_cad_data'));

        const fileContent = new Uint8Array(buffer);
        let result;
        let stepError = null;
        let igesError = null;
        
        // 先尝试 STEP，失败后再尝试 IGES
        try {
            // 使用类级别的参数进行 STEP 文件解析
            const params = {
                linearDeflection: this.readParameters.linearDeflection,
                angularDeflection: this.readParameters.angularDeflection,
                productContext: this.readParameters.productContext,
                assemblyLevel: this.readParameters.assemblyLevel,
                shapeRepr: this.readParameters.shapeRepr,
                shapeAspect: this.readParameters.shapeAspect,
                subShapesNames: this.readParameters.subShapesNames,
                codePage: this.readParameters.codePage
            };
            result = occt.ReadStepFile(fileContent, params);
        } catch (e) {
            stepError = e;
            console.warn('STEP 解析失败，正在尝试 IGES...', e);
        }

        if (!result || !result.success) {
            try {
                // 使用类级别的参数进行 IGES 文件解析
                const params = {
                    linearDeflection: this.readParameters.linearDeflection,
                    angularDeflection: this.readParameters.angularDeflection
                };
                result = occt.ReadIgesFile(fileContent, params);
            } catch (e) {
                igesError = e;
                console.error('IGES 解析失败', e);
            }
        }

        if (!result) {
            throw new Error(t('error_cad_parse_failed') + ' - ' + t('error_no_parser_result'));
        }

        if (!result.success) {
            let errorMsg = t('error_cad_parse_failed');
            if (result.error) {
                errorMsg += ` - ${result.error}`;
            } else if (stepError && igesError) {
                errorMsg += ` - STEP: ${stepError.message || '未知错误'}, IGES: ${igesError.message || '未知错误'}`;
            }
            throw new Error(errorMsg);
        }

        // 验证解析结果包含有效网格数据
        if (!result.meshes || !Array.isArray(result.meshes) || result.meshes.length === 0) {
            throw new Error(t('error_cad_no_meshes'));
        }

        if (onProgress) onProgress(70, t('creating_geometry'));

        const group = new THREE.Group();
        
        // 材质缓存：重用相同属性的材质
        const materialCache = new Map<string, THREE.MeshPhongMaterial>();
        
        // 默认材质
        const defaultMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xcccccc, 
            side: THREE.DoubleSide,
            flatShading: false,
            shininess: 30,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
        });
        
        materialCache.set('default', defaultMaterial);

        // 保存原始形状层次结构
        const meshMap = new Map<string | number, THREE.Mesh>();
        const groupMap = new Map<string | number, THREE.Group>();
        const meshesWithParent = new Map<THREE.Mesh, string | number>();

        for (const mesh of result.meshes) {
            let geometry = new THREE.BufferGeometry();
            
            // 顶点坐标
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3));
            
            // 法线
            if (mesh.attributes.normal && mesh.attributes.normal.array) {
                geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3));
            } else {
                // 优化法线计算：仅在必要时计算
                geometry.computeVertexNormals();
            }

            // 索引
            if (mesh.index && mesh.index.array) {
                geometry.setIndex(new THREE.Uint32BufferAttribute(mesh.index.array, 1));
            }
            
            // 优化：合并重复顶点，减少内存占用
            geometry = BufferGeometryUtils.mergeVertices(geometry);
            
            // 优化：计算边界框和球体，提高渲染性能
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();

            // 获取或创建材质
            const threeMaterial = defaultMaterial.clone();
            const threeMesh = new THREE.Mesh(geometry, threeMaterial);
            
            // 颜色处理：类似 StepIO.h 的层次化颜色处理
            // 1. 设置基础颜色 (mesh.color 或默认灰色)
            let baseColor = new THREE.Color(0xcccccc); // 默认灰色
            if (mesh.color && Array.isArray(mesh.color) && mesh.color.length >= 3) {
                baseColor = new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2]);
            }
            (threeMesh.material as THREE.MeshPhongMaterial).color = baseColor;
            threeMesh.userData.color = baseColor.getHex();

            // 2. 处理 B-Rep 面颜色 (按面分配的颜色)
            const brepFaces: any[] | undefined = (mesh as any).brep_faces;
            if (Array.isArray(brepFaces) && brepFaces.length > 0) {
                // 检查是否存在有效的面颜色数据
                const hasValidFaceColors = brepFaces.some(face => 
                    face && Array.isArray(face.color) && face.color.length >= 3 &&
                    face.first !== undefined && face.last !== undefined
                );

                if (hasValidFaceColors) {
                    geometry = geometry.toNonIndexed();
                    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
                    const vertexCount = posAttr.count;
                    const triCount = Math.floor(vertexCount / 3);
                    const colors = new Float32Array(vertexCount * 3);

                    // 初始化颜色数组为基础颜色
                    for (let i = 0; i < vertexCount; i++) {
                        const ci = i * 3;
                        colors[ci + 0] = baseColor.r;
                        colors[ci + 1] = baseColor.g;
                        colors[ci + 2] = baseColor.b;
                    }

                    // 处理每个面的颜色
                    for (const face of brepFaces) {
                        if (!face || !Array.isArray(face.color) || face.color.length < 3) {
                            continue;
                        }

                        const first = Number(face.first);
                        const last = Number(face.last);
                        
                        // 验证索引范围
                        if (!Number.isFinite(first) || !Number.isFinite(last) || first < 0 || last < first) {
                            continue;
                        }

                        // 创建面颜色
                        const faceColor = new THREE.Color(
                            face.color[0], 
                            face.color[1], 
                            face.color[2]
                        );

                        // 确保索引在有效范围内
                        const startTri = Math.max(0, Math.min(triCount - 1, first));
                        const endTri = Math.max(0, Math.min(triCount - 1, last));

                        // 为面内的所有三角形设置颜色
                        for (let tIdx = startTri; tIdx <= endTri; tIdx++) {
                            // 每个三角形有3个顶点
                            for (let v = 0; v < 3; v++) {
                                const vi = (tIdx * 3 + v);
                                const ci = vi * 3;
                                colors[ci + 0] = faceColor.r;
                                colors[ci + 1] = faceColor.g;
                                colors[ci + 2] = faceColor.b;
                            }
                        }
                    }

                    // 添加顶点颜色属性
                    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
                    threeMesh.geometry = geometry;
                    (threeMesh.material as THREE.MeshPhongMaterial).vertexColors = true;
                }
            }
            
            threeMesh.name = mesh.name || 'CAD Part';
            
            // 保存原始 CAD 元数据
            threeMesh.userData = {
                ...mesh.userData,
                ...threeMesh.userData,
                source: 'OCCT',
                meshId: mesh.id,
                shapeName: mesh.name,
                isAssembly: !!(mesh as any).isAssembly,
                isComponent: !!(mesh as any).isComponent
            };
            
            // 优化：设置 frustumCulled 以提高渲染性能
            threeMesh.frustumCulled = true;
            
            // 检查是否有父级信息
            const parentId = (mesh as any).parentId || (mesh as any).parent;
            if (parentId) {
                meshesWithParent.set(threeMesh, parentId);
            } else {
                // 没有父级信息，直接添加到根组
                group.add(threeMesh);
            }
            
            // 存储网格以便后续构建层次结构
            meshMap.set(mesh.id || mesh.name || `mesh_${meshMap.size}`, threeMesh);
        }
        
        // 构建层次结构：创建组并添加带有父级信息的网格
        for (const [threeMesh, parentId] of meshesWithParent.entries()) {
            // 获取或创建父级
            let parent: THREE.Object3D;
            
            if (meshMap.has(parentId)) {
                // 父级是另一个网格
                parent = meshMap.get(parentId)!;
            } else {
                // 父级是一个组
                if (!groupMap.has(parentId)) {
                    const newGroup = new THREE.Group();
                    newGroup.name = `Group_${parentId}`;
                    groupMap.set(parentId, newGroup);
                    group.add(newGroup); // 添加到根组
                }
                parent = groupMap.get(parentId)!;
            }
            
            // 添加网格到父级
            parent.add(threeMesh);
        }
        
        // 优化：计算整个组的边界框和球体
        group.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
                obj.geometry.computeBoundingBox();
                obj.geometry.computeBoundingSphere();
            }
        });
        
        // 优化：应用矩阵变换以确保模型居中 (如果需要)
        group.updateMatrixWorld(true);

        if (onProgress) onProgress(100, t('model_loaded'));

        return group;
    }
}