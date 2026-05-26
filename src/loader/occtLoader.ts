import * as THREE from "three";
import { applyIndustrialMaterialStyle, toIndustrialDisplayColor } from "../utils/scene-manager/renderStyle";
import { TFunc } from "../theme/locales";

type OcctFaceColor = {
    first?: number;
    last?: number;
    color?: [number, number, number] | null;
};

type OcctMesh = {
    id?: string | number;
    name?: string;
    color?: [number, number, number];
    brep_faces?: OcctFaceColor[];
    attributes: {
        position: { array: ArrayLike<number> };
        normal?: { array: ArrayLike<number> };
    };
    index?: { array: ArrayLike<number> };
    userData?: Record<string, unknown>;
    isAssembly?: boolean;
    isComponent?: boolean;
};

type OcctNode = {
    name?: string;
    meshes?: number[];
    children?: OcctNode[];
};

type OcctResult = {
    success: boolean;
    error?: string;
    root?: OcctNode;
    meshes?: OcctMesh[];
};

const DEFAULT_COLOR = new THREE.Color(0xcccccc);
let occtRuntimePromise: Promise<any> | null = null;

declare global {
    interface Window {
        occtimportjs?: (moduleArg?: Record<string, unknown>) => Promise<any>;
    }
}

function getOcctScriptUrl(wasmUrl: string) {
    return wasmUrl.replace(/occt-import-js\.wasm(?:\?.*)?$/i, "occt-import-js.js");
}

async function ensureOcctRuntime(wasmUrl: string) {
    if (occtRuntimePromise) {
        return occtRuntimePromise;
    }

    occtRuntimePromise = (async () => {
        const existingFactory = globalThis.window?.occtimportjs;
        if (typeof existingFactory === "function") {
            return existingFactory({
                locateFile: (name: string) => name.endsWith(".wasm") ? wasmUrl : name
            });
        }

        const scriptUrl = getOcctScriptUrl(wasmUrl);
        await new Promise<void>((resolve, reject) => {
            const existingScript = document.querySelector(`script[data-occt-import-js="true"]`) as HTMLScriptElement | null;
            if (existingScript) {
                if (typeof globalThis.window?.occtimportjs === "function") {
                    resolve();
                    return;
                }
                existingScript.addEventListener("load", () => resolve(), { once: true });
                existingScript.addEventListener("error", () => reject(new Error(`Failed to load ${scriptUrl}`)), { once: true });
                return;
            }

            const script = document.createElement("script");
            script.src = scriptUrl;
            script.async = true;
            script.dataset.occtImportJs = "true";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${scriptUrl}`));
            document.head.appendChild(script);
        });

        const factory = globalThis.window?.occtimportjs;
        if (typeof factory !== "function") {
            throw new TypeError("window.occtimportjs is not available after script load");
        }

        return factory({
            locateFile: (name: string) => name.endsWith(".wasm") ? wasmUrl : name
        });
    })();

    try {
        return await occtRuntimePromise;
    } catch (error) {
        occtRuntimePromise = null;
        throw error;
    }
}

function getColorFromArray(color?: [number, number, number] | null) {
    if (!Array.isArray(color) || color.length < 3) {
        return DEFAULT_COLOR.clone();
    }
    return toIndustrialDisplayColor(new THREE.Color(color[0], color[1], color[2]));
}

function createMaterial(color: THREE.Color) {
    const material = new THREE.MeshPhongMaterial({
        color,
        side: THREE.DoubleSide,
        flatShading: false,
        shininess: 18,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
    });
    applyIndustrialMaterialStyle(material);
    return material;
}

function getOrCreateMaterial(materialCache: Map<number, THREE.MeshPhongMaterial>, color: THREE.Color) {
    const key = color.getHex();
    const cached = materialCache.get(key);
    if (cached) return cached;
    const created = createMaterial(color);
    materialCache.set(key, created);
    return created;
}

function buildThreeMesh(mesh: OcctMesh, materialCache: Map<number, THREE.MeshPhongMaterial>) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(Array.from(mesh.attributes.position.array), 3));

    if (mesh.attributes.normal?.array) {
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(Array.from(mesh.attributes.normal.array), 3));
    } else {
        geometry.computeVertexNormals();
    }

    if (mesh.index?.array) {
        geometry.setIndex(Array.from(mesh.index.array));
    }

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const baseColor = getColorFromArray(mesh.color);
    const baseMaterial = getOrCreateMaterial(materialCache, baseColor);
    const brepFaces = Array.isArray(mesh.brep_faces) ? mesh.brep_faces : [];
    const triangleCount = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;

    let material: THREE.MeshPhongMaterial | THREE.MeshPhongMaterial[] = baseMaterial;
    if (triangleCount > 0 && brepFaces.length > 0) {
        const validFaces = brepFaces
            .map((face) => ({
                first: Number(face.first),
                last: Number(face.last),
                color: face.color
            }))
            .filter((face) =>
                Number.isFinite(face.first) &&
                Number.isFinite(face.last) &&
                face.first >= 0 &&
                face.last >= face.first
            )
            .sort((a, b) => a.first - b.first);

        if (validFaces.length > 0) {
            geometry.clearGroups();
            const materials: THREE.MeshPhongMaterial[] = [baseMaterial];
            let triangleIndex = 0;

            for (const face of validFaces) {
                const start = Math.max(0, Math.min(triangleCount, face.first));
                const endExclusive = Math.max(start, Math.min(triangleCount, face.last + 1));

                if (start > triangleIndex) {
                    geometry.addGroup(triangleIndex * 3, (start - triangleIndex) * 3, 0);
                }

                const faceColor = getColorFromArray(face.color ?? mesh.color ?? null);
                materials.push(getOrCreateMaterial(materialCache, faceColor));
                geometry.addGroup(start * 3, (endExclusive - start) * 3, materials.length - 1);
                triangleIndex = Math.max(triangleIndex, endExclusive);
            }

            if (triangleIndex < triangleCount) {
                geometry.addGroup(triangleIndex * 3, (triangleCount - triangleIndex) * 3, 0);
            }

            material = materials.length > 1 ? materials : baseMaterial;
        }
    }

    const threeMesh = new THREE.Mesh(geometry, material);
    threeMesh.name = mesh.name || "CAD Part";
    threeMesh.userData = {
        ...(mesh.userData || {}),
        source: "OCCT",
        meshId: mesh.id,
        shapeName: mesh.name,
        color: baseColor.getHex(),
        isAssembly: !!mesh.isAssembly,
        isComponent: !!mesh.isComponent
    };
    threeMesh.frustumCulled = true;
    return threeMesh;
}

function attachMeshesToNode(
    parent: THREE.Object3D,
    node: OcctNode | undefined,
    meshByIndex: Map<number, THREE.Mesh>,
    nodeIndexPath: string
) {
    if (!node) {
        return;
    }

    const nodeName = typeof node.name === "string" ? node.name.trim() : "";
    const meshIndices = Array.isArray(node.meshes) ? node.meshes : [];
    const children = Array.isArray(node.children) ? node.children : [];

    const shouldCreateWrapper =
        !!nodeName ||
        children.length > 0 ||
        meshIndices.length > 1;

    let targetParent = parent;
    if (shouldCreateWrapper) {
        const wrapper = new THREE.Group();
        wrapper.name = nodeName || `CAD Node ${nodeIndexPath}`;
        wrapper.userData = {
            source: "OCCT",
            isCADNode: true,
            nodeName: wrapper.name
        };
        parent.add(wrapper);
        targetParent = wrapper;
    }

    for (const meshIndex of meshIndices) {
        const mesh = meshByIndex.get(meshIndex);
        if (!mesh) {
            continue;
        }
        targetParent.add(mesh);
    }

    children.forEach((child, childIndex) => {
        attachMeshesToNode(targetParent, child, meshByIndex, `${nodeIndexPath}.${childIndex}`);
    });
}

export class OCCTLoader {
    private wasmUrl: string;

    public readParameters: {
        productContext: number;
        assemblyLevel: number;
        shapeRepr: number;
        shapeAspect: number;
        subShapesNames: number;
        codePage: string;
        linearDeflection: number;
        angularDeflection: number;
    };

    constructor(wasmUrl: string = "/libs/occt-import-js/occt-import-js.wasm") {
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

    async load(buffer: ArrayBuffer, t: TFunc, onProgress?: (p: number, msg: string) => void): Promise<THREE.Group> {
        if (!buffer || buffer.byteLength === 0) {
            throw new Error(t("error_empty_file"));
        }

        if (onProgress) onProgress(10, t("loading_cad_engine"));

        let occt;
        try {
            occt = await ensureOcctRuntime(this.wasmUrl);
        } catch (e) {
            console.error("初始化 OCCT 引擎失败:", e);
            throw new Error(t("error_cad_engine_init_failed"));
        }

        if (onProgress) onProgress(30, t("parsing_cad_data"));

        const fileContent = new Uint8Array(buffer);
        let result: OcctResult | undefined;
        let stepError: any = null;
        let igesError: any = null;

        try {
            result = occt.ReadStepFile(fileContent, {
                linearDeflection: this.readParameters.linearDeflection,
                angularDeflection: this.readParameters.angularDeflection,
                productContext: this.readParameters.productContext,
                assemblyLevel: this.readParameters.assemblyLevel,
                shapeRepr: this.readParameters.shapeRepr,
                shapeAspect: this.readParameters.shapeAspect,
                subShapesNames: this.readParameters.subShapesNames,
                codePage: this.readParameters.codePage
            });
        } catch (e) {
            stepError = e;
            console.warn("STEP 解析失败，正在尝试 IGES...", e);
        }

        if (!result || !result.success) {
            try {
                result = occt.ReadIgesFile(fileContent, {
                    linearDeflection: this.readParameters.linearDeflection,
                    angularDeflection: this.readParameters.angularDeflection
                });
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

        if (!Array.isArray(result.meshes) || result.meshes.length === 0) {
            throw new Error(t("error_cad_no_meshes"));
        }

        if (onProgress) onProgress(70, t("creating_geometry"));

        const group = new THREE.Group();
        group.name = "CAD Model";
        group.userData = {
            source: "OCCT",
            isCADRoot: true
        };
        const materialCache = new Map<number, THREE.MeshPhongMaterial>();

        const meshByIndex = new Map<number, THREE.Mesh>();
        result.meshes.forEach((mesh, index) => {
            meshByIndex.set(index, buildThreeMesh(mesh, materialCache));
        });

        const rootNode = result.root;
        if (rootNode) {
            const rootMeshes = Array.isArray(rootNode.meshes) ? rootNode.meshes : [];
            rootMeshes.forEach((meshIndex) => {
                const mesh = meshByIndex.get(meshIndex);
                if (mesh) group.add(mesh);
            });

            const children = Array.isArray(rootNode.children) ? rootNode.children : [];
            children.forEach((child, childIndex) => {
                attachMeshesToNode(group, child, meshByIndex, String(childIndex));
            });
        }

        meshByIndex.forEach((mesh) => {
            if (!mesh.parent) {
                group.add(mesh);
            }
        });

        group.updateMatrixWorld(true);

        if (onProgress) onProgress(100, t("model_loaded"));
        return group;
    }
}
