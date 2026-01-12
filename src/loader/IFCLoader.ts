import * as THREE from "three";
import * as WebIFC from "web-ifc";
import { ProgressCallback, TFunc } from "../theme/Locales";

export const loadIFC = async (
    url: string, 
    onProgress: ProgressCallback, 
    t: TFunc,
    libPath: string = './libs'
): Promise<THREE.Group> => {
    // 初始化web-ifc API
    const ifcApi = new WebIFC.IfcAPI();
    
    // 设置WASM路径，使用相对路径以适配打包后的环境
    const wasmPath = libPath.endsWith('/') ? `${libPath}web-ifc/` : `${libPath}/web-ifc/`;
    ifcApi.SetWasmPath(wasmPath);
    
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
                    onProgress(downloadPercent, `${t("reading")}...`);
                } else {
                    // 如果无法获取总量，使用递增方式
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
        CIRCLE_SEGMENTS: 12,
        MEMORY_LIMIT: 1073741824 // 1GB
    });
    
    const rootGroup = new THREE.Group();
    rootGroup.name = "IFC模型";
    
    // 1. 构建属性映射表 (Object ID -> [PropertySet ID, ...])
    // 这样可以在点击时快速查找属性，无需每次遍历所有关系
    const propertyMap = new Map<number, number[]>();
    
    try {
        // 获取所有IFCRELDEFINESBYPROPERTIES类型的行
        // 由于我们没有导入完整的枚举，直接使用GetLineIDsWithType
        const relID = ifcApi.GetTypeCodeFromName('IFCRELDEFINESBYPROPERTIES');
        const lines = ifcApi.GetLineIDsWithType(modelID, relID);
        const size = lines.size();
        
        for (let i = 0; i < size; i++) {
            const id = lines.get(i);
            const rel = ifcApi.GetLine(modelID, id);
            
            // rel.RelatedObjects是ID数组（或单个引用，通常为数组）
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
        console.warn("无法构建属性映射表", e);
    }
    
    // 附加IFC相关的元数据
    rootGroup.userData.isIFC = true;
    rootGroup.userData.ifcAPI = ifcApi;
    rootGroup.userData.modelID = modelID;
    
    // --- 图层解析 ---
    const layerMap = new Map<number, string>();
    try {
        const layerType = ifcApi.GetTypeCodeFromName('IFCPRESENTATIONLAYERASSIGNMENT');
        const layers = ifcApi.GetLineIDsWithType(modelID, layerType);
        for (let i = 0; i < layers.size(); i++) {
            const id = layers.get(i);
            const layer = ifcApi.GetLine(modelID, id);
            const layerName = layer.Name?.value || `Layer_${id}`;
            if (layer.AssignedItems && Array.isArray(layer.AssignedItems)) {
                layer.AssignedItems.forEach((itemRef: any) => {
                    const itemID = itemRef.value;
                    layerMap.set(itemID, layerName);
                });
            }
        }
    } catch (e) {
        console.warn("无法构建图层映射表", e);
    }
    rootGroup.userData.layerMap = layerMap;

    // --- 空间结构解析优化 ---
    const nodesMap = new Map<number, THREE.Object3D>();
    nodesMap.set(0, rootGroup);

    // 预索引关系映射表，避免在递归中频繁查询 API 提升性能和准确性
    const aggregatesMap = new Map<number, number[]>(); // RelatingObject -> RelatedObjects[]
    const containmentMap = new Map<number, number[]>(); // RelatingStructure -> RelatedElements[]

    const buildIndices = () => {
        // 1. 索引分解关系 (IfcRelAggregates)
        const relDecomposes = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELAGGREGATES);
        for (let i = 0; i < relDecomposes.size(); i++) {
            const rel = ifcApi.GetLine(modelID, relDecomposes.get(i));
            const parentID = rel.RelatingObject.value;
            const children = rel.RelatedObjects.map((obj: any) => obj.value);
            
            if (!aggregatesMap.has(parentID)) aggregatesMap.set(parentID, []);
            aggregatesMap.get(parentID)!.push(...children);
        }

        // 2. 索引包含关系 (IfcRelContainedInSpatialStructure)
        const relContained = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
        for (let i = 0; i < relContained.size(); i++) {
            const rel = ifcApi.GetLine(modelID, relContained.get(i));
            const containerID = rel.RelatingStructure.value;
            const elements = rel.RelatedElements.map((el: any) => el.value);
            
            if (!containmentMap.has(containerID)) containmentMap.set(containerID, []);
            containmentMap.get(containerID)!.push(...elements);
        }
    };

    // 递归解析空间层级
    const parseSpatialRecursive = (expressID: number, parent: THREE.Object3D) => {
        const props = ifcApi.GetLine(modelID, expressID);
        if (!props) return;

        let currentParent = parent;
        
        // 识别所有的空间容器类型
        const spatialTypes = [
            'IFCPROJECT', 
            'IFCSITE', 
            'IFCBUILDING', 
            'IFCBUILDINGSTOREY', 
            'IFCSPACE',
            'IFCZONE'
        ];
        
        const isSpatialContainer = spatialTypes.includes(props.is_a);
        
        if (isSpatialContainer) {
            // 创建层级节点
            const name = props.Name?.value || props.LongName?.value || `${props.is_a} [${expressID}]`;
            const group = new THREE.Group();
            group.name = name;
            group.userData = { expressID, isSpatial: true, type: props.is_a };
            parent.add(group);
            currentParent = group;
            nodesMap.set(expressID, group);
        } else {
            // 如果不是空间容器（可能是嵌套的非空间组），则记录当前父级
            nodesMap.set(expressID, parent);
        }

        // A. 处理通过分解关系连接的子空间/子对象
        const children = aggregatesMap.get(expressID);
        if (children) {
            for (const childID of children) {
                parseSpatialRecursive(childID, currentParent);
            }
        }

        // B. 处理直接包含在该空间结构下的所有物理构件
        const elements = containmentMap.get(expressID);
        if (elements) {
            for (const elementID of elements) {
                // 构件可能还会进一步分解（例如 Curtain Wall 分解为 Panels 和 Mullions）
                // 所以对构件也进行递归解析，以捕获其可能的子零件
                parseSpatialRecursive(elementID, currentParent);
            }
        }
    };

    const loadSpatialStructure = () => {
        try {
            buildIndices(); // 先构建全局索引
            
            // 从 IfcProject 开始递归
            const projects = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
            if (projects.size() > 0) {
                for (let i = 0; i < projects.size(); i++) {
                    parseSpatialRecursive(projects.get(i), rootGroup);
                }
            } else {
                // 如果没有 IfcProject (非标准文件)，尝试从所有 IfcSite 或 IfcBuilding 开始
                const sites = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCSITE);
                for (let i = 0; i < sites.size(); i++) {
                    parseSpatialRecursive(sites.get(i), rootGroup);
                }
            }
        } catch (e) {
            console.error("解析 IFC 完整空间结构失败:", e);
        }
    };

    loadSpatialStructure();
    // --- 空间结构解析结束 ---

    // 属性名称映射 - 提供更友好的显示名称
    const propertyNameMap: Record<string, string> = {
        // 基本属性
        'GlobalId': '全局ID',
        'Name': '名称',
        'Description': '描述',
        'ObjectType': '对象类型',
        'Tag': '标签',
        'LongName': '长名称',
        'CompositionType': '组成类型',
        'PredefinedType': '预定义类型',
        
        // 几何属性
        'ObjectPlacement': '对象位置',
        'Representation': '几何表示',
        'Style': '样式',
        
        // 材料相关
        'Material': '材料',
        'Finish': '表面处理',
        'Color': '颜色',
        'Transparency': '透明度',
        
        // 尺寸属性
        'Width': '宽度',
        'Height': '高度',
        'Depth': '深度',
        'Length': '长度',
        'Thickness': '厚度',
        'Area': '面积',
        'Volume': '体积',
        'Perimeter': '周长',
        
        // 状态属性
        'Status': '状态',
        'FireRating': '防火等级',
        'AcousticRating': '声学等级',
        'ThermalTransmittance': '热传导系数',
        'IsExternal': '是否外部',
        'LoadBearing': '是否承重',
        'Reference': '参考',
        
        // 系统属性
        'ElementType': '元素类型',
        'AssemblyPlace': '装配位置',
        'Construction': '构造',
        'FootingType': '基础类型',
        'SurfaceType': '表面类型'
    };

    // 获取友好的属性名称
    const getFriendlyName = (name: string): string => {
        // 首先检查映射表
        if (propertyNameMap[name]) {
            return propertyNameMap[name];
        }
        
        // 对于没有映射的属性，尝试转换
        // 移除常见前缀
        let cleanName = name.replace(/^(is|has|are)_/i, '');
        
        // 驼峰转中文
        const camelToChinese = (str: string) => {
            return str
                .replace(/([A-Z])/g, ' $1')
                .replace(/^ /, '')
                .split(' ')
                .map((word, index) => {
                    // 简单的英文到中文映射
                    const simpleMap: Record<string, string> = {
                        'Id': 'ID',
                        'Type': '类型',
                        'Name': '名称',
                        'Value': '值',
                        'Code': '代码',
                        'Number': '编号',
                        'Date': '日期',
                        'Time': '时间',
                        'Area': '面积',
                        'Length': '长度',
                        'Width': '宽度',
                        'Height': '高度',
                        'Volume': '体积',
                        'Weight': '重量',
                        'Status': '状态',
                        'Level': '标高',
                        'Floor': '楼层',
                        'Room': '房间',
                        'Space': '空间',
                        'Building': '建筑',
                        'Story': '层',
                        'Zone': '区域',
                        'System': '系统',
                        'Group': '组',
                        'Set': '集',
                        'Property': '属性',
                        'Material': '材料',
                        'Element': '元素',
                        'Component': '组件',
                        'Assembly': '装配',
                        'Construction': '构造',
                        'Profile': '轮廓',
                        'Shape': '形状',
                        'Geometry': '几何',
                        'Position': '位置',
                        'Location': '位置',
                        'Coordinate': '坐标',
                        'Point': '点',
                        'Line': '线',
                        'Surface': '表面',
                        'Face': '面',
                        'Edge': '边',
                        'Vertex': '顶点'
                    };
                    
                    return simpleMap[word] || word;
                })
                .join('');
        };
        
        return camelToChinese(cleanName);
    };

    // 格式化属性值显示
    const formatDisplayValue = (value: any): any => {
        if (value === null || value === undefined) return '';
        if (value === '') return '';
        
        // 如果是对象且有value属性，提取value
        if (typeof value === 'object' && value !== null) {
            if (value.value !== undefined) {
                return formatDisplayValue(value.value);
            }
            if (Array.isArray(value)) {
                return value
                    .map(item => formatDisplayValue(item))
                    .filter(v => v !== null && v !== undefined && v !== '')
                    .join(', ');
            }
            // 尝试扁平化简单对象
            if (Object.keys(value).length <= 3) {
                return Object.entries(value)
                    .map(([k, v]) => `${k}: ${formatDisplayValue(v)}`)
                    .join(', ');
            }
            // 复杂对象返回JSON字符串
            try {
                return JSON.stringify(value, null, 2);
            } catch {
                return String(value);
            }
        }
        
        // 布尔值显示
        if (typeof value === 'boolean') {
            return value ? '是' : '否';
        }
        
        // 数字格式化
        if (typeof value === 'number') {
            // 如果是整数，不显示小数点
            if (Number.isInteger(value)) {
                return value.toString();
            }
            // 浮点数保留合理精度
            return parseFloat(value.toFixed(3)).toString();
        }
        
        // 字符串清理
        if (typeof value === 'string') {
            // 去除多余空格
            const cleaned = value.trim();
            // 如果是GUID格式，保持原样
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleaned)) {
                return cleaned;
            }
            return cleaned;
        }
        
        return String(value);
    };

    // 扁平化属性对象并格式化
    const flattenAndFormatProperties = (obj: any, category: string = ''): any => {
        const result: any = {};
        
        Object.keys(obj).forEach(key => {
            if (['expressID', 'is_a', 'type', 'ID', 'Name', 'GlobalId'].includes(key)) return;
            
            const value = obj[key];
            const displayKey = getFriendlyName(key);
            const categoryPrefix = category ? `${category}.` : '';
            
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // 递归处理嵌套对象
                const nested = flattenAndFormatProperties(value, categoryPrefix + displayKey);
                Object.assign(result, nested);
            } else {
                // 扁平化键值对
                const fullKey = categoryPrefix + displayKey;
                result[fullKey] = formatDisplayValue(value);
            }
        });
        
        return result;
    };

    // 附加自定义属性管理器
    rootGroup.userData.ifcManager = {
        getItemProperties: async (id: number, expressID: number) => {
            const result: any = {};
            
            // 1. 获取直接属性
            try {
                const entity = ifcApi.GetLine(modelID, expressID);
                if (entity) {
                    result["ExpressID"] = expressID;
                    result["类型"] = entity.is_a || 'Unknown';
                    result["全局ID"] = entity.GlobalId?.value || '';
                    result["名称"] = entity.Name?.value || '';
                    result["描述"] = entity.Description?.value || '';
                    result["标签"] = entity.Tag?.value || '';
                    
                    // 添加其他基本属性
                    Object.keys(entity).forEach(key => {
                        if (['expressID', 'is_a', 'type', 'ID', 'GlobalId', 'Name', 'Description', 'Tag'].includes(key)) return;
                        const value = formatDisplayValue(entity[key]);
                        if (value !== '' && value !== null && value !== undefined) {
                            result[getFriendlyName(key)] = value;
                        }
                    });
                }
            } catch(e) {
                console.warn("获取实体属性失败", e);
            }

            // 2. 解析属性集 - 使用预构建的属性映射表
            const psetIDs = propertyMap.get(expressID);
            if (psetIDs) {
                for (const psetID of psetIDs) {
                    try {
                        const pset = ifcApi.GetLine(modelID, psetID);
                        if (pset && pset.HasProperties) {
                            const psetName = getFriendlyName(pset.Name?.value || `属性集_${psetID}`);
                            result[`${psetName}.类型`] = pset.is_a;
                            
                            if (pset.Description?.value) {
                                result[`${psetName}.描述`] = formatDisplayValue(pset.Description.value);
                            }
                            
                            // pset.HasProperties是属性ID数组
                            for (const propRef of pset.HasProperties) {
                                const propID = propRef.value;
                                const prop = ifcApi.GetLine(modelID, propID);
                                
                                // 处理IfcPropertySingleValue
                                if (prop && prop.Name && prop.NominalValue) {
                                    const key = getFriendlyName(prop.Name.value);
                                    let val = prop.NominalValue.value; 
                                    
                                    // 处理不同类型的值
                                    if (typeof val === 'object' && val !== null) {
                                        if (val.value !== undefined) {
                                            val = val.value;
                                        } else {
                                            // 处理特殊对象类型
                                            if (Array.isArray(val)) {
                                                val = val.map(v => v?.value || v).join(', ');
                                            } else {
                                                val = formatDisplayValue(val);
                                            }
                                        }
                                    } else {
                                        val = formatDisplayValue(val);
                                    }
                                    
                                    result[`${psetName}.${key}`] = val; 
                                }
                            }
                        }
                        
                        // 处理数量属性
                        if (pset && pset.Quantities) {
                            const psetName = getFriendlyName(pset.Name?.value || `属性集_${psetID}`);
                            pset.Quantities.forEach((quant: any) => {
                                if (quant.Name) {
                                    const quantName = getFriendlyName(quant.Name.value);
                                    
                                    // 检查各种数值类型
                                    const valueTypes = [
                                        { key: 'LengthValue', name: '长度' },
                                        { key: 'AreaValue', name: '面积' },
                                        { key: 'VolumeValue', name: '体积' },
                                        { key: 'CountValue', name: '数量' },
                                        { key: 'WeightValue', name: '重量' },
                                        { key: 'TimeValue', name: '时间' }
                                    ];
                                    
                                    for (const valType of valueTypes) {
                                        if (quant[valType.key] && quant[valType.key].value !== undefined) {
                                            result[`${psetName}.数量.${quantName}.${valType.name}`] = formatDisplayValue(quant[valType.key].value);
                                        }
                                    }
                                    
                                    if (quant.Description?.value) {
                                        result[`${psetName}.数量.${quantName}.描述`] = formatDisplayValue(quant.Description.value);
                                    }
                                }
                            });
                        }
                    } catch(e) {
                        console.warn(`解析属性集${psetID}失败`, e);
                    }
                }
            }
            
            return result;
        },
        
        getExpressId: (geo: any, faceIndex: number) => {
            return geo.userData?.expressID;
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
            
            // 附加图层信息
            if (layerMap.has(expressID)) {
                mesh.userData.layer = layerMap.get(expressID);
            }
            
            // 优化构件名称：获取真实的 IFC 类型作为名称前缀
            try {
                const props = ifcApi.GetLine(modelID, expressID);
                const ifcType = props.is_a || 'Item';
                const ifcName = props.Name?.value || '';
                mesh.name = ifcName ? `${ifcType}: ${ifcName}` : `${ifcType} [${expressID}]`;
            } catch(e) {
                mesh.name = `IFC Item ${expressID}`; 
            }
            
            // 将构件挂载到对应的空间层级节点下
            const parentGroup = nodesMap.get(expressID) || rootGroup;
            parentGroup.add(mesh);
            
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
    
    // Apply axis correction (-Z-up to Y-up as requested by user)
    rootGroup.rotateX(Math.PI / 2);

    return rootGroup;
};