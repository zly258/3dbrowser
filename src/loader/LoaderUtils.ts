import * as THREE from "three";
import { TFunc, ProgressCallback } from "../theme/Locales";
import { SceneSettings } from "../utils/SceneManager";
import { createResourceResolver } from "./resourceResolver";

export interface LoadedItem {
    name: string;
    uuid: string;
    type: "MODEL" | "TILES";
    object?: THREE.Object3D;
}

type LoadStage = "fetch" | "parse" | "normalize" | "optimize" | "addToScene";

const STAGE_LABELS: Record<LoadStage, string> = {
    fetch: "reading",
    parse: "analyzing",
    normalize: "processing",
    optimize: "processing",
    addToScene: "processing"
};

const STAGE_WEIGHTS: Record<LoadStage, [number, number]> = {
    fetch: [0, 20],
    parse: [20, 58],
    normalize: [58, 72],
    optimize: [72, 92],
    addToScene: [92, 100]
};

const libPathCache = new Map<string, string>();

function normalizeLibPath(libPath: string) {
    if (!libPathCache.has(libPath)) {
        libPathCache.set(libPath, libPath.replace(/\/$/, ""));
    }
    return libPathCache.get(libPath)!;
}

function createLoadingManager(
    files: (File | string)[],
    _libPath: string,
    _settings: SceneSettings
) {
    const resourceResolver = createResourceResolver(files);
    const manager = new THREE.LoadingManager();

    if (resourceResolver) {
        manager.setURLModifier((url) => resourceResolver.resolve(url));
    }

    const cleanup = () => {
        resourceResolver?.dispose();
    };

    return { manager, cleanup, resourceResolver };
}

async function createGltfLoaderRuntime(manager: THREE.LoadingManager, libPath: string) {
    const [
        { GLTFLoader },
        { DRACOLoader },
        { KTX2Loader },
        { MeshoptDecoder }
    ] = await Promise.all([
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/loaders/DRACOLoader.js"),
        import("three/examples/jsm/loaders/KTX2Loader.js"),
        import("three/examples/jsm/libs/meshopt_decoder.module.js")
    ]);

    const normalizedLibPath = normalizeLibPath(libPath);
    const supportsCompressedTextures = typeof window !== "undefined" && !!window.createImageBitmap;
    let probeRenderer: THREE.WebGLRenderer | null = null;

    const dracoLoader = new DRACOLoader(manager);
    dracoLoader.setDecoderPath(`${normalizedLibPath}/draco/gltf/`);

    const ktx2Loader = new KTX2Loader(manager);
    ktx2Loader.setTranscoderPath(`${normalizedLibPath}/basis/`);

    if (typeof document !== "undefined") {
        try {
            probeRenderer = new THREE.WebGLRenderer({ canvas: document.createElement("canvas") });
            ktx2Loader.detectSupport(probeRenderer);
        } catch (error) {
            console.warn("[LoaderUtils] KTX2 detectSupport failed", error);
        }
    }

    const loader = new GLTFLoader(manager);
    loader.setDRACOLoader(dracoLoader);
    loader.setMeshoptDecoder(MeshoptDecoder);
    if (supportsCompressedTextures) {
        loader.setKTX2Loader(ktx2Loader);
    }

    return {
        loader,
        cleanup: () => {
            dracoLoader.dispose();
            ktx2Loader.dispose();
            probeRenderer?.dispose();
        }
    };
}

function createStageProgressReporter(
    onProgress: ProgressCallback,
    t: TFunc,
    fileName: string,
    fileBaseProgress: number,
    fileWeight: number
) {
    return (stage: LoadStage, progress: number, msg?: string) => {
        const [start, end] = STAGE_WEIGHTS[stage];
        const safeP = Math.min(100, Math.max(0, Number.isFinite(progress) ? progress : 0));
        const stagePercent = start + (safeP / 100) * (end - start);
        const totalPercent = fileBaseProgress + (stagePercent / 100) * fileWeight;
        const label = msg || `${t(STAGE_LABELS[stage])} ${fileName}`;
        onProgress(Math.round(totalPercent), label);
    };
}

async function loadObjectByExtension(
    fileOrUrl: File | string,
    url: string,
    ext: string,
    files: (File | string)[],
    reportStage: ReturnType<typeof createStageProgressReporter>,
    t: TFunc,
    settings: SceneSettings,
    libPath: string
) {
    const supportsCompressedTextures = typeof window !== "undefined" && !!window.createImageBitmap;
    const loaderContext = createLoadingManager(files, libPath, settings);
    const { manager, cleanup, resourceResolver } = loaderContext;

    try {
        if (ext === "lmb") {
            const { LMBLoader } = await import("./lmbLoader");
            const loader = new LMBLoader();
            reportStage("parse", 0);
            return await loader.loadAsync(url, (p) => reportStage("parse", p * 100));
        }

        if (ext === "glb" || ext === "gltf") {
            const { loader, cleanup: cleanupGltf } = await createGltfLoaderRuntime(manager, libPath);
            reportStage("parse", 0);
            try {
                const gltf = await new Promise<any>((resolve, reject) => {
                    loader.load(
                        url,
                        resolve,
                        (e) => {
                            if (e.total && e.total > 0) reportStage("parse", (e.loaded / e.total) * 100);
                            else reportStage("parse", 50);
                        },
                        reject
                    );
                });
                return gltf.scene;
            } finally {
                cleanupGltf();
            }
        }

        if (ext === "fbx") {
            const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
            const loader = new FBXLoader(manager);
            reportStage("parse", 0);
            return await new Promise<THREE.Group>((resolve, reject) => {
                loader.load(
                    url,
                    resolve,
                    (e) => {
                        if (e.total && e.total > 0) reportStage("parse", (e.loaded / e.total) * 100);
                        else reportStage("parse", 50);
                    },
                    reject
                );
            });
        }

        if (ext === "ifc") {
            const { loadIFC } = await import("./IFCLoader");
            reportStage("parse", 0);
            return await loadIFC(typeof fileOrUrl === "string" ? url : fileOrUrl, (p, msg) => reportStage("parse", p, msg), t, libPath, settings);
        }

        if (ext === "obj") {
            const [{ OBJLoader }, { MTLLoader }] = await Promise.all([
                import("three/examples/jsm/loaders/OBJLoader.js"),
                import("three/examples/jsm/loaders/MTLLoader.js")
            ]);
            const objLoader = new OBJLoader(manager);
            const mtlName = url.replace(/\.[^.]+$/i, ".mtl");
            if (resourceResolver?.has(mtlName)) {
                try {
                    const materials = await new Promise<any>((resolve, reject) => {
                        const mtlLoader = new MTLLoader(manager);
                        mtlLoader.load(mtlName, resolve, undefined, reject);
                    });
                    materials.preload();
                    objLoader.setMaterials(materials);
                } catch (error) {
                    console.warn("[LoaderUtils] Failed to load companion MTL", error);
                }
            }

            reportStage("parse", 0);
            return await objLoader.loadAsync(url, (e) => {
                if (e.total && e.total > 0) reportStage("parse", (e.loaded / e.total) * 100);
                else reportStage("parse", 50);
            });
        }

        if (ext === "stl") {
            const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
            const loader = new STLLoader(manager);
            reportStage("parse", 0);
            const geometry = await loader.loadAsync(url, (e) => {
                if (e.total && e.total > 0) reportStage("parse", (e.loaded / e.total) * 100);
            });
            return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x888888 }));
        }

        if (ext === "ply") {
            const { PLYLoader } = await import("three/examples/jsm/loaders/PLYLoader.js");
            const loader = new PLYLoader(manager);
            reportStage("parse", 0);
            const geometry = await loader.loadAsync(url, (e) => {
                if (e.total && e.total > 0) reportStage("parse", (e.loaded / e.total) * 100);
            });
            return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
                color: 0x888888,
                vertexColors: geometry.hasAttribute("color")
            }));
        }

        if (ext === "3mf") {
            const { ThreeMFLoader } = await import("three/examples/jsm/loaders/3MFLoader.js");
            const loader = new ThreeMFLoader(manager);
            reportStage("parse", 0);
            return await loader.loadAsync(url, (e) => {
                if (e.total && e.total > 0) reportStage("parse", (e.loaded / e.total) * 100);
            });
        }

        if (ext === "stp" || ext === "step" || ext === "igs" || ext === "iges") {
            reportStage("fetch", 0);
            const buffer = typeof fileOrUrl === "string"
                ? await fetch(url).then((r) => r.arrayBuffer())
                : await fileOrUrl.arrayBuffer();
            const wasmUrl = `${libPath}/occt-import-js/occt-import-js.wasm`;
            const { OCCTLoader } = await import("./OCCTLoader");
            const loader = new OCCTLoader(wasmUrl);
            reportStage("parse", 0);
            return await loader.load(buffer, t, (p, msg) => reportStage("parse", p, msg));
        }

        return null;
    } finally {
        cleanup();
    }
}

function normalizeLoadedObject(object: THREE.Object3D, settings: SceneSettings) {
    object.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.frustumCulled = settings.frustumCulling ?? true;

            if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
            if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();

            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((material) => {
                if (!material) return;

                if ("wireframe" in material) {
                    material.wireframe = false;
                }
            });
        }
    });
}

export const loadModelFiles = async (
    files: (File | string)[],
    onProgress: ProgressCallback,
    t: TFunc,
    settings: SceneSettings,
    libPath: string = "./libs"
): Promise<THREE.Object3D[]> => {
    const loadedObjects: THREE.Object3D[] = [];
    const totalFiles = files.length;

    for (let i = 0; i < totalFiles; i++) {
        const fileOrUrl = files[i];
        const isUrl = typeof fileOrUrl === "string";
        let fileName = "";
        let ext = "";
        let url = "";

        if (isUrl) {
            url = fileOrUrl;
            const urlPath = url.split("?")[0].split("#")[0];
            fileName = urlPath.split("/").pop() || "model";
            ext = fileName.split(".").pop()?.toLowerCase() || "";
        } else {
            fileName = fileOrUrl.name;
            ext = fileName.split(".").pop()?.toLowerCase() || "";
            url = URL.createObjectURL(fileOrUrl);
        }

        const fileBaseProgress = (i / totalFiles) * 100;
        const fileWeight = 100 / totalFiles;
        const reportStage = createStageProgressReporter(onProgress, t, fileName, fileBaseProgress, fileWeight);

        try {
            reportStage("fetch", 5);
            const object = await loadObjectByExtension(fileOrUrl, url, ext, files, reportStage, t, settings, libPath);
            if (!object) continue;

            object.name = fileName;
            reportStage("normalize", 30, `${t("processing")} ${fileName}`);
            normalizeLoadedObject(object, settings);
            reportStage("optimize", 100, `${t("analyzing")} ${fileName}`);
            reportStage("addToScene", 100, `${t("success")} ${fileName}`);
            loadedObjects.push(object);
        } catch (error) {
            console.error(`加载 ${fileName} 失败`, error);
        } finally {
            if (!isUrl) URL.revokeObjectURL(url);
        }
    }

    onProgress(100, t("analyzing"));
    return loadedObjects;
};

export const parseTilesetFromFolder = async (files: FileList, onProgress: ProgressCallback, t: TFunc): Promise<string | null> => {
    onProgress(10, t("analyzing"));

    const fileMap = new Map<string, Blob>();
    let tilesetKey = "";

    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const pathParts = f.webkitRelativePath.split("/");
        const relPath = pathParts.slice(1).join("/");

        if (relPath) {
            fileMap.set(relPath, f);
            if (f.name === "tileset.json") tilesetKey = relPath;
        } else {
            fileMap.set(f.name, f);
            if (f.name === "tileset.json") tilesetKey = f.name;
        }
    }

    if (!tilesetKey && fileMap.has("tileset.json")) tilesetKey = "tileset.json";

    if (!tilesetKey) {
        throw new Error("在所选文件夹中未找到tileset.json");
    }

    onProgress(50, t("reading"));

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
            const mapped = blobUrlMap.get(node.content.uri);
            if (mapped) node.content.uri = mapped;
        }
        if (node.children) node.children.forEach(replaceUris);
    };
    replaceUris(json.root);

    onProgress(100, t("success"));
    const blob = new Blob([JSON.stringify(json)], { type: "application/json" });
    return URL.createObjectURL(blob);
};
