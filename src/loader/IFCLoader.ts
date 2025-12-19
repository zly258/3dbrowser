import * as THREE from "three";
import * as WebIFC from "web-ifc";
import { ProgressCallback, TFunc } from "../theme/Locales";

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

export const loadIFC = async (
    url: string, 
    onProgress: ProgressCallback, 
    t: TFunc
): Promise<THREE.Group> => {
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
            
            // 获取对象的属性集ID列表
            const psetIDs = propertyMap.get(expressID) || [];
            
            for (const psetID of psetIDs) {
                try {
                    const pset = api.GetLine(modelID, psetID);
                    
                    // 如果pset有属性，读取它们
                    if (pset.HasProperties) {
                        for (const propRef of pset.HasProperties) {
                            const prop = api.GetLine(modelID, propRef.value);
                            
                            // 检查是否是IFCPROPERTYSET里的IFCPROPERTY
                            if (prop.Name && prop.NominalValue) {
                                const name = prop.Name.value;
                                let value = prop.NominalValue;
                                
                                // WebIFC返回类似{ type: 1, value: "..." }的对象或原始值
                                const actualValue = typeof value === 'object' && value !== null ? value.value : value;
                                
                                result[name] = actualValue;
                            }
                        }
                    }
                } catch(e) {
                    console.warn(`读取属性集 ${psetID} 失败`, e);
                }
            }
            
            return result;
        }
    };

    onProgress(50, t("building_geometry"));
    
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