import type * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface WorkerTask {
    reject: Function;
}

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
    workers: Worker[];
    workerQueue: WorkerTask[];
    logicTimer: ReturnType<typeof setInterval> | null;
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

export function disposeSceneManagerResources(context: SceneManagerDisposeContext) {
    context.cancelDeferredStructureBuild();
    context.clearLocateFocus();

    if (context.animationFrameId !== null) {
        cancelAnimationFrame(context.animationFrameId);
    }
    context.onAnimationFrameDisposed();

    if (context.logicTimer) {
        clearInterval(context.logicTimer);
    }

    for (const worker of context.workers) {
        try {
            worker.terminate();
        } catch (error) {
            console.warn("Worker terminate failed:", error);
        }
    }

    if (context.workerQueue.length > 0) {
        const pending = context.workerQueue.splice(0, context.workerQueue.length);
        pending.forEach((task) => task.reject(new Error("SceneManager disposed")));
    }
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
    context.renderer.dispose();
}

