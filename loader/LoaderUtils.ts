import * as THREE from "three";
import { LMBLoader } from "./lmbLoader";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import * as WebIFC from "web-ifc";
import { TFunc } from "../utils/Locales";
import { SceneSettings, AxisOption } from "../SceneManager";

export interface LoadedItem {
    name: string;
    uuid: string;
    type: "MODEL" | "TILES";
    object?: THREE.Object3D;
}

export type ProgressCallback = (percent: number, msg?: string) => void;

// 辅助函数：纠正上轴到Y轴向上
const applyUpAxisCorrection = (object: THREE.Object3D, sourceAxis: AxisOption) => {
    // 我们假设目标是+Y轴向上（Three.js标准）
    const q = new THREE.Quaternion();
    
    switch (sourceAxis) {
        case '+x':
            // +X向上。我们需要X -> Y。绕Z轴旋转+90度。
            q.setFromAxisAngle(new THREE.Vector3(0,0,1), Math.PI/2);
            break;
        case '-x':
            // -X向上。我们需要-X -> Y。绕Z轴旋转-90度。
            q.setFromAxisAngle(new THREE.Vector3(0,0,1), -Math.PI/2);
            break;
        case '+y':
            // 已经是Y轴向上。
            return;
        case '-y':
            // -Y向上。绕X轴旋转180度。
            q.setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI);
            break;
        case '+z':
            // +Z向上（标准工程坐标）。绕X轴旋转-90度（右手坐标系）。
            q.setFromAxisAngle(new THREE.Vector3(1,0,0), -Math.PI/2);
            break;
        case '-z':
            // -Z向上。绕X轴旋转+90度。
            q.setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI/2);
            break;
    }

    object.applyQuaternion(q);
};

// --- 自定义原始Web-IFC加载逻辑 ---

// 辅助函数：IFC类型的基本颜色（因为我们没有使用重量级的标准处理器）
const getIfcColor = (typeName: string) => {
    switch (typeName) {
        case 'IFCWALL': return 0xEEEEEE;
        case 'IFCWALLSTANDARDCASE': return 0xEEEEEE;
        case 'IFCSLAB': return 0xAAAAAA;
        case 'IFCWINDOW': return 0x88CCFF;
        case 'IFCDOOR': return 0x8B4513;
        case 'IFCBEAM': return 0x666666;
        case 'IFCCOLUMN': return 0x666666;
        case 'IFCROOF': return 0x8B0000;
        default: return 0xCCCCCC;
    }
};

// WebIFC.IFCRELDEFINESBYPROPERTIES 枚举值，用于获取属性定义关系
const IFCRELDEFINESBYPROPERTIES = WebIFC.IFCRELDEFINESBYPROPERTIES;

const loadIFC = async (url: string, onProgress: ProgressCallback, t: TFunc): Promise<THREE.Group> => {
    const api = new WebIFC.IfcAPI();
    
    // 指向importmap中使用的CDN
    api.SetWasmPath("https://unpkg.com/web-ifc@0.0.53/", true);
    
    await api.Init();

    // 使用FileLoader获取文件数据以支持进度事件
    const loader = new THREE.FileLoader();
    loader.setResponseType('arraybuffer');
    
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        loader.load(
            url,
            (data) => resolve(data as ArrayBuffer),
            (event) => {
                if (event.total > 0) {
                    // 将0-100%的下载进度映射到总加载时间估计的0-30%
                    const percent = (event.loaded / event.total) * 100 * 0.3;
                    onProgress(percent, `${t("reading")}... ${Math.round((event.loaded / event.total) * 100)}%`);
                }
            },
            reject
        );
    });

    const data = new Uint8Array(buffer);

    onProgress(30, t("analyzing"));
    
    // 打开模型
    const modelID = api.OpenModel(data);
    
    const rootGroup = new THREE.Group();
    rootGroup.name = "IFC模型";
    
    // 1. 构建属性映射（对象ID -> [属性集ID, ...]）
    // 这允许在点击时快速查找属性，无需每次都迭代所有关系
    const propertyMap = new Map<number, number[]>();
    
    try {
        // 获取所有IFCRELDEFINESBYPROPERTIES类型的行
        // 我们使用IFCRELDEFINESBYPROPERTIES的数字ID（如果在枚举中可用），或者直接扫描
        // 由于没有导入完整的枚举，我们信任GetLineIDsWithType
        const relID = WebIFC.IFCRELDEFINESBYPROPERTIES; 
        const lines = api.GetLineIDsWithType(modelID, relID);
        const size = lines.size();
        
        for (let i = 0; i < size; i++) {
            const id = lines.get(i);
            const rel = api.GetLine(modelID, id);
            
            // rel.RelatedObjects是ID数组（或根据模式可能是单个引用，通常是数组）
            // rel.RelatingPropertyDefinition是属性集ID
            
            if (rel.RelatedObjects && Array.isArray(rel.RelatedObjects)) {
                const psetID = rel.RelatingPropertyDefinition?.value;
                if (psetID) {
                    rel.RelatedObjects.forEach((objRef: any) => {
                        const objID = objRef.value;
                        if (!propertyMap.has(objID)) propertyMap.set(objID, []);
                        propertyMap.get(objID)!.push(psetID);
                    });
                }
            }
        }
    } catch(e) {
        console.warn("无法构建属性映射", e);
    }

    // 附加自定义属性管理器
    rootGroup.userData.isIFC = true;
    rootGroup.userData.ifcAPI = api;
    rootGroup.userData.modelID = modelID;
    
    rootGroup.userData.ifcManager = {
        getItemProperties: async (id: number, expressID: number) => {
            const result: any = {};
            
            // 1. Get Direct Attributes
            try {
                const entity = api.GetLine(modelID, expressID);
                if (entity) {
                    result["GlobalId"] = entity.GlobalId?.value;
                    result["Name"] = entity.Name?.value;
                    result["Description"] = entity.Description?.value;
                    result["Tag"] = entity.Tag?.value;
                }
            } catch(e) {}

            // 2. 解析属性集
            const psetIDs = propertyMap.get(expressID);
            if (psetIDs) {
                for (const psetID of psetIDs) {
                    try {
                        const pset = api.GetLine(modelID, psetID);
                        if (pset && pset.HasProperties) {
                            // pset.HasProperties是属性ID数组
                            for (const propRef of pset.HasProperties) {
                                const propID = propRef.value;
                                const prop = api.GetLine(modelID, propID);
                                
                                // 处理IfcPropertySingleValue
                                if (prop && prop.Name && prop.NominalValue) {
                                    const key = prop.Name.value;
                                    const val = prop.NominalValue.value; 
                                    // 有时值是标签、布尔值或数字。
                                    // WebIFC返回类似{ type: 1, value: "..." }的对象或原始值
                                    
                                    // 简单展平
                                    result[key] = val; 
                                }
                            }
                        }
                    } catch(e) {}
                }
            }
            
            return result;
        },
        getExpressId: (geo: any, faceIndex: number) => {
            return geo.userData?.expressID;
        }
    };

    // 迭代网格
    onProgress(40, t("转换中"));
    
    let meshCount = 0;
    
    const materials: Record<string, THREE.MeshStandardMaterial> = {};
    const getMaterial = (color: number, opacity: number = 1) => {
        const key = `${color}-${opacity}`;
        if(!materials[key]) {
            materials[key] = new THREE.MeshStandardMaterial({
                color: color,
                transparent: opacity < 1,
                opacity: opacity,
                side: THREE.DoubleSide
            });
        }
        return materials[key];
    };

    const dummyMatrix = new THREE.Matrix4();

    api.StreamAllMeshes(modelID, (flatMesh: WebIFC.FlatMesh) => {
        const size = flatMesh.geometries.size();
        for (let i = 0; i < size; i++) {
            const placedGeom = flatMesh.geometries.get(i);
            const expressID = flatMesh.expressID;
            
            const geomID = placedGeom.geometryExpressID;
            const meshData = api.GetGeometry(modelID, geomID);
            
            const verts = api.GetVertexArray(meshData.GetVertexData(), meshData.GetVertexDataSize());
            const indices = api.GetIndexArray(meshData.GetIndexData(), meshData.GetIndexDataSize());
            
            const geometry = new THREE.BufferGeometry();
            
            const posFloats = new Float32Array(verts.length / 2);
            const normFloats = new Float32Array(verts.length / 2);
            
            for(let k=0; k<verts.length; k+=6) {
                posFloats[k/2] = verts[k];
                posFloats[k/2+1] = verts[k+1];
                posFloats[k/2+2] = verts[k+2];
                
                normFloats[k/2] = verts[k+3];
                normFloats[k/2+1] = verts[k+4];
                normFloats[k/2+2] = verts[k+5];
            }
            
            geometry.setAttribute('position', new THREE.BufferAttribute(posFloats, 3));
            geometry.setAttribute('normal', new THREE.BufferAttribute(normFloats, 3));
            geometry.setIndex(new THREE.BufferAttribute(indices, 1));
            
            // 在几何体上存储ExpressID以供选择逻辑使用
            geometry.userData = { expressID };

            const transform = placedGeom.flatTransformation; 
            dummyMatrix.fromArray(transform);
            
            // 从placedGeom中的颜色确定材质颜色
            const color = placedGeom.color; // {x, y, z, w}
            let material;
            if (color) {
                const hex = new THREE.Color(color.x, color.y, color.z).getHex();
                material = getMaterial(hex, color.w);
            } else {
                material = getMaterial(0xcccccc);
            }

            const mesh = new THREE.Mesh(geometry, material);
            mesh.matrixAutoUpdate = false;
            mesh.matrix.fromArray(transform);
            mesh.matrixWorldNeedsUpdate = true; 
            
            mesh.userData.expressID = expressID; 
            mesh.name = `IFC Item ${expressID}`; 
            
            rootGroup.add(mesh);
            meshCount++;
        }
    });

    console.log(`Loaded ${meshCount} meshes from IFC.`);
    onProgress(100, t("success"));
    
    return rootGroup;
};

export const loadModelFiles = async (
    files: FileList | File[], 
    onProgress: ProgressCallback, 
    t: TFunc,
    settings: SceneSettings // 传递当前设置以读取轴配置
): Promise<THREE.Group> => {
    // 我们创建一个包装器组来保存加载的模型。
    const container = new THREE.Group();
    container.name = "ImportedModels";

    const totalFiles = files.length;

    // 1. 加载所有文件
    for (let i = 0; i < totalFiles; i++) {
        const file = files[i];
        const ext = file.name.split('.').pop()?.toLowerCase();
        const url = URL.createObjectURL(file);
        
        const fileBaseProgress = (i / totalFiles) * 100;
        const fileWeight = 100 / totalFiles;

        const updateFileProgress = (p: number, msg?: string) => {
            const safeP = isNaN(p) ? 0 : Math.min(1, Math.max(0, p));
            // 如果子加载器提供消息，则使用它，否则使用默认值
            const status = msg || `${t("reading")} ${file.name}`;
            // 调整本地进度到全局权重
            onProgress(Math.round(fileBaseProgress + (safeP * fileWeight / 100)), status);
        };
        
        updateFileProgress(0);

        let object: THREE.Object3D | null = null;
        // 确定使用哪个轴设置
        let axisSetting: AxisOption = '+y';

        try {
                if (ext === 'lmb' || ext === 'lmbz') {
                    const loader = new LMBLoader();
                    object = await loader.loadAsync(url, (p) => updateFileProgress(p * 100));
                    axisSetting = '+y'; // LMB通常是Three.js原生的Y轴向上
                } else if (ext === 'glb' || ext === 'gltf') {
                    const loader = new GLTFLoader();
                    const gltf = await new Promise<any>((resolve, reject) => {
                        loader.load(url, resolve, (e) => {
                            if (e.total && e.total > 0) updateFileProgress(e.loaded / e.total * 100);
                            else updateFileProgress(50); 
                        }, reject);
                    });
                    object = gltf.scene;
                    axisSetting = settings.importAxisGLB;
                } else if (ext === 'ifc') {
                    object = await loadIFC(url, updateFileProgress, t);
                    axisSetting = settings.importAxisIFC;
                }

                if (object) {
                    object.name = file.name;
                    
                    // 应用轴向校正
                    applyUpAxisCorrection(object, axisSetting);

                    container.add(object);
                }
            } catch(e) {
                console.error(`加载${file.name}失败`, e);
            } finally {
                URL.revokeObjectURL(url);
            }
    }
    
    onProgress(100, t("analyzing"));

    // 2. 计算整个容器的世界边界
    // 这样做是为了找到加载数据的"全局中心"。
    container.updateMatrixWorld(true);
    const totalBox = new THREE.Box3();
    let hasContent = false;
    
    const tempMat = new THREE.Matrix4();

    container.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            
            // 优化：重新启用视锥体剔除
            mesh.frustumCulled = true;

            if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
            if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
            
            if (mesh.geometry.boundingBox) {
                // 处理实例化网格边界
                if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
                    const im = mesh as THREE.InstancedMesh;
                    const count = im.count;
                    // 采样实例以获得近似边界，避免在大型模型上冻结UI
                    const step = Math.max(1, Math.floor(count / 1000));
                    
                    for(let k=0; k<count; k+=step) {
                         im.getMatrixAt(k, tempMat);
                         // 将局部实例转换为世界坐标
                         tempMat.premultiply(im.matrixWorld);
                         const box = mesh.geometry.boundingBox.clone().applyMatrix4(tempMat);
                         totalBox.union(box);
                    }
                } 
                // 处理标准网格
                else {
                    const box = mesh.geometry.boundingBox.clone();
                    box.applyMatrix4(mesh.matrixWorld);
                    totalBox.union(box);
                }
                hasContent = true;
            }
        }
    });

    // 3. 居中模型（根偏移）
    // 而不是修改内部几何体（这会破坏层级结构/混乱），
    // 我们只需将容器移动到负中心。
    if (hasContent && !totalBox.isEmpty()) {
        const center = totalBox.getCenter(new THREE.Vector3());
        
        console.log("在以下位置找到全局中心：", center);
        
        if (center.lengthSq() > 100) { 
             // 存储偏移量以便稍后保存（用于导出）
             container.userData.originalCenter = center.clone();
             
             // 将容器相对于场景移动到(0,0,0)
             // 这保持了所有内部父子关系的完整性。
             // Three.js处理链式变换。
             container.position.copy(center).negate();
             
             // 强制更新矩阵，使新位置立即生效
             container.updateMatrixWorld(true);
             
             // 更新存储在userData上的边界框，以表示新的居中状态
             const centeredBox = totalBox.clone().translate(container.position);
             container.userData.boundingBox = centeredBox;
        } else {
             container.userData.boundingBox = totalBox;
        }
    }

    return container;
};

export const parseTilesetFromFolder = async (files: FileList, onProgress: ProgressCallback, t: TFunc): Promise<string | null> => {
    onProgress(10, t("分析中"));
    
    const fileMap = new Map<string, Blob>();
    let tilesetKey = "";

    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const pathParts = f.webkitRelativePath.split('/');
        const relPath = pathParts.slice(1).join('/'); 
        
        if (relPath) {
             fileMap.set(relPath, f);
             if (f.name === 'tileset.json') tilesetKey = relPath;
        } else {
             fileMap.set(f.name, f);
             if (f.name === 'tileset.json') tilesetKey = f.name;
        }
    }

    if (!tilesetKey && fileMap.has("tileset.json")) tilesetKey = "tileset.json";

    if (!tilesetKey) {
        throw new Error("在所选文件夹中未找到tileset.json");
    }

    onProgress(50, t("读取中"));

    const blobUrlMap = new Map<string, string>();
    fileMap.forEach((blob, path) => {
        blobUrlMap.set(path, URL.createObjectURL(blob));
    });

    const tilesetFile = fileMap.get(tilesetKey);
    if (!tilesetFile) return null;

    const text = await tilesetFile.text();
    const json = JSON.parse(text);

    const replaceUris = (node: any) => {
        if (node.content && node.content.uri) {
            const m = blobUrlMap.get(node.content.uri);
            if (m) node.content.uri = m;
        }
        if (node.children) node.children.forEach(replaceUris);
    };
    replaceUris(json.root);

    onProgress(100, t("成功"));
    const blob = new Blob([JSON.stringify(json)], { type: "application/json" });
    return URL.createObjectURL(blob);
};