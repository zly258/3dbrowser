import * as THREE from "three";
import * as WebIFC from "web-ifc";
import { ProgressCallback, TFunc } from "../theme/Locales";

export const loadIFC = async (
    url: string, 
    onProgress: ProgressCallback, 
    t: TFunc
): Promise<THREE.Group> => {
    // 初始化web-ifc API
    const ifcApi = new WebIFC.IfcAPI();
    
    // 设置WASM路径为public目录
    ifcApi.SetWasmPath('/');
    
    await ifcApi.Init();
    
    // 声明静态变量用于进度显示
    let staticDownloadCounter = 0;
    
    // 使用FileLoader获取文件数据以支持进度事件
    const loader = new THREE.FileLoader();
    loader.setResponseType('arraybuffer');
    
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        loader.load(
            url,
            (data) => resolve(data as ArrayBuffer),
            (event) => {
                if (event.total > 0) {
                    const downloadPercent = (event.loaded / event.total) * 100;
                    // 下载阶段显示实际下载进度，不限制在40%
                    onProgress(downloadPercent, `${t("reading")}... ${Math.round(downloadPercent)}%`);
                } else {
                    // 如果无法获取total，使用递增方式
                    staticDownloadCounter = (staticDownloadCounter || 0) + 5;
                    onProgress(Math.min(35, staticDownloadCounter), `${t("reading")}...`);
                }
            },
            reject
        );
    });

    const data = new Uint8Array(buffer);

    onProgress(30, t("analyzing"));
    
    // 打开模型 - 传入配置对象
    const modelID = ifcApi.OpenModel(data, {
        COORDINATE_TO_ORIGIN: true,
        USE_FAST_BOOLEANS: true
    });
    
    const rootGroup = new THREE.Group();
    rootGroup.name = "IFC模型";
    
    // 附加IFC相关的元数据
    rootGroup.userData.isIFC = true;
    rootGroup.userData.ifcAPI = ifcApi;
    rootGroup.userData.modelID = modelID;
    
    // 创建增强的属性管理器
    rootGroup.userData.ifcManager = {
        getItemProperties: async (id: number, expressID: number) => {
            const result: any = {};
            
            try {
                // 1. 获取对象的基本属性
                const line = ifcApi.GetLine(modelID, expressID);
                if (line) {
                    Object.keys(line).forEach(key => {
                        if (['type', 'ID'].includes(key)) return;
                        
                        let value = line[key];
                        if (typeof value === 'object' && value !== null) {
                            if (value.value !== undefined) {
                                value = value.value;
                            } else if (Array.isArray(value)) {
                                value = value.map(item => 
                                    item && item.value ? item.value : item
                                ).join(', ');
                            }
                        }
                        
                        if (value !== null && value !== undefined && value !== '') {
                            result[key] = value;
                        }
                    });
                }
                
                // 2. 获取属性集 - 使用更高效的方式
                try {
                    // 获取与当前对象关联的所有属性关系
                    const propertyRelations = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
                    const relSize = propertyRelations.size();
                    
                    for (let i = 0; i < relSize; i++) {
                        const relID = propertyRelations.get(i);
                        const rel = ifcApi.GetLine(modelID, relID);
                        
                        if (rel && rel.RelatedObjects && Array.isArray(rel.RelatedObjects)) {
                            const relatesToCurrent = rel.RelatedObjects.some((objRef: any) => 
                                objRef.value === expressID
                            );
                            
                            if (relatesToCurrent && rel.RelatingPropertyDefinition) {
                                const psetID = rel.RelatingPropertyDefinition.value;
                                const pset = ifcApi.GetLine(modelID, psetID);
                                
                                if (pset && pset.is_a === 'IFCPROPERTYSET') {
                                    const psetName = pset.Name ? pset.Name.value : `属性集_${psetID}`;
                                    
                                    // 处理普通属性
                                    if (pset.HasProperties && Array.isArray(pset.HasProperties)) {
                                        for (const propRef of pset.HasProperties) {
                                            if (propRef && propRef.value) {
                                                try {
                                                    const prop = ifcApi.GetLine(modelID, propRef.value);
                                                    if (prop && prop.is_a === 'IFCPROPERTY' && prop.Name && prop.NominalValue !== undefined) {
                                                        const propName = prop.Name.value;
                                                        let propValue = prop.NominalValue;
                                                        
                                                        if (typeof propValue === 'object' && propValue !== null && propValue.value !== undefined) {
                                                            propValue = propValue.value;
                                                        }
                                                        
                                                        result[`${psetName}.${propName}`] = propValue;
                                                    }
                                                } catch (e) {
                                                    console.warn(`读取属性 ${propRef.value} 失败`, e);
                                                }
                                            }
                                        }
                                    }
                                    
                                    // 处理数量属性
                                    if (pset.Quantities && Array.isArray(pset.Quantities)) {
                                        for (const quantRef of pset.Quantities) {
                                            if (quantRef && quantRef.value) {
                                                try {
                                                    const quantity = ifcApi.GetLine(modelID, quantRef.value);
                                                    if (quantity && quantity.Name && quantity.Name.value) {
                                                        const quantName = quantity.Name.value;
                                                        let quantValue = '';
                                                        
                                                        // 尝试获取不同类型的数量值
                                                        if (quantity.LengthValue && quantity.LengthValue.value !== undefined) {
                                                            quantValue = quantity.LengthValue.value;
                                                        } else if (quantity.AreaValue && quantity.AreaValue.value !== undefined) {
                                                            quantValue = quantity.AreaValue.value;
                                                        } else if (quantity.VolumeValue && quantity.VolumeValue.value !== undefined) {
                                                            quantValue = quantity.VolumeValue.value;
                                                        } else if (quantity.Value && quantity.Value.value !== undefined) {
                                                            quantValue = quantity.Value.value;
                                                        }
                                                        
                                                        result[`${psetName}.数量.${quantName}`] = quantValue;
                                                    }
                                                } catch (e) {
                                                    console.warn(`读取数量属性 ${quantRef.value} 失败`, e);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`获取属性集失败`, e);
                }
                
                // 3. 获取类型属性
                try {
                    const typeRelations = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYTYPE);
                    const typeSize = typeRelations.size();
                    
                    for (let i = 0; i < typeSize; i++) {
                        const relID = typeRelations.get(i);
                        const rel = ifcApi.GetLine(modelID, relID);
                        
                        if (rel && rel.RelatingType && rel.RelatedObjects && Array.isArray(rel.RelatedObjects)) {
                            const relatesToCurrent = rel.RelatedObjects.some((objRef: any) => 
                                objRef.value === expressID
                            );
                            
                            if (relatesToCurrent) {
                                const typeId = rel.RelatingType.value;
                                const typeObj = ifcApi.GetLine(modelID, typeId);
                                
                                if (typeObj) {
                                    const typeName = typeObj.Name ? typeObj.Name.value : typeObj.is_a || `类型_${typeId}`;
                                    result[`类型.${typeName}`] = typeObj.is_a || typeName;
                                    
                                    // 获取类型对象的额外属性
                                    Object.keys(typeObj).forEach(key => {
                                        if (['type', 'ID', 'Name', 'is_a'].includes(key)) return;
                                        
                                        let value = typeObj[key];
                                        if (typeof value === 'object' && value !== null) {
                                            if (value.value !== undefined) {
                                                value = value.value;
                                            }
                                        }
                                        
                                        if (value !== null && value !== undefined && value !== '') {
                                            result[`类型.${typeName}.${key}`] = value;
                                        }
                                    });
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`获取类型属性失败`, e);
                }
                
                // 4. 获取材料信息
                try {
                    const materialRelations = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELASSIGNSTOPRODUCT);
                    const matSize = materialRelations.size();
                    
                    for (let i = 0; i < matSize; i++) {
                        const relID = materialRelations.get(i);
                        const rel = ifcApi.GetLine(modelID, relID);
                        
                        if (rel && rel.RelatingMaterial && rel.RelatedObjects && Array.isArray(rel.RelatedObjects)) {
                            const relatesToCurrent = rel.RelatedObjects.some((objRef: any) => 
                                objRef.value === expressID
                            );
                            
                            if (relatesToCurrent) {
                                const materialId = rel.RelatingMaterial.value;
                                const material = ifcApi.GetLine(modelID, materialId);
                                
                                if (material) {
                                    const materialName = material.Name ? material.Name.value : `材料_${materialId}`;
                                    result[`材料.${materialName}`] = material.is_a || materialName;
                                    
                                    if (material.Description && material.Description.value) {
                                        result[`材料.${materialName}.描述`] = material.Description.value;
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`获取材料信息失败`, e);
                }
                
                // 5. 获取空间结构信息
                try {
                    const spatialRelations = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
                    const spatialSize = spatialRelations.size();
                    
                    for (let i = 0; i < spatialSize; i++) {
                        const relID = spatialRelations.get(i);
                        const rel = ifcApi.GetLine(modelID, relID);
                        
                        if (rel && rel.RelatingStructure && rel.RelatedElements && Array.isArray(rel.RelatedElements)) {
                            const relatesToCurrent = rel.RelatedElements.some((elemRef: any) => 
                                elemRef.value === expressID
                            );
                            
                            if (relatesToCurrent) {
                                const structureId = rel.RelatingStructure.value;
                                const structure = ifcApi.GetLine(modelID, structureId);
                                
                                if (structure && structure.Name) {
                                    const structureName = structure.Name.value;
                                    result[`空间结构.${structureName}`] = structure.is_a || structureName;
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`获取空间结构信息失败`, e);
                }
                
            } catch (e) {
                console.error(`获取IFC属性时发生错误`, e);
            }
            
            return result;
        }
    };

    onProgress(50, t("building_geometry"));
    
    let meshCount = 0;
    let expectedTotal = 0;
    
    // 材料缓存
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

    ifcApi.StreamAllMeshes(modelID, (flatMesh: WebIFC.FlatMesh) => {
        const size = flatMesh.geometries.size();
        expectedTotal += size;
        for (let i = 0; i < size; i++) {
            const placedGeom = flatMesh.geometries.get(i);
            const expressID = flatMesh.expressID;
            
            const geomID = placedGeom.geometryExpressID;
            const meshData = ifcApi.GetGeometry(modelID, geomID);
            
            const verts = ifcApi.GetVertexArray(meshData.GetVertexData(), meshData.GetVertexDataSize());
            const indices = ifcApi.GetIndexArray(meshData.GetIndexData(), meshData.GetIndexDataSize());
            
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
            
            if (expectedTotal > 0) {
                const ratio = Math.min(1, meshCount / expectedTotal);
                const p = 50 + Math.floor(ratio * 45);
                onProgress(p, t("building_geometry"));
            }
        }
    });

    console.log(`Loaded ${meshCount} meshes from IFC.`);
    onProgress(100, t("success"));
    
    return rootGroup;
};