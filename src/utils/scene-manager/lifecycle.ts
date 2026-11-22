import type * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { disposeChunkWorkerPool, type ChunkWorkerTask } from "./chunkWorkerPool";

interface SceneManagerDisposeContext {
    cancelDeferredStructureBuild: () => void;
    clearLocateFocus: () => void;
    releaseGhostLine: (line: THREE.LineSegments) => void;
    clearChunkCache: () => void;
    controls: OrbitControls;
    selectionBox: THREE.Box3Helper;
    highlightMesh: THREE.Mesh;
    tempMarker: THREE.Points;
    dotTexture: THREE.Texture;
    sharedMaterial: THREE.Material;
    ghostEdgesGeometry: THREE.BufferGeometry;
    ghostMaterial: THREE.Material;
    renderer: THREE.WebGLRenderer;
    ghostGroup: THREE.Group;
    /** 显示边（CAD 线框）构建器，其几何缓存可达数百 MB，必须显式释放。 */
    displayEdges: { dispose: () => void };
    /** 其余需要逐层释放的组（测量标注、剖切辅助），其子对象不归 renderer.dispose() 管。 */
    extraGroups: Array<THREE.Group | null | undefined>;
    workers: Worker[];
    workerQueue: ChunkWorkerTask[];
    animationFrameId: number | null;
    onAnimationFrameDisposed: () => void;
    onWorkersDisposed: () => void;
    onQueuesReset: () => void;
    onStateCachesReset: () => void;
}

function disposeGeometryAndMaterial(object: { geometry?: THREE.BufferGeometry | null; material?: THREE.Material | THREE.Material[] | null }) {
    object.geometry?.dispose?.();
    const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    materials.forEach((material) => material?.dispose?.());
}

/**
 * 深度释放一个组下的所有几何体与材质，然后清空子节点。
 * `THREE.Group.clear()` 只脱离子对象、不调用 dispose()，因此重复 `setupClipping()` 之类
 * 的“清空重建”会持续泄漏 GPU 资源；销毁路径上必须先走这里。
 */
export function disposeGroupDeep(group: THREE.Group | null | undefined) {
    if (!group) return;
    group.traverse((child) => {
        const candidate = child as unknown as {
            geometry?: THREE.BufferGeometry | null;
            material?: THREE.Material | THREE.Material[] | null;
        };
        disposeGeometryAndMaterial(candidate);
    });
    group.clear();
}

export function disposeSceneManagerResources(context: SceneManagerDisposeContext) {
    context.cancelDeferredStructureBuild();
    context.clearLocateFocus();

    if (context.animationFrameId !== null) {
        cancelAnimationFrame(context.animationFrameId);
    }
    context.onAnimationFrameDisposed();

    disposeChunkWorkerPool({
        workers: context.workers,
        workerQueue: context.workerQueue,
        rejectReason: "SceneManager disposed"
    });
    context.onWorkersDisposed();

    context.onQueuesReset();
    context.onStateCachesReset();
    context.clearChunkCache();

    while (context.ghostGroup.children.length > 0) {
        const ghost = context.ghostGroup.children[0];
        context.ghostGroup.remove(ghost);
        context.releaseGhostLine(ghost as THREE.LineSegments);
    }

    context.controls.dispose();
    disposeGeometryAndMaterial(context.selectionBox);
    disposeGeometryAndMaterial(context.highlightMesh);
    disposeGeometryAndMaterial(context.tempMarker);
    context.dotTexture.dispose();
    context.sharedMaterial.dispose();
    context.ghostEdgesGeometry.dispose();
    context.ghostMaterial.dispose();
    context.displayEdges.dispose();
    for (const group of context.extraGroups) disposeGroupDeep(group);
    context.renderer.dispose();
}

