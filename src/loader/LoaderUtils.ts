import * as THREE from "three";
import { LMBLoader } from "./lmbLoader";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { TFunc, ProgressCallback } from "../theme/Locales";
import { SceneSettings } from "../utils/SceneManager";
import { loadIFC } from "./IFCLoader";
import { OCCTLoader } from "./OCCTLoader";

export interface LoadedItem {
    name: string;
    uuid: string;
    type: "MODEL" | "TILES";
    object?: THREE.Object3D;
}

export const loadModelFiles = async (
    files: (File | string)[], 
    onProgress: ProgressCallback, 
    t: TFunc,
    settings: SceneSettings,
    libPath: string = './libs'
): Promise<THREE.Object3D[]> => {
    const loadedObjects: THREE.Object3D[] = [];
    const totalFiles = files.length;

    // 1. 加载所有文件
    for (let i = 0; i < totalFiles; i++) {
        const fileOrUrl = files[i];
        const isUrl = typeof fileOrUrl === 'string';
        let fileName = '';
        let ext = '';
        let url = '';

        if (isUrl) {
            url = fileOrUrl as string;
            // 移除查询参数和锚点以提取正确的文件名和扩展名
            const urlPath = url.split('?')[0].split('#')[0];
            fileName = urlPath.split('/').pop() || 'model';
            ext = fileName.split('.').pop()?.toLowerCase() || '';
            console.log(`[LoaderUtils] Loading URL: ${url}`);
            console.log(`[LoaderUtils] Parsed fileName: ${fileName}, ext: ${ext}`);
        } else {
            const file = fileOrUrl as File;
            fileName = file.name;
            ext = fileName.split('.').pop()?.toLowerCase() || '';
            url = URL.createObjectURL(file);
            console.log(`[LoaderUtils] Loading File: ${fileName}, ext: ${ext}`);
        }
        
        const fileBaseProgress = (i / totalFiles) * 100;
        const fileWeight = 100 / totalFiles;

        const updateFileProgress = (p: number, msg?: string) => {
            const safeP = isNaN(p) ? 0 : Math.min(100, Math.max(0, p));
            const status = msg || `${t("reading")} ${fileName}`;
            onProgress(Math.round(fileBaseProgress + (safeP * fileWeight / 100)), status);
        };
        
        updateFileProgress(0);

        let object: THREE.Object3D | null = null;

        try {
                console.log(`[LoaderUtils] Dispatching loader for ext: ${ext}`);
                if (ext === 'lmb') {
                    const loader = new LMBLoader();
                    object = await loader.loadAsync(url, (p) => updateFileProgress(p * 100));
                } else if (ext === 'glb' || ext === 'gltf') {
                    const loader = new GLTFLoader();
                    const gltf = await new Promise<any>((resolve, reject) => {
                        loader.load(url, resolve, (e) => {
                            if (e.total && e.total > 0) updateFileProgress(e.loaded / e.total * 100);
                            else updateFileProgress(50); 
                        }, reject);
                    });
                    object = gltf.scene;
                } else if (ext === 'fbx') {
                    console.log(`[LoaderUtils] Starting FBXLoader for ${url}`);
                    const loader = new FBXLoader();
                    object = await new Promise<THREE.Group>((resolve, reject) => {
                        loader.load(url, (fbx) => {
                            console.log(`[LoaderUtils] FBX loaded successfully:`, fbx);
                            resolve(fbx);
                        }, (e) => {
                            if (e.total && e.total > 0) updateFileProgress(e.loaded / e.total * 100);
                            else updateFileProgress(50);
                        }, (err) => {
                            console.error(`[LoaderUtils] FBXLoader error:`, err);
                            reject(err);
                        });
                    });
                } else if (ext === 'ifc') {
                    object = await loadIFC(isUrl ? url : (fileOrUrl as File), updateFileProgress, t, libPath);
                } else if (ext === 'obj') {
                    const loader = new OBJLoader();
                    object = await loader.loadAsync(url, (e) => {
                        if (e.total && e.total > 0) updateFileProgress(e.loaded / e.total * 100);
                    });
                } else if (ext === 'stl') {
                    const loader = new STLLoader();
                    const geometry = await loader.loadAsync(url, (e) => {
                        if (e.total && e.total > 0) updateFileProgress(e.loaded / e.total * 100);
                    });
                    object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x888888 }));
                } else if (ext === 'ply') {
                    const loader = new PLYLoader();
                    const geometry = await loader.loadAsync(url, (e) => {
                        if (e.total && e.total > 0) updateFileProgress(e.loaded / e.total * 100);
                    });
                    object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ 
                        color: 0x888888, 
                        vertexColors: geometry.hasAttribute('color') 
                    }));
                } else if (ext === '3mf') {
                    const loader = new ThreeMFLoader();
                    object = await loader.loadAsync(url, (e) => {
                        if (e.total && e.total > 0) updateFileProgress(e.loaded / e.total * 100);
                    });
                } else if (ext === 'stp' || ext === 'step' || ext === 'igs' || ext === 'iges') {
                    const buffer = isUrl ? await fetch(url).then(r => r.arrayBuffer()) : await (fileOrUrl as File).arrayBuffer();
                    const wasmUrl = `${libPath}/occt-import-js/occt-import-js.wasm`;
                    const loader = new OCCTLoader(wasmUrl);
                    object = await loader.load(buffer, t, (p, msg) => {
                        updateFileProgress(p, msg);
                    });
                }

                if (object) {
                    object.name = fileName;
                    loadedObjects.push(object);
                }
            } catch(e) {
                console.error(`加载${fileName}失败`, e);
            } finally {
                if (!isUrl) URL.revokeObjectURL(url);
            }
    }
    
    onProgress(100, t("analyzing"));

    // 2. 优化：重新启用视锥体剔除并计算边界
    for (const object of loadedObjects) {
        object.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                mesh.frustumCulled = true;
                if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
                if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
            }
        });
    }

    return loadedObjects;
};

export const parseTilesetFromFolder = async (files: FileList, onProgress: ProgressCallback, t: TFunc): Promise<string | null> => {
    onProgress(10, t("analyzing"));
    
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
            const m = blobUrlMap.get(node.content.uri);
            if (m) node.content.uri = m;
        }
        if (node.children) node.children.forEach(replaceUris);
    };
    replaceUris(json.root);

    onProgress(100, t("success"));
    const blob = new Blob([JSON.stringify(json)], { type: "application/json" });
    return URL.createObjectURL(blob);
};
