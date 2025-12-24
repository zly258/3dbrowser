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
): Promise<THREE.Group> => {
    // 我们创建一个包装器组来保存加载的模型。
    const container = new THREE.Group();
    container.name = "ImportedModels";

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

                    container.add(object);
                }
            } catch(e) {
                console.error(`加载${file.name}失败`, e);
            } finally {
                URL.revokeObjectURL(url);
            }
    }
    
    onProgress(100, t("analyzing"));

    // 2. 计算整个容器的世界边界
    // 这样做是为了找到加载数据的"全局中心"。
    container.updateMatrixWorld(true);
    const totalBox = new THREE.Box3();
    let hasContent = false;
    
    const tempMat = new THREE.Matrix4();

    container.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            
            // 优化：重新启用视锥体剔除
            mesh.frustumCulled = true;

            if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
            if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
            
            if (mesh.geometry.boundingBox) {
                // 处理实例化网格边界
                if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
                    const im = mesh as THREE.InstancedMesh;
                    const count = im.count;
                    // 采样实例以获得近似边界，避免在大型模型上冻结UI
                    const step = Math.max(1, Math.floor(count / 1000));
                    
                    for(let k=0; k<count; k+=step) {
                         im.getMatrixAt(k, tempMat);
                         // 将局部实例转换为世界坐标
                         tempMat.premultiply(im.matrixWorld);
                         const box = mesh.geometry.boundingBox.clone().applyMatrix4(tempMat);
                         totalBox.union(box);
                    }
                } 
                // 处理标准网格
                else {
                    const box = mesh.geometry.boundingBox.clone();
                    box.applyMatrix4(mesh.matrixWorld);
                    totalBox.union(box);
                }
                hasContent = true;
            }
        }
    });

    // 3. 居中模型（根偏移）
    // 而不是修改内部几何体（这会破坏层级结构/混乱），
    // 我们只需将容器移动到负中心。
    if (hasContent && !totalBox.isEmpty()) {
        const center = totalBox.getCenter(new THREE.Vector3());
        
        console.log("在以下位置找到全局中心：", center);
        
        if (center.lengthSq() > 100) { 
             // 存储偏移量以便稍后保存（用于导出）
             container.userData.originalCenter = center.clone();
             
             // 将容器相对于场景移动到(0,0,0)
             // 这保持了所有内部父子关系的完整性。
             // Three.js处理链式变换。
             container.position.copy(center).negate();
             
             // 强制更新矩阵，使新位置立即生效
             container.updateMatrixWorld(true);
             
             // 更新存储在userData上的边界框，以表示新的居中状态
             const centeredBox = totalBox.clone().translate(container.position);
             container.userData.boundingBox = centeredBox;
        } else {
             container.userData.boundingBox = totalBox;
        }
    }

    return container;
};

export const parseTilesetFromFolder = async (files: FileList, onProgress: ProgressCallback, t: TFunc): Promise<string | null> => {
    onProgress(10, t("分析中"));
    
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

    onProgress(50, t("读取中"));

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

    onProgress(100, t("成功"));
    const blob = new Blob([JSON.stringify(json)], { type: "application/json" });
    return URL.createObjectURL(blob);
};
