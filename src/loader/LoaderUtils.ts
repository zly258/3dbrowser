import * as THREE from "three";
import { LMBLoader } from "./lmbLoader";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TFunc } from "../theme/Locales";
import { SceneSettings, AxisOption } from "../utils/SceneManager";
import { loadIFC } from "./IFCLoader";

export interface LoadedItem {
    name: string;
    uuid: string;
    type: "MODEL" | "TILES";
    object?: THREE.Object3D;
}

export type ProgressCallback = (percent: number, msg?: string) => void;

// 辅助函数：纠正上轴到Y轴向上
const applyUpAxisCorrection = (object: THREE.Object3D, sourceAxis: AxisOption) => {
    // 我们假设目标是+Y轴向上（Three.js标准）
    const q = new THREE.Quaternion();
    
    switch (sourceAxis) {
        case '+x':
            // +X向上。我们需要X -> Y。绕Z轴旋转+90度。
            q.setFromAxisAngle(new THREE.Vector3(0,0,1), Math.PI/2);
            break;
        case '-x':
            // -X向上。我们需要-X -> Y。绕Z轴旋转-90度。
            q.setFromAxisAngle(new THREE.Vector3(0,0,1), -Math.PI/2);
            break;
        case '+y':
            // 已经是Y轴向上。
            return;
        case '-y':
            // -Y向上。绕X轴旋转180度。
            q.setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI);
            break;
        case '+z':
            // +Z向上（标准工程坐标）。绕X轴旋转-90度（右手坐标系）。
            q.setFromAxisAngle(new THREE.Vector3(1,0,0), -Math.PI/2);
            break;
        case '-z':
            // -Z向上。绕X轴旋转+90度。
            q.setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI/2);
            break;
    }

    object.applyQuaternion(q);
};



export const loadModelFiles = async (
    files: FileList | File[], 
    onProgress: ProgressCallback, 
    t: TFunc,
    settings: SceneSettings // 传递当前设置以读取轴配置
): Promise<THREE.Object3D[]> => {
    const loadedObjects: THREE.Object3D[] = [];
    const totalFiles = files.length;

    // 1. 加载所有文件
    for (let i = 0; i < totalFiles; i++) {
        const file = files[i];
        const ext = file.name.split('.').pop()?.toLowerCase();
        const url = URL.createObjectURL(file);
        
        const fileBaseProgress = (i / totalFiles) * 100;
        const fileWeight = 100 / totalFiles;

        const updateFileProgress = (p: number, msg?: string) => {
            const safeP = isNaN(p) ? 0 : Math.min(100, Math.max(0, p));
            // 如果子加载器提供消息，则使用它，否则使用默认值
            const status = msg || `${t("reading")} ${file.name}`;
            // 调整本地进度到全局权重
            onProgress(Math.round(fileBaseProgress + (safeP * fileWeight / 100)), status);
        };
        
        updateFileProgress(0);

        let object: THREE.Object3D | null = null;
        // 确定使用哪个轴设置
        let axisSetting: AxisOption = '+y';

        try {
                if (ext === 'lmb' || ext === 'lmbz') {
                    const loader = new LMBLoader();
                    loader.setEnableInstancing(settings.enableInstancing);
                    object = await loader.loadAsync(url, (p) => updateFileProgress(p * 100));
                    axisSetting = '+y'; // LMB通常使用Three.js原生的Y轴向上
                } else if (ext === 'glb' || ext === 'gltf') {
                    const loader = new GLTFLoader();
                    const gltf = await new Promise<any>((resolve, reject) => {
                        loader.load(url, resolve, (e) => {
                            if (e.total && e.total > 0) updateFileProgress(e.loaded / e.total * 100);
                            else updateFileProgress(50); 
                        }, reject);
                    });
                    object = gltf.scene;
                    axisSetting = settings.importAxisGLB;
                } else if (ext === 'ifc') {
                    object = await loadIFC(url, updateFileProgress, t);
                    axisSetting = settings.importAxisIFC;
                }

                if (object) {
                    object.name = file.name;
                    
                    // 应用轴向校正
                    applyUpAxisCorrection(object, axisSetting);

                    loadedObjects.push(object);
                }
            } catch(e) {
                console.error(`加载${file.name}失败`, e);
            } finally {
                URL.revokeObjectURL(url);
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
