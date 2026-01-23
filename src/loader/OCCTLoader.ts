
import * as THREE from 'three';
import { TFunc } from "../theme/Locales";

export class OCCTLoader {
    private wasmUrl: string;

    constructor(wasmUrl: string = '/libs/occt-import-js/occt-import-js.wasm') {
        this.wasmUrl = wasmUrl;
    }

    async load(buffer: ArrayBuffer, t: TFunc, onProgress?: (p: number, msg: string) => void): Promise<THREE.Group> {
        if (onProgress) onProgress(10, t('loading_cad_engine'));

        // 加载 occt-import-js（动态导入，避免未使用时的打包问题）
        // @ts-ignore
        const initOCCT = (await import('occt-import-js')).default;
        const occt = await initOCCT({
            locateFile: (name: string) => {
                if (name.endsWith('.wasm')) return this.wasmUrl;
                return name;
            }
        });

        if (onProgress) onProgress(30, t('parsing_cad_data'));

        const fileContent = new Uint8Array(buffer);
        let result;
        
        // 先尝试 STEP，失败后再尝试 IGES
        try {
            // 优化：增加参数以减少冗余面片
            // linearDeflection: 线性偏差，值越大面片越少（越粗糙），默认通常较小。设置为 0.1 左右可以显著减少面片数量。
            // angularDeflection: 角度偏差，弧度制。
            const params = {
                linearDeflection: 0.1,
                angularDeflection: 0.5
            };
            result = occt.ReadStepFile(fileContent, params);
        } catch (e) {
            console.warn('STEP 解析失败，尝试 IGES...', e);
        }

        if (!result || !result.success) {
            try {
                const params = {
                    linearDeflection: 0.1,
                    angularDeflection: 0.5
                };
                result = occt.ReadIgesFile(fileContent, params);
            } catch (e) {
                console.error('IGES 解析失败', e);
            }
        }

        if (!result || !result.success) {
            throw new Error(t('error_cad_parse_failed'));
        }

        if (onProgress) onProgress(70, t('creating_geometry'));

        const group = new THREE.Group();
        const material = new THREE.MeshPhongMaterial({ 
            color: 0xcccccc, 
            side: THREE.DoubleSide,
            flatShading: false,
            shininess: 30
        });

        for (const mesh of result.meshes) {
            let geometry = new THREE.BufferGeometry();
            
            // 顶点坐标
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3));
            
            // 法线
            if (mesh.attributes.normal) {
                geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3));
            } else {
                geometry.computeVertexNormals();
            }

            // 索引
            if (mesh.index) {
                geometry.setIndex(new THREE.Uint32BufferAttribute(mesh.index.array, 1));
            }

            const threeMaterial = material.clone();
            const threeMesh = new THREE.Mesh(geometry, threeMaterial);
            
            // 颜色解析：
            // 1) mesh.color：整块网格的颜色
            // 2) brep_faces[].color：按 B-Rep 面分配的颜色（需要落到顶点色/组）
            if (mesh.color) {
                const color = new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2]);
                (threeMesh.material as THREE.MeshPhongMaterial).color = color;
                threeMesh.userData.color = color.getHex();
            }

            const brepFaces: any[] | undefined = (mesh as any).brep_faces;
            if (Array.isArray(brepFaces) && brepFaces.some(f => Array.isArray(f?.color))) {
                geometry = geometry.toNonIndexed();
                const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
                const triCount = Math.floor(posAttr.count / 3);
                const colors = new Float32Array(posAttr.count * 3);

                const baseColor = new THREE.Color((threeMesh.material as THREE.MeshPhongMaterial).color.getHex());
                const triHex = new Uint32Array(triCount);
                triHex.fill(baseColor.getHex());

                for (const face of brepFaces) {
                    const first = Number(face?.first);
                    const last = Number(face?.last);
                    const c = face?.color;
                    if (!Number.isFinite(first) || !Number.isFinite(last) || !Array.isArray(c)) continue;
                    const faceColor = new THREE.Color(c[0], c[1], c[2]).getHex();
                    const start = Math.max(0, Math.min(triCount - 1, first));
                    const end = Math.max(0, Math.min(triCount - 1, last));
                    for (let tIdx = start; tIdx <= end; tIdx++) triHex[tIdx] = faceColor;
                }

                const tmp = new THREE.Color();
                for (let tri = 0; tri < triCount; tri++) {
                    tmp.setHex(triHex[tri]);
                    for (let v = 0; v < 3; v++) {
                        const vi = (tri * 3 + v);
                        const ci = vi * 3;
                        colors[ci + 0] = tmp.r;
                        colors[ci + 1] = tmp.g;
                        colors[ci + 2] = tmp.b;
                    }
                }

                geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
                threeMesh.geometry = geometry;
                (threeMesh.material as THREE.MeshPhongMaterial).vertexColors = true;
            }
            
            threeMesh.name = mesh.name || 'CAD Part';
            
            // 保存原始 CAD 元数据
            threeMesh.userData = {
                ...mesh.userData,
                ...threeMesh.userData,
                source: 'OCCT'
            };

            group.add(threeMesh);
        }

        if (onProgress) onProgress(100, t('model_loaded'));

        return group;
    }
}
