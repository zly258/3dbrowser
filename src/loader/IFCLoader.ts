import * as THREE from "three";
import { ProgressCallback, TFunc } from "../theme/Locales";

type IfcRuntime = {
    ifcApi: any;
    WebIFC: any;
    wasmPath: string;
};

let cachedIfcRuntimePromise: Promise<IfcRuntime> | null = null;
let cachedIfcRuntimePath = "";
const ifcTypeCodeCache = new Map<string, number>();

function getIfcWasmPath(libPath: string) {
    return libPath.endsWith("/") ? `${libPath}web-ifc/` : `${libPath}/web-ifc/`;
}

async function getIfcRuntime(libPath: string): Promise<IfcRuntime> {
    const wasmPath = getIfcWasmPath(libPath);
    if (cachedIfcRuntimePromise && cachedIfcRuntimePath === wasmPath) {
        return cachedIfcRuntimePromise;
    }

    cachedIfcRuntimePath = wasmPath;
    cachedIfcRuntimePromise = (async () => {
        const WebIFC = await import("web-ifc");
        const ifcApi = new WebIFC.IfcAPI();
        ifcApi.SetWasmPath(wasmPath);
        await ifcApi.Init();
        ifcTypeCodeCache.clear();
        return { ifcApi, WebIFC, wasmPath };
    })();

    return cachedIfcRuntimePromise;
}

function getIfcTypeCode(ifcApi: any, typeName: string) {
    const cached = ifcTypeCodeCache.get(typeName);
    if (cached !== undefined) return cached;
    const typeCode = ifcApi.GetTypeCodeFromName(typeName);
    ifcTypeCodeCache.set(typeName, typeCode);
    return typeCode;
}

function resolveExpressId(ref: any): number | undefined {
    if (typeof ref === "number" && Number.isFinite(ref)) return ref;
    if (ref && typeof ref === "object" && typeof ref.value === "number") return ref.value;
    return undefined;
}

function toExpressIds(value: any): number[] {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value
            .map(resolveExpressId)
            .filter((id): id is number => typeof id === "number");
    }

    if (typeof value.size === "function" && typeof value.get === "function") {
        const ids: number[] = [];
        for (let index = 0; index < value.size(); index++) {
            const id = resolveExpressId(value.get(index));
            if (typeof id === "number") ids.push(id);
        }
        return ids;
    }

    const id = resolveExpressId(value);
    return typeof id === "number" ? [id] : [];
}

function uniqueStrings(values: Array<string | undefined | null>) {
    return Array.from(
        new Set(
            values
                .map((value) => (typeof value === "string" ? value.trim() : ""))
                .filter(Boolean)
        )
    );
}

export const loadIFC = async (
    input: string | File | ArrayBuffer,
    onProgress: ProgressCallback, 
    t: TFunc,
    libPath: string = './libs'
): Promise<THREE.Group> => {
    // web-ifc 运行时按 wasmPath 懒加载并复用，避免重复 Init 开销
    const { ifcApi, WebIFC } = await getIfcRuntime(libPath);
    
    let buffer: ArrayBuffer;
    if (typeof input !== "string") {
        if (input instanceof ArrayBuffer) {
            buffer = input;
        } else {
            onProgress(5, `${t("reading")}...`);
            buffer = await input.arrayBuffer();
            onProgress(25, `${t("reading")}...`);
        }
    } else {
        const loader = new THREE.FileLoader();
        loader.setResponseType("arraybuffer");
        let staticReadCounter = 0;
        buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
            loader.load(
                input,
                (data) => resolve(data as ArrayBuffer),
                (event) => {
                    if (event.total > 0) {
                        const readPercent = (event.loaded / event.total) * 100;
                        onProgress(readPercent, `${t("reading")}...`);
                    } else {
                        staticReadCounter = staticReadCounter + 5;
                        onProgress(Math.min(35, staticReadCounter), `${t("reading")}...`);
                    }
                },
                reject
            );
        });
    }

    const data = new Uint8Array(buffer);

    onProgress(30, t("analyzing"));
    
    // 打开模型 - 传入配置对象
    const modelID = ifcApi.OpenModel(data, {
        COORDINATE_TO_ORIGIN: true,
        CIRCLE_SEGMENTS: 12,
        MEMORY_LIMIT: 1073741824 // 1GB（内存限制）
    });
    
    const rootGroup = new THREE.Group();
    rootGroup.name = "IFC模型";
    
    const propertyMap = new Map<number, number[]>();
    const typePropertyMap = new Map<number, number[]>();
    const typeAssignmentMap = new Map<number, number>();
    const layerMap = new Map<number, string>();
    const classificationMap = new Map<number, string[]>();
    const materialMap = new Map<number, string[]>();
    const systemMap = new Map<number, string[]>();
    const spatialMetaMap = new Map<number, { storey: string; path: string[]; container: string }>();
    const lineCache = new Map<number, any>();
    const getLineCached = (expressID: number) => {
        if (lineCache.has(expressID)) return lineCache.get(expressID);
        const line = ifcApi.GetLine(modelID, expressID);
        lineCache.set(expressID, line);
        return line;
    };

    const buildPropertyMap = () => {
        try {
            const relID = getIfcTypeCode(ifcApi, 'IFCRELDEFINESBYPROPERTIES');
            const lines = ifcApi.GetLineIDsWithType(modelID, relID);
            const size = lines.size();
            
            for (let i = 0; i < size; i++) {
                const id = lines.get(i);
                const rel = getLineCached(id);
                
                if (rel?.RelatedObjects && Array.isArray(rel.RelatedObjects)) {
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
    };

    const buildTypeAssignments = () => {
        try {
            const relID = getIfcTypeCode(ifcApi, "IFCRELDEFINESBYTYPE");
            const lines = ifcApi.GetLineIDsWithType(modelID, relID);
            for (let i = 0; i < lines.size(); i++) {
                const rel = getLineCached(lines.get(i));
                const typeId = resolveExpressId(rel?.RelatingType);
                if (!typeId) continue;

                toExpressIds(rel?.RelatedObjects).forEach((objID) => {
                    typeAssignmentMap.set(objID, typeId);
                });

                const typeEntity = getLineCached(typeId);
                toExpressIds(typeEntity?.HasPropertySets).forEach((psetID) => {
                    if (!typePropertyMap.has(typeId)) typePropertyMap.set(typeId, []);
                    typePropertyMap.get(typeId)!.push(psetID);
                });
            }
        } catch (e) {
            console.warn("无法构建类型属性映射表", e);
        }
    };

    const buildLayerMap = () => {
        try {
            const layerType = getIfcTypeCode(ifcApi, 'IFCPRESENTATIONLAYERASSIGNMENT');
            const layers = ifcApi.GetLineIDsWithType(modelID, layerType);
            for (let i = 0; i < layers.size(); i++) {
                const id = layers.get(i);
                const layer = getLineCached(id);
                const layerName = layer?.Name?.value || `Layer_${id}`;
                if (layer?.AssignedItems && Array.isArray(layer.AssignedItems)) {
                    layer.AssignedItems.forEach((itemRef: any) => {
                        const itemID = itemRef.value;
                        layerMap.set(itemID, layerName);
                    });
                }
            }
        } catch (e) {
            console.warn("无法构建图层映射表", e);
        }
    };

    const getClassificationLabel = (classification: any): string | null => {
        if (!classification) return null;
        const raw = typeof classification === "number" ? getLineCached(classification) : classification;
        if (!raw) return null;

        const identification =
            raw.Identification?.value ||
            raw.ItemReference?.value ||
            raw.Reference?.value ||
            "";
        const name = raw.Name?.value || raw.Description?.value || raw.Source?.value || "";
        const parts = uniqueStrings([identification, name]);
        return parts.length > 0 ? parts.join(" - ") : raw.is_a || null;
    };

    const buildClassificationMap = () => {
        try {
            const relID = getIfcTypeCode(ifcApi, "IFCRELASSOCIATESCLASSIFICATION");
            const lines = ifcApi.GetLineIDsWithType(modelID, relID);
            for (let i = 0; i < lines.size(); i++) {
                const rel = getLineCached(lines.get(i));
                const relatedClassificationId = resolveExpressId(rel?.RelatingClassification);
                const relatedClassification = relatedClassificationId
                    ? getLineCached(relatedClassificationId)
                    : rel?.RelatingClassification;
                const label = getClassificationLabel(relatedClassification);
                if (!label) continue;
                toExpressIds(rel?.RelatedObjects).forEach((objID) => {
                    if (!classificationMap.has(objID)) classificationMap.set(objID, []);
                    classificationMap.get(objID)!.push(label);
                });
            }
        } catch (e) {
            console.warn("无法构建分类映射表", e);
        }
    };

    const extractMaterialNames = (source: any, visited = new Set<number>()): string[] => {
        if (!source) return [];
        const sourceId = resolveExpressId(source);
        const line = typeof source === "number" || source?.value !== undefined
            ? getLineCached(sourceId!)
            : source;

        if (sourceId && visited.has(sourceId)) return [];
        if (sourceId) visited.add(sourceId);
        if (!line) return [];

        const baseNames = uniqueStrings([
            line.Name?.value,
            line.LayerSetName?.value,
            line.Category?.value
        ]);

        const nestedKeys = ["Materials", "MaterialLayers", "MaterialProfiles", "MaterialConstituents"];
        const nestedNames = nestedKeys.flatMap((key) =>
            toExpressIds(line[key]).flatMap((id) => extractMaterialNames(id, visited))
        );

        const singleRefs = [line.ForLayerSet, line.ForProfileSet, line.Material]
            .map(resolveExpressId)
            .filter((id): id is number => typeof id === "number")
            .flatMap((id) => extractMaterialNames(id, visited));

        return uniqueStrings([...baseNames, ...nestedNames, ...singleRefs]);
    };

    const buildMaterialMap = () => {
        try {
            const relID = getIfcTypeCode(ifcApi, "IFCRELASSOCIATESMATERIAL");
            const lines = ifcApi.GetLineIDsWithType(modelID, relID);
            for (let i = 0; i < lines.size(); i++) {
                const rel = getLineCached(lines.get(i));
                const names = extractMaterialNames(rel?.RelatingMaterial);
                if (names.length === 0) continue;
                toExpressIds(rel?.RelatedObjects).forEach((objID) => {
                    if (!materialMap.has(objID)) materialMap.set(objID, []);
                    materialMap.get(objID)!.push(...names);
                });
            }
        } catch (e) {
            console.warn("无法构建材质映射表", e);
        }
    };

    const buildSystemMap = () => {
        try {
            const relID = getIfcTypeCode(ifcApi, "IFCRELASSIGNSTOGROUP");
            const lines = ifcApi.GetLineIDsWithType(modelID, relID);
            for (let i = 0; i < lines.size(); i++) {
                const rel = getLineCached(lines.get(i));
                const groupId = resolveExpressId(rel?.RelatingGroup);
                if (!groupId) continue;
                const group = getLineCached(groupId);
                if (!group || (group.is_a !== "IFCSYSTEM" && group.is_a !== "IFCDISTRIBUTIONSYSTEM")) continue;
                const systemName = group.Name?.value || group.LongName?.value || `${group.is_a} [${groupId}]`;
                toExpressIds(rel?.RelatedObjects).forEach((objID) => {
                    if (!systemMap.has(objID)) systemMap.set(objID, []);
                    systemMap.get(objID)!.push(systemName);
                });
            }
        } catch (e) {
            console.warn("无法构建系统映射表", e);
        }
    };
    
    // 附加IFC相关的元数据
    rootGroup.userData.isIFC = true;
    rootGroup.userData.ifcAPI = ifcApi;
    rootGroup.userData.modelID = modelID;
    rootGroup.userData.layerMap = layerMap;

    // --- 空间结构解析优化 ---
    const nodesMap = new Map<number, THREE.Object3D>();
    nodesMap.set(0, rootGroup);
    const meshesByExpressId = new Map<number, THREE.Mesh[]>();

    // 预索引关系映射表，避免在递归中频繁查询 API 提升性能和准确性
    const aggregatesMap = new Map<number, number[]>(); // RelatingObject -> RelatedObjects[]
    const containmentMap = new Map<number, number[]>(); // RelatingStructure -> RelatedElements[]

    const buildIndices = () => {
        // 1. 索引分解关系 (IfcRelAggregates)
        const relDecomposes = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELAGGREGATES);
        for (let i = 0; i < relDecomposes.size(); i++) {
            const rel = getLineCached(relDecomposes.get(i));
            const parentID = rel.RelatingObject.value;
            const children = rel.RelatedObjects.map((obj: any) => obj.value);
            
            if (!aggregatesMap.has(parentID)) aggregatesMap.set(parentID, []);
            aggregatesMap.get(parentID)!.push(...children);
        }

        // 2. 索引包含关系 (IfcRelContainedInSpatialStructure)
        const relContained = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
        for (let i = 0; i < relContained.size(); i++) {
            const rel = getLineCached(relContained.get(i));
            const containerID = rel.RelatingStructure.value;
            const elements = rel.RelatedElements.map((el: any) => el.value);
            
            if (!containmentMap.has(containerID)) containmentMap.set(containerID, []);
            containmentMap.get(containerID)!.push(...elements);
        }
    };

    const visitedHierarchy = new Set<number>();

    // 递归解析空间层级
    const parseSpatialRecursive = (
        expressID: number,
        parent: THREE.Object3D,
        spatialContext: { storey: string; path: string[]; container: string }
    ) => {
        const props = getLineCached(expressID);
        if (!props) return;
        if (visitedHierarchy.has(expressID)) return;
        visitedHierarchy.add(expressID);

        let currentParent = parent;
        let nextSpatialContext = spatialContext;
        
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
        const name = props.Name?.value || props.LongName?.value || `${props.is_a} [${expressID}]`;
        const group = new THREE.Group();
        group.name = name;
        nextSpatialContext = {
            storey: props.is_a === "IFCBUILDINGSTOREY" ? name : spatialContext.storey,
            path: isSpatialContainer ? [...spatialContext.path, name] : spatialContext.path,
            container: props.is_a
        };
        group.userData = {
            expressID,
            isSpatial: isSpatialContainer,
            isIfcEntity: true,
            type: props.is_a,
            ifcSpatial: nextSpatialContext,
            ifcMetadata: {
                category: props.is_a,
                storey: nextSpatialContext.storey,
                spatialPath: nextSpatialContext.path,
                systems: [],
                materials: [],
                classifications: [],
                typeName: ""
            }
        };
        parent.add(group);
        currentParent = group;
        nodesMap.set(expressID, group);
        spatialMetaMap.set(expressID, nextSpatialContext);

        // A. 处理通过分解关系连接的子空间/子对象
        const children = aggregatesMap.get(expressID);
        if (children) {
            for (const childID of children) {
                parseSpatialRecursive(childID, currentParent, nextSpatialContext);
            }
        }

        // B. 处理直接包含在该空间结构下的所有物理构件
        const elements = containmentMap.get(expressID);
        if (elements) {
            for (const elementID of elements) {
                // 构件可能还会进一步分解（例如幕墙 Curtain Wall 分解为面板 Panels 与竖梃/横梁 Mullions）
                // 所以对构件也进行递归解析，以捕获其可能的子零件
                parseSpatialRecursive(elementID, currentParent, nextSpatialContext);
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
                    parseSpatialRecursive(projects.get(i), rootGroup, {
                        storey: "",
                        path: [],
                        container: "IFCPROJECT"
                    });
                }
            } else {
                // 如果没有 IfcProject（非标准文件），尝试从 IfcSite / IfcBuilding 开始
                const sites = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCSITE);
                for (let i = 0; i < sites.size(); i++) {
                    parseSpatialRecursive(sites.get(i), rootGroup, {
                        storey: "",
                        path: [],
                        container: "IFCSITE"
                    });
                }
            }
        } catch (e) {
            console.error("解析 IFC 完整空间结构失败:", e);
        }
    };

    loadSpatialStructure();
    const shouldDeferMetadata = buffer.byteLength > 20 * 1024 * 1024;
    const applyLayerMetadata = () => {
        for (const [expressID, meshes] of meshesByExpressId.entries()) {
            const layerName = layerMap.get(expressID);
            if (!layerName) continue;
            for (const mesh of meshes) {
                mesh.userData.layer = layerName;
            }
        }
    };
    if (shouldDeferMetadata) {
        onProgress(42, `${t("analyzing")}...`);
        setTimeout(() => {
            buildLayerMap();
            buildPropertyMap();
            buildTypeAssignments();
            buildClassificationMap();
            buildMaterialMap();
            buildSystemMap();
            applyLayerMetadata();
        }, 0);
    } else {
        buildLayerMap();
        buildPropertyMap();
        buildTypeAssignments();
        buildClassificationMap();
        buildMaterialMap();
        buildSystemMap();
        applyLayerMetadata();
    }
    // --- 空间结构解析结束 ---

    // 获取友好的属性名称
    const getFriendlyName = (name: string): string => {
        // 移除常见前缀
        let cleanName = name.replace(/^(is|has|are)_/i, '');
        
        // 驼峰转单词
        const camelToWords = (str: string) => {
            return str
                .replace(/([A-Z])/g, ' $1')
                .replace(/^ /, '');
        };
        
        return camelToWords(cleanName);
    };

    const getRawDisplayName = (name: string): string => name;

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
    const flattenAndFormatProperties = (
        obj: any,
        category: string = '',
        formatter: (name: string) => string = getFriendlyName
    ): any => {
        const result: any = {};
        
        Object.keys(obj).forEach(key => {
            if (['expressID', 'is_a', 'type', 'ID', 'Name', 'GlobalId'].includes(key)) return;
            
            const value = obj[key];
            const displayKey = formatter(key);
            const categoryPrefix = category ? `${category}.` : '';
            
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // 递归处理嵌套对象
                const nested = flattenAndFormatProperties(value, categoryPrefix + displayKey, formatter);
                Object.assign(result, nested);
            } else {
                // 扁平化键值对
                const fullKey = categoryPrefix + displayKey;
                result[fullKey] = formatDisplayValue(value);
            }
        });
        
        return result;
    };

    const collectPsetData = (psetIDs: number[], rawKeyPrefix = "") => {
        const normalizedGroups: Record<string, Record<string, string>> = {};
        const rawGroups: Record<string, Record<string, string>> = {};
        let quantityGroupCount = 0;

        const ensureGroup = (
            target: Record<string, Record<string, string>>,
            groupName: string
        ) => {
            if (!target[groupName]) target[groupName] = {};
            return target[groupName];
        };

        for (const psetID of psetIDs) {
            try {
                const pset = getLineCached(psetID);
                if (!pset) continue;

                const psetBaseName = pset.Name?.value || `属性集_${psetID}`;
                const normalizedGroupName = getFriendlyName(psetBaseName);
                const rawGroupName = `${rawKeyPrefix}${psetBaseName}`;

                if (pset.HasProperties) {
                    const normalizedGroup = ensureGroup(normalizedGroups, normalizedGroupName);
                    const rawGroup = ensureGroup(rawGroups, rawGroupName);
                    normalizedGroup["类型"] = pset.is_a;
                    rawGroup["is_a"] = pset.is_a;

                    if (pset.Description?.value) {
                        normalizedGroup["描述"] = formatDisplayValue(pset.Description.value);
                        rawGroup["Description"] = formatDisplayValue(pset.Description.value);
                    }

                    for (const propRef of pset.HasProperties) {
                        const propID = propRef.value;
                        const prop = getLineCached(propID);
                        if (!prop || !prop.Name) continue;

                        const propName = prop.Name.value;
                        if (prop.NominalValue) {
                            normalizedGroup[getFriendlyName(propName)] = formatDisplayValue(prop.NominalValue.value);
                            rawGroup[propName] = formatDisplayValue(prop.NominalValue.value);
                            continue;
                        }

                        const flattenedNormalized = flattenAndFormatProperties(prop, "", getFriendlyName);
                        const flattenedRaw = flattenAndFormatProperties(prop, "", getRawDisplayName);
                        Object.entries(flattenedNormalized).forEach(([key, value]) => {
                            normalizedGroup[`${getFriendlyName(propName)}.${key}`] = String(value);
                        });
                        Object.entries(flattenedRaw).forEach(([key, value]) => {
                            rawGroup[`${propName}.${key}`] = String(value);
                        });
                    }
                }

                if (pset.Quantities) {
                    quantityGroupCount += 1;
                    const normalizedGroup = ensureGroup(normalizedGroups, `${normalizedGroupName}.数量`);
                    const rawGroup = ensureGroup(rawGroups, `${rawGroupName}.Quantities`);

                    pset.Quantities.forEach((quant: any) => {
                        const quantity = resolveExpressId(quant) ? getLineCached(quant.value) : quant;
                        if (!quantity?.Name?.value) return;

                        const quantityName = quantity.Name.value;
                        const valueTypes = [
                            "LengthValue",
                            "AreaValue",
                            "VolumeValue",
                            "CountValue",
                            "WeightValue",
                            "TimeValue"
                        ];

                        valueTypes.forEach((valueKey) => {
                            if (quantity[valueKey]?.value === undefined) return;
                            normalizedGroup[`${getFriendlyName(quantityName)}.${getFriendlyName(valueKey)}`] = formatDisplayValue(quantity[valueKey].value);
                            rawGroup[`${quantityName}.${valueKey}`] = formatDisplayValue(quantity[valueKey].value);
                        });
                    });
                }
            } catch (e) {
                console.warn(`解析属性集${psetID}失败`, e);
            }
        }

        return {
            normalizedGroups,
            rawGroups,
            quantityGroupCount
        };
    };

    // 附加自定义属性管理器
    rootGroup.userData.ifcManager = {
        getItemProperties: async (_id: number, expressID: number) => {
            const normalizedGroups: Record<string, Record<string, string>> = {};
            const rawGroups: Record<string, Record<string, string>> = {};
            const addGroupEntry = (
                target: Record<string, Record<string, string>>,
                groupName: string,
                key: string,
                value: any
            ) => {
                if (value === '' || value === null || value === undefined) return;
                if (!target[groupName]) target[groupName] = {};
                target[groupName][key] = String(value);
            };

            let entity: any = null;
            try {
                entity = getLineCached(expressID);
                if (entity) {
                    addGroupEntry(normalizedGroups, "IFC 标识", "ExpressID", expressID);
                    addGroupEntry(normalizedGroups, "IFC 标识", "类型", entity.is_a || 'Unknown');
                    addGroupEntry(normalizedGroups, "IFC 标识", "全局ID", entity.GlobalId?.value || '');
                    addGroupEntry(normalizedGroups, "IFC 标识", "名称", entity.Name?.value || '');
                    addGroupEntry(normalizedGroups, "IFC 标识", "描述", entity.Description?.value || '');
                    addGroupEntry(normalizedGroups, "IFC 标识", "标签", entity.Tag?.value || '');

                    addGroupEntry(rawGroups, "IFC Entity", "expressID", expressID);
                    addGroupEntry(rawGroups, "IFC Entity", "is_a", entity.is_a || 'Unknown');
                    addGroupEntry(rawGroups, "IFC Entity", "GlobalId", entity.GlobalId?.value || '');
                    addGroupEntry(rawGroups, "IFC Entity", "Name", entity.Name?.value || '');
                    addGroupEntry(rawGroups, "IFC Entity", "Description", entity.Description?.value || '');
                    addGroupEntry(rawGroups, "IFC Entity", "Tag", entity.Tag?.value || '');

                    Object.keys(entity).forEach(key => {
                        if (['expressID', 'is_a', 'type', 'ID', 'GlobalId', 'Name', 'Description', 'Tag'].includes(key)) return;
                        const value = formatDisplayValue(entity[key]);
                        addGroupEntry(normalizedGroups, "IFC 标识", getFriendlyName(key), value);
                        addGroupEntry(rawGroups, "IFC Entity", key, value);
                    });
                }
            } catch (e) {
                console.warn("获取实体属性失败", e);
            }

            const psetIDs = propertyMap.get(expressID) || [];
            let quantityGroupCount = 0;
            if (psetIDs.length > 0) {
                const parsed = collectPsetData(psetIDs);
                Object.assign(normalizedGroups, parsed.normalizedGroups);
                Object.assign(rawGroups, parsed.rawGroups);
                quantityGroupCount += parsed.quantityGroupCount;
            }

            const typeId = typeAssignmentMap.get(expressID);
            let typeName = "";
            if (typeId) {
                const typeEntity = getLineCached(typeId);
                typeName = typeEntity?.Name?.value || "";
                addGroupEntry(normalizedGroups, "IFC 类型", "类型实体", typeEntity?.is_a || "");
                addGroupEntry(normalizedGroups, "IFC 类型", "类型名称", typeName);
                addGroupEntry(normalizedGroups, "IFC 类型", "类型ID", typeId);

                addGroupEntry(rawGroups, "IFC Type", "is_a", typeEntity?.is_a || "");
                addGroupEntry(rawGroups, "IFC Type", "Name", typeName);
                addGroupEntry(rawGroups, "IFC Type", "expressID", typeId);

                const typePropertySets = typePropertyMap.get(typeId) || [];
                if (typePropertySets.length > 0) {
                    const parsed = collectPsetData(typePropertySets, "TYPE:");
                    Object.entries(parsed.normalizedGroups).forEach(([groupName, props]) => {
                        normalizedGroups[`Type Properties · ${groupName}`] = props;
                    });
                    Object.entries(parsed.rawGroups).forEach(([groupName, props]) => {
                        rawGroups[`TYPE:${groupName}`] = props;
                    });
                }
            }

            const spatialMeta = spatialMetaMap.get(expressID);
            const classifications = uniqueStrings([
                ...(classificationMap.get(expressID) || []),
                ...(typeId ? classificationMap.get(typeId) || [] : [])
            ]);
            const materials = uniqueStrings([
                ...(materialMap.get(expressID) || []),
                ...(typeId ? materialMap.get(typeId) || [] : [])
            ]);
            const systems = uniqueStrings([
                ...(systemMap.get(expressID) || []),
                ...(typeId ? systemMap.get(typeId) || [] : [])
            ]);

            if (classifications.length > 0) {
                addGroupEntry(normalizedGroups, "IFC 分类", "编码", classifications.join(", "));
                addGroupEntry(rawGroups, "IFC Classification", "Items", classifications.join(", "));
            }

            if (materials.length > 0) {
                addGroupEntry(normalizedGroups, "IFC 材质", "材质名称", materials.join(", "));
                addGroupEntry(rawGroups, "IFC Material", "Names", materials.join(", "));
            }

            if (systems.length > 0) {
                addGroupEntry(normalizedGroups, "IFC 系统", "系统名称", systems.join(", "));
                addGroupEntry(rawGroups, "IFC System", "Names", systems.join(", "));
            }

            if (spatialMeta) {
                addGroupEntry(normalizedGroups, "IFC 空间", "所在楼层", spatialMeta.storey || '');
                addGroupEntry(normalizedGroups, "IFC 空间", "空间路径", spatialMeta.path.join(" / "));
                addGroupEntry(normalizedGroups, "IFC 空间", "容器类型", spatialMeta.container);

                addGroupEntry(rawGroups, "IFC Spatial", "Storey", spatialMeta.storey || '');
                addGroupEntry(rawGroups, "IFC Spatial", "Path", spatialMeta.path.join(" / "));
                addGroupEntry(rawGroups, "IFC Spatial", "Container", spatialMeta.container);
            }

            const meshRefs = meshesByExpressId.get(expressID) || [];
            const firstMesh = meshRefs[0];
            if (firstMesh) {
                const material = Array.isArray(firstMesh.material) ? firstMesh.material[0] : firstMesh.material;
                if (material instanceof THREE.MeshStandardMaterial) {
                    addGroupEntry(normalizedGroups, "IFC 渲染", "颜色", `#${material.color.getHexString().toUpperCase()}`);
                    addGroupEntry(normalizedGroups, "IFC 渲染", "透明度", material.opacity.toFixed(2));
                    addGroupEntry(rawGroups, "IFC Render", "color", `#${material.color.getHexString().toUpperCase()}`);
                    addGroupEntry(rawGroups, "IFC Render", "opacity", material.opacity.toFixed(2));
                }
            }

            const missingProvided: string[] = [];
            if (psetIDs.length === 0) missingProvided.push("属性集");
            if (!typeId) missingProvided.push("类型属性");
            if (classifications.length === 0) missingProvided.push("分类编码");
            if (materials.length === 0) missingProvided.push("材质关联");
            if (systems.length === 0) missingProvided.push("系统关联");
            if (!spatialMeta?.storey) missingProvided.push("楼层信息");
            if (!layerMap.has(expressID)) missingProvided.push("图层信息");

            const unparsedRelations = uniqueStrings(
                toExpressIds(entity?.HasAssociations)
                    .map((relId) => getLineCached(relId)?.is_a)
                    .filter(
                        (relType) =>
                            !!relType &&
                            ![
                                "IFCRELASSOCIATESMATERIAL",
                                "IFCRELASSOCIATESCLASSIFICATION",
                                "IFCRELASSIGNSTOGROUP"
                            ].includes(relType)
                    )
            );
            const currentUnparsed = uniqueStrings([
                ...unparsedRelations.map((type) => `关联:${type}`),
                ...(entity?.Representation ? ["表现样式/纹理细节"] : []),
                ...(entity?.ObjectPlacement ? ["放置与坐标系细节"] : [])
            ]);

            addGroupEntry(normalizedGroups, "IFC 解析诊断", "属性集", psetIDs.length > 0 ? `已解析 ${psetIDs.length} 组` : "未发现");
            addGroupEntry(normalizedGroups, "IFC 解析诊断", "数量属性", quantityGroupCount > 0 ? `已解析 ${quantityGroupCount} 组` : "未发现");
            addGroupEntry(normalizedGroups, "IFC 解析诊断", "类型属性", typeId ? "已解析" : "未发现");
            addGroupEntry(normalizedGroups, "IFC 解析诊断", "分类编码", classifications.length > 0 ? `已解析 ${classifications.length} 条` : "未发现");
            addGroupEntry(normalizedGroups, "IFC 解析诊断", "材质关联", materials.length > 0 ? `已解析 ${materials.length} 条` : "未发现");
            addGroupEntry(normalizedGroups, "IFC 解析诊断", "系统关联", systems.length > 0 ? `已解析 ${systems.length} 条` : "未发现");
            addGroupEntry(normalizedGroups, "IFC 解析诊断", "楼层识别", spatialMeta?.storey ? spatialMeta.storey : "未识别");
            addGroupEntry(normalizedGroups, "IFC 解析诊断", "图层", layerMap.has(expressID) ? "已解析" : "未发现");
            addGroupEntry(normalizedGroups, "IFC 解析诊断", "文件未提供", missingProvided.length > 0 ? missingProvided.join("、") : "未发现");
            addGroupEntry(normalizedGroups, "IFC 解析诊断", "当前未解析", currentUnparsed.length > 0 ? currentUnparsed.join("、") : "未发现");

            addGroupEntry(rawGroups, "IFC Diagnostics", "PropertySets", psetIDs.length);
            addGroupEntry(rawGroups, "IFC Diagnostics", "QuantityGroups", quantityGroupCount);
            addGroupEntry(rawGroups, "IFC Diagnostics", "TypeProperties", typeId ? "yes" : "no");
            addGroupEntry(rawGroups, "IFC Diagnostics", "Classification", classifications.length);
            addGroupEntry(rawGroups, "IFC Diagnostics", "Material", materials.length);
            addGroupEntry(rawGroups, "IFC Diagnostics", "System", systems.length);
            addGroupEntry(rawGroups, "IFC Diagnostics", "Storey", spatialMeta?.storey || "");
            addGroupEntry(rawGroups, "IFC Diagnostics", "Layer", layerMap.get(expressID) || "");
            addGroupEntry(rawGroups, "IFC Diagnostics", "MissingInFile", missingProvided.join(", "));
            addGroupEntry(rawGroups, "IFC Diagnostics", "CurrentlyUnparsed", currentUnparsed.join(", "));

            return {
                normalizedGroups,
                rawGroups,
                filterMeta: {
                    category: entity?.is_a || "",
                    typeName,
                    storey: spatialMeta?.storey || "",
                    spatialPath: spatialMeta?.path || [],
                    systems,
                    materials,
                    classifications
                }
            };
        },
        
        getExpressId: (geo: any, _faceIndex: number) => {
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

    ifcApi.StreamAllMeshes(modelID, (flatMesh: any) => {
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
            
            // 在几何体上存储 ExpressID/BimId 以供选择逻辑使用
            geometry.userData = { expressID, bimId: String(expressID) };

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
            mesh.userData.bimId = String(expressID);
            if (!meshesByExpressId.has(expressID)) meshesByExpressId.set(expressID, []);
            meshesByExpressId.get(expressID)!.push(mesh);
            
            // 附加图层信息
            if (layerMap.has(expressID)) {
                mesh.userData.layer = layerMap.get(expressID);
            }
            
            // 优化构件名称：获取真实的 IFC 类型作为名称前缀
            try {
                const props = getLineCached(expressID);
                const ifcType = props.is_a || 'Item';
                const ifcName = props.Name?.value || '';
                mesh.name = ifcName ? `${ifcType}: ${ifcName}` : `${ifcType} [${expressID}]`;
            } catch(e) {
                mesh.name = `IFC Item ${expressID}`; 
            }

            const spatialMeta = spatialMetaMap.get(expressID);
            const typeId = typeAssignmentMap.get(expressID);
            const typeEntity = typeId ? getLineCached(typeId) : null;
            const classifications = uniqueStrings([
                ...(classificationMap.get(expressID) || []),
                ...(typeId ? classificationMap.get(typeId) || [] : [])
            ]);
            const materialsForMesh = uniqueStrings([
                ...(materialMap.get(expressID) || []),
                ...(typeId ? materialMap.get(typeId) || [] : [])
            ]);
            const systemsForMesh = uniqueStrings([
                ...(systemMap.get(expressID) || []),
                ...(typeId ? systemMap.get(typeId) || [] : [])
            ]);
            mesh.userData.ifcMetadata = {
                category: getLineCached(expressID)?.is_a || "",
                storey: spatialMeta?.storey || "",
                spatialPath: spatialMeta?.path || [],
                systems: systemsForMesh,
                materials: materialsForMesh,
                classifications,
                typeName: typeEntity?.Name?.value || "",
                typeEntity: typeEntity?.is_a || "",
                render: color
                    ? {
                          color: `#${new THREE.Color(color.x, color.y, color.z).getHexString().toUpperCase()}`,
                          opacity: Number(color.w ?? 1)
                      }
                    : undefined
            };
            mesh.userData.ifcSpatial = spatialMeta;
            
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
    
    // 轴向修正
    rootGroup.rotateX(Math.PI / 2);

    return rootGroup;
};
