import * as THREE from 'three';
import { m as mergeVertices } from './loaders-MBHA5ASo.js';

class OCCTLoader {
  constructor(wasmUrl = "/libs/occt-import-js/occt-import-js.wasm") {
    this.wasmUrl = wasmUrl;
    this.readParameters = {
      productContext: 1,
      assemblyLevel: 1,
      shapeRepr: 1,
      shapeAspect: 1,
      subShapesNames: 0,
      codePage: "UTF8",
      linearDeflection: 0.1,
      angularDeflection: 0.5
    };
  }
  async load(buffer, t, onProgress) {
    if (!buffer || buffer.byteLength === 0) {
      throw new Error(t("error_empty_file"));
    }
    if (onProgress) onProgress(10, t("loading_cad_engine"));
    let occt;
    try {
      const initOCCT = (await import('occt-import-js')).default;
      occt = await initOCCT({
        locateFile: (name) => {
          if (name.endsWith(".wasm")) return this.wasmUrl;
          return name;
        }
      });
    } catch (e) {
      console.error("初始化 OCCT 引擎失败:", e);
      throw new Error(t("error_cad_engine_init_failed"));
    }
    if (onProgress) onProgress(30, t("parsing_cad_data"));
    const fileContent = new Uint8Array(buffer);
    let result;
    let stepError = null;
    let igesError = null;
    try {
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
      console.warn("STEP 解析失败，正在尝试 IGES...", e);
    }
    if (!result || !result.success) {
      try {
        const params = {
          linearDeflection: this.readParameters.linearDeflection,
          angularDeflection: this.readParameters.angularDeflection
        };
        result = occt.ReadIgesFile(fileContent, params);
      } catch (e) {
        igesError = e;
        console.error("IGES 解析失败", e);
      }
    }
    if (!result) {
      throw new Error(t("error_cad_parse_failed") + " - " + t("error_no_parser_result"));
    }
    if (!result.success) {
      let errorMsg = t("error_cad_parse_failed");
      if (result.error) {
        errorMsg += ` - ${result.error}`;
      } else if (stepError && igesError) {
        errorMsg += ` - STEP: ${stepError.message || "未知错误"}, IGES: ${igesError.message || "未知错误"}`;
      }
      throw new Error(errorMsg);
    }
    if (!result.meshes || !Array.isArray(result.meshes) || result.meshes.length === 0) {
      throw new Error(t("error_cad_no_meshes"));
    }
    if (onProgress) onProgress(70, t("creating_geometry"));
    const group = new THREE.Group();
    const materialCache = /* @__PURE__ */ new Map();
    const defaultMaterial = new THREE.MeshPhongMaterial({
      color: 13421772,
      side: THREE.DoubleSide,
      flatShading: false,
      shininess: 30,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
    materialCache.set("default", defaultMaterial);
    const meshMap = /* @__PURE__ */ new Map();
    const groupMap = /* @__PURE__ */ new Map();
    const meshesWithParent = /* @__PURE__ */ new Map();
    for (const mesh of result.meshes) {
      let geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3));
      if (mesh.attributes.normal && mesh.attributes.normal.array) {
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3));
      } else {
        geometry.computeVertexNormals();
      }
      if (mesh.index && mesh.index.array) {
        geometry.setIndex(new THREE.Uint32BufferAttribute(mesh.index.array, 1));
      }
      geometry = mergeVertices(geometry);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const threeMaterial = defaultMaterial.clone();
      const threeMesh = new THREE.Mesh(geometry, threeMaterial);
      let baseColor = new THREE.Color(13421772);
      if (mesh.color && Array.isArray(mesh.color) && mesh.color.length >= 3) {
        baseColor = new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2]);
      }
      threeMesh.material.color = baseColor;
      threeMesh.userData.color = baseColor.getHex();
      const brepFaces = mesh.brep_faces;
      if (Array.isArray(brepFaces) && brepFaces.length > 0) {
        const hasValidFaceColors = brepFaces.some(
          (face) => face && Array.isArray(face.color) && face.color.length >= 3 && face.first !== void 0 && face.last !== void 0
        );
        if (hasValidFaceColors) {
          geometry = geometry.toNonIndexed();
          const posAttr = geometry.getAttribute("position");
          const vertexCount = posAttr.count;
          const triCount = Math.floor(vertexCount / 3);
          const colors = new Float32Array(vertexCount * 3);
          for (let i = 0; i < vertexCount; i++) {
            const ci = i * 3;
            colors[ci + 0] = baseColor.r;
            colors[ci + 1] = baseColor.g;
            colors[ci + 2] = baseColor.b;
          }
          for (const face of brepFaces) {
            if (!face || !Array.isArray(face.color) || face.color.length < 3) {
              continue;
            }
            const first = Number(face.first);
            const last = Number(face.last);
            if (!Number.isFinite(first) || !Number.isFinite(last) || first < 0 || last < first) {
              continue;
            }
            const faceColor = new THREE.Color(
              face.color[0],
              face.color[1],
              face.color[2]
            );
            const startTri = Math.max(0, Math.min(triCount - 1, first));
            const endTri = Math.max(0, Math.min(triCount - 1, last));
            for (let tIdx = startTri; tIdx <= endTri; tIdx++) {
              for (let v = 0; v < 3; v++) {
                const vi = tIdx * 3 + v;
                const ci = vi * 3;
                colors[ci + 0] = faceColor.r;
                colors[ci + 1] = faceColor.g;
                colors[ci + 2] = faceColor.b;
              }
            }
          }
          geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
          threeMesh.geometry = geometry;
          threeMesh.material.vertexColors = true;
        }
      }
      threeMesh.name = mesh.name || "CAD Part";
      threeMesh.userData = {
        ...mesh.userData,
        ...threeMesh.userData,
        source: "OCCT",
        meshId: mesh.id,
        shapeName: mesh.name,
        isAssembly: !!mesh.isAssembly,
        isComponent: !!mesh.isComponent
      };
      threeMesh.frustumCulled = true;
      const parentId = mesh.parentId || mesh.parent;
      if (parentId) {
        meshesWithParent.set(threeMesh, parentId);
      } else {
        group.add(threeMesh);
      }
      meshMap.set(mesh.id || mesh.name || `mesh_${meshMap.size}`, threeMesh);
    }
    for (const [threeMesh, parentId] of meshesWithParent.entries()) {
      let parent;
      if (meshMap.has(parentId)) {
        parent = meshMap.get(parentId);
      } else {
        if (!groupMap.has(parentId)) {
          const newGroup = new THREE.Group();
          newGroup.name = `Group_${parentId}`;
          groupMap.set(parentId, newGroup);
          group.add(newGroup);
        }
        parent = groupMap.get(parentId);
      }
      parent.add(threeMesh);
    }
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.computeBoundingBox();
        obj.geometry.computeBoundingSphere();
      }
    });
    group.updateMatrixWorld(true);
    if (onProgress) onProgress(100, t("model_loaded"));
    return group;
  }
}

export { OCCTLoader };
