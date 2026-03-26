import * as THREE from 'three';

let cachedIfcRuntimePromise = null;
let cachedIfcRuntimePath = "";
const ifcTypeCodeCache = /* @__PURE__ */ new Map();
function getIfcWasmPath(libPath) {
  return libPath.endsWith("/") ? `${libPath}web-ifc/` : `${libPath}/web-ifc/`;
}
async function getIfcRuntime(libPath) {
  const wasmPath = getIfcWasmPath(libPath);
  if (cachedIfcRuntimePromise && cachedIfcRuntimePath === wasmPath) {
    return cachedIfcRuntimePromise;
  }
  cachedIfcRuntimePath = wasmPath;
  cachedIfcRuntimePromise = (async () => {
    const WebIFC = await import('web-ifc');
    const ifcApi = new WebIFC.IfcAPI();
    ifcApi.SetWasmPath(wasmPath);
    await ifcApi.Init();
    ifcTypeCodeCache.clear();
    return { ifcApi, WebIFC, wasmPath };
  })();
  return cachedIfcRuntimePromise;
}
function getIfcTypeCode(ifcApi, typeName) {
  const cached = ifcTypeCodeCache.get(typeName);
  if (cached !== void 0) return cached;
  const typeCode = ifcApi.GetTypeCodeFromName(typeName);
  ifcTypeCodeCache.set(typeName, typeCode);
  return typeCode;
}
const loadIFC = async (input, onProgress, t, libPath = "./libs") => {
  const { ifcApi, WebIFC } = await getIfcRuntime(libPath);
  let buffer;
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
    buffer = await new Promise((resolve, reject) => {
      loader.load(
        input,
        (data2) => resolve(data2),
        (event) => {
          if (event.total > 0) {
            const readPercent = event.loaded / event.total * 100;
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
  const modelID = ifcApi.OpenModel(data, {
    COORDINATE_TO_ORIGIN: true,
    CIRCLE_SEGMENTS: 12,
    MEMORY_LIMIT: 1073741824
    // 1GB（内存限制）
  });
  const rootGroup = new THREE.Group();
  rootGroup.name = "IFC模型";
  const propertyMap = /* @__PURE__ */ new Map();
  try {
    const relID = getIfcTypeCode(ifcApi, "IFCRELDEFINESBYPROPERTIES");
    const lines = ifcApi.GetLineIDsWithType(modelID, relID);
    const size = lines.size();
    for (let i = 0; i < size; i++) {
      const id = lines.get(i);
      const rel = ifcApi.GetLine(modelID, id);
      if (rel.RelatedObjects && Array.isArray(rel.RelatedObjects)) {
        const psetID = rel.RelatingPropertyDefinition?.value;
        if (psetID) {
          rel.RelatedObjects.forEach((objRef) => {
            const objID = objRef.value;
            if (!propertyMap.has(objID)) propertyMap.set(objID, []);
            propertyMap.get(objID).push(psetID);
          });
        }
      }
    }
  } catch (e) {
    console.warn("无法构建属性映射表", e);
  }
  rootGroup.userData.isIFC = true;
  rootGroup.userData.ifcAPI = ifcApi;
  rootGroup.userData.modelID = modelID;
  const layerMap = /* @__PURE__ */ new Map();
  try {
    const layerType = getIfcTypeCode(ifcApi, "IFCPRESENTATIONLAYERASSIGNMENT");
    const layers = ifcApi.GetLineIDsWithType(modelID, layerType);
    for (let i = 0; i < layers.size(); i++) {
      const id = layers.get(i);
      const layer = ifcApi.GetLine(modelID, id);
      const layerName = layer.Name?.value || `Layer_${id}`;
      if (layer.AssignedItems && Array.isArray(layer.AssignedItems)) {
        layer.AssignedItems.forEach((itemRef) => {
          const itemID = itemRef.value;
          layerMap.set(itemID, layerName);
        });
      }
    }
  } catch (e) {
    console.warn("无法构建图层映射表", e);
  }
  rootGroup.userData.layerMap = layerMap;
  const nodesMap = /* @__PURE__ */ new Map();
  nodesMap.set(0, rootGroup);
  const aggregatesMap = /* @__PURE__ */ new Map();
  const containmentMap = /* @__PURE__ */ new Map();
  const buildIndices = () => {
    const relDecomposes = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELAGGREGATES);
    for (let i = 0; i < relDecomposes.size(); i++) {
      const rel = ifcApi.GetLine(modelID, relDecomposes.get(i));
      const parentID = rel.RelatingObject.value;
      const children = rel.RelatedObjects.map((obj) => obj.value);
      if (!aggregatesMap.has(parentID)) aggregatesMap.set(parentID, []);
      aggregatesMap.get(parentID).push(...children);
    }
    const relContained = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
    for (let i = 0; i < relContained.size(); i++) {
      const rel = ifcApi.GetLine(modelID, relContained.get(i));
      const containerID = rel.RelatingStructure.value;
      const elements = rel.RelatedElements.map((el) => el.value);
      if (!containmentMap.has(containerID)) containmentMap.set(containerID, []);
      containmentMap.get(containerID).push(...elements);
    }
  };
  const parseSpatialRecursive = (expressID, parent) => {
    const props = ifcApi.GetLine(modelID, expressID);
    if (!props) return;
    let currentParent = parent;
    const spatialTypes = [
      "IFCPROJECT",
      "IFCSITE",
      "IFCBUILDING",
      "IFCBUILDINGSTOREY",
      "IFCSPACE",
      "IFCZONE"
    ];
    const isSpatialContainer = spatialTypes.includes(props.is_a);
    if (isSpatialContainer) {
      const name = props.Name?.value || props.LongName?.value || `${props.is_a} [${expressID}]`;
      const group = new THREE.Group();
      group.name = name;
      group.userData = { expressID, isSpatial: true, type: props.is_a };
      parent.add(group);
      currentParent = group;
      nodesMap.set(expressID, group);
    } else {
      nodesMap.set(expressID, parent);
    }
    const children = aggregatesMap.get(expressID);
    if (children) {
      for (const childID of children) {
        parseSpatialRecursive(childID, currentParent);
      }
    }
    const elements = containmentMap.get(expressID);
    if (elements) {
      for (const elementID of elements) {
        parseSpatialRecursive(elementID, currentParent);
      }
    }
  };
  const loadSpatialStructure = () => {
    try {
      buildIndices();
      const projects = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
      if (projects.size() > 0) {
        for (let i = 0; i < projects.size(); i++) {
          parseSpatialRecursive(projects.get(i), rootGroup);
        }
      } else {
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
  const getFriendlyName = (name) => {
    let cleanName = name.replace(/^(is|has|are)_/i, "");
    const camelToWords = (str) => {
      return str.replace(/([A-Z])/g, " $1").replace(/^ /, "");
    };
    return camelToWords(cleanName);
  };
  const formatDisplayValue = (value) => {
    if (value === null || value === void 0) return "";
    if (value === "") return "";
    if (typeof value === "object" && value !== null) {
      if (value.value !== void 0) {
        return formatDisplayValue(value.value);
      }
      if (Array.isArray(value)) {
        return value.map((item) => formatDisplayValue(item)).filter((v) => v !== null && v !== void 0 && v !== "").join(", ");
      }
      if (Object.keys(value).length <= 3) {
        return Object.entries(value).map(([k, v]) => `${k}: ${formatDisplayValue(v)}`).join(", ");
      }
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    if (typeof value === "boolean") {
      return value ? "是" : "否";
    }
    if (typeof value === "number") {
      if (Number.isInteger(value)) {
        return value.toString();
      }
      return parseFloat(value.toFixed(3)).toString();
    }
    if (typeof value === "string") {
      const cleaned = value.trim();
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleaned)) {
        return cleaned;
      }
      return cleaned;
    }
    return String(value);
  };
  rootGroup.userData.ifcManager = {
    getItemProperties: async (_id, expressID) => {
      const result = {};
      try {
        const entity = ifcApi.GetLine(modelID, expressID);
        if (entity) {
          result["ExpressID"] = expressID;
          result["类型"] = entity.is_a || "Unknown";
          result["全局ID"] = entity.GlobalId?.value || "";
          result["名称"] = entity.Name?.value || "";
          result["描述"] = entity.Description?.value || "";
          result["标签"] = entity.Tag?.value || "";
          Object.keys(entity).forEach((key) => {
            if (["expressID", "is_a", "type", "ID", "GlobalId", "Name", "Description", "Tag"].includes(key)) return;
            const value = formatDisplayValue(entity[key]);
            if (value !== "" && value !== null && value !== void 0) {
              result[getFriendlyName(key)] = value;
            }
          });
        }
      } catch (e) {
        console.warn("获取实体属性失败", e);
      }
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
              for (const propRef of pset.HasProperties) {
                const propID = propRef.value;
                const prop = ifcApi.GetLine(modelID, propID);
                if (prop && prop.Name && prop.NominalValue) {
                  const key = getFriendlyName(prop.Name.value);
                  let val = prop.NominalValue.value;
                  if (typeof val === "object" && val !== null) {
                    if (val.value !== void 0) {
                      val = val.value;
                    } else {
                      if (Array.isArray(val)) {
                        val = val.map((v) => v?.value || v).join(", ");
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
            if (pset && pset.Quantities) {
              const psetName = getFriendlyName(pset.Name?.value || `属性集_${psetID}`);
              pset.Quantities.forEach((quant) => {
                if (quant.Name) {
                  const quantName = getFriendlyName(quant.Name.value);
                  const valueTypes = [
                    { key: "LengthValue", name: "长度" },
                    { key: "AreaValue", name: "面积" },
                    { key: "VolumeValue", name: "体积" },
                    { key: "CountValue", name: "数量" },
                    { key: "WeightValue", name: "重量" },
                    { key: "TimeValue", name: "时间" }
                  ];
                  for (const valType of valueTypes) {
                    if (quant[valType.key] && quant[valType.key].value !== void 0) {
                      result[`${psetName}.数量.${quantName}.${valType.name}`] = formatDisplayValue(quant[valType.key].value);
                    }
                  }
                  if (quant.Description?.value) {
                    result[`${psetName}.数量.${quantName}.描述`] = formatDisplayValue(quant.Description.value);
                  }
                }
              });
            }
          } catch (e) {
            console.warn(`解析属性集${psetID}失败`, e);
          }
        }
      }
      return result;
    },
    getExpressId: (geo, _faceIndex) => {
      return geo.userData?.expressID;
    }
  };
  onProgress(50, t("building_geometry"));
  let meshCount = 0;
  let expectedTotal = 0;
  const materials = {};
  const getMaterial = (color, opacity = 1) => {
    const key = `${color}-${opacity}`;
    if (!materials[key]) {
      materials[key] = new THREE.MeshStandardMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        side: THREE.DoubleSide
      });
    }
    return materials[key];
  };
  const dummyMatrix = new THREE.Matrix4();
  ifcApi.StreamAllMeshes(modelID, (flatMesh) => {
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
      for (let k = 0; k < verts.length; k += 6) {
        posFloats[k / 2] = verts[k];
        posFloats[k / 2 + 1] = verts[k + 1];
        posFloats[k / 2 + 2] = verts[k + 2];
        normFloats[k / 2] = verts[k + 3];
        normFloats[k / 2 + 1] = verts[k + 4];
        normFloats[k / 2 + 2] = verts[k + 5];
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(posFloats, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(normFloats, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.userData = { expressID, bimId: String(expressID) };
      const transform = placedGeom.flatTransformation;
      dummyMatrix.fromArray(transform);
      const color = placedGeom.color;
      let material;
      if (color) {
        const hex = new THREE.Color(color.x, color.y, color.z).getHex();
        material = getMaterial(hex, color.w);
      } else {
        material = getMaterial(13421772);
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.fromArray(transform);
      mesh.matrixWorldNeedsUpdate = true;
      mesh.userData.expressID = expressID;
      mesh.userData.bimId = String(expressID);
      if (layerMap.has(expressID)) {
        mesh.userData.layer = layerMap.get(expressID);
      }
      try {
        const props = ifcApi.GetLine(modelID, expressID);
        const ifcType = props.is_a || "Item";
        const ifcName = props.Name?.value || "";
        mesh.name = ifcName ? `${ifcType}: ${ifcName}` : `${ifcType} [${expressID}]`;
      } catch (e) {
        mesh.name = `IFC Item ${expressID}`;
      }
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
  rootGroup.rotateX(Math.PI / 2);
  return rootGroup;
};

export { loadIFC };
