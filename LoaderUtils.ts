
import * as THREE from "three";
import { LMBLoader } from "./lmbLoader";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { TFunc } from "./Locales";

export interface LoadedItem {
    name: string;
    uuid: string;
    type: "MODEL" | "TILES";
    object?: THREE.Object3D;
}

export type ProgressCallback = (percent: number, msg?: string) => void;

export const loadModelFiles = async (files: FileList | File[], onProgress: ProgressCallback, t: TFunc): Promise<THREE.Group> => {
    // We create a wrapper group that will hold the loaded models.
    const container = new THREE.Group();
    container.name = "ImportedModels";

    const totalFiles = files.length;

    // 1. Load all files
    for (let i = 0; i < totalFiles; i++) {
        const file = files[i];
        const ext = file.name.split('.').pop()?.toLowerCase();
        const url = URL.createObjectURL(file);
        
        const fileBaseProgress = (i / totalFiles) * 100;
        const fileWeight = 100 / totalFiles;

        const updateFileProgress = (p: number) => {
            const safeP = isNaN(p) ? 0 : Math.min(1, Math.max(0, p));
            onProgress(Math.round(fileBaseProgress + (safeP * fileWeight)), `${t("reading")} ${file.name}`);
        };
        
        updateFileProgress(0);

        let object: THREE.Object3D | null = null;

        try {
            if (ext === 'lmb' || ext === 'lmbz') {
                const loader = new LMBLoader();
                object = await loader.loadAsync(url, (p) => updateFileProgress(p * 1));
            } else if (ext === 'glb' || ext === 'gltf') {
                const loader = new GLTFLoader();
                const gltf = await new Promise<any>((resolve, reject) => {
                    loader.load(url, resolve, (e) => {
                        if (e.total && e.total > 0) updateFileProgress(e.loaded / e.total);
                        else updateFileProgress(0.5); 
                    }, reject);
                });
                object = gltf.scene;
            }

            if (object) {
                object.name = file.name;
                container.add(object);
            }
        } catch(e) {
            console.error(`Failed to load ${file.name}`, e);
        } finally {
            URL.revokeObjectURL(url);
        }
    }
    
    onProgress(100, t("analyzing"));

    // 2. Calculate World Bounds for the entire container
    // We do this to find the "Global Center" of the loaded data.
    container.updateMatrixWorld(true);
    const totalBox = new THREE.Box3();
    let hasContent = false;
    
    const tempMat = new THREE.Matrix4();

    container.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            
            // Fix Disappearance: Disable frustum culling.
            // When we shift things or if bounds are weird, culling often hides valid objects.
            mesh.frustumCulled = false;

            if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
            
            if (mesh.geometry.boundingBox) {
                // Handle InstancedMesh bounds
                if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
                    const im = mesh as THREE.InstancedMesh;
                    const count = im.count;
                    // Sample instances to get an approximate bound without freezing UI on massive models
                    const step = Math.max(1, Math.floor(count / 1000));
                    
                    for(let k=0; k<count; k+=step) {
                         im.getMatrixAt(k, tempMat);
                         // Convert local instance -> World
                         tempMat.premultiply(im.matrixWorld);
                         const box = mesh.geometry.boundingBox.clone().applyMatrix4(tempMat);
                         totalBox.union(box);
                    }
                } 
                // Handle Standard Mesh
                else {
                    const box = mesh.geometry.boundingBox.clone();
                    box.applyMatrix4(mesh.matrixWorld);
                    totalBox.union(box);
                }
                hasContent = true;
            }
        }
    });

    // 3. Center the Model (Root Shift)
    // Instead of modifying internal geometry (which breaks hierarchy/messy), 
    // we simply move the CONTAINER to the negative center.
    if (hasContent && !totalBox.isEmpty()) {
        const center = totalBox.getCenter(new THREE.Vector3());
        
        console.log("Global Center found at:", center);
        
        if (center.lengthSq() > 100) { 
             // Store the offset so we can save it later (for export)
             container.userData.originalCenter = center.clone();
             
             // Move the container to (0,0,0) relative to the Scene
             // This keeps all internal parent/child relationships intact.
             // Three.js handles the chained transforms.
             container.position.copy(center).negate();
             
             // Force update matrix so the new position takes effect immediately
             container.updateMatrixWorld(true);
             
             // Update the bounding box stored on userData to represent the NEW centered state
             const centeredBox = totalBox.clone().translate(container.position);
             container.userData.boundingBox = centeredBox;
        } else {
             container.userData.boundingBox = totalBox;
        }
    }

    return container;
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
        throw new Error("tileset.json not found in the selected folder");
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
