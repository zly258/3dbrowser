import type * as THREE from "three";

/**
 * 释放一个 IFC 模型占用的 web-ifc WASM 内存。
 *
 * 为什么必须有：`OpenModel` 打开的模型会一直驻留在 WASM 堆里（一个 300MB 的 IFC 约 0.5~1GB），
 * 而此前整个项目没有任何 `CloseModel` 调用——批量转换连续处理多个 IFC 时内存只增不减，
 * 处理到第 2~4 个就会把页面拖死；清空场景也不会回收。
 *
 * 单独放一个轻量模块（而不是 in ifcLoader.ts）是为了让批量转换等入口不必把整个 ifcLoader
 * 打进主包。调用前必须确认该模型后续不再需要读属性/几何。
 */
export function releaseIfcRuntime(object: THREE.Object3D | null | undefined) {
    if (!object) return;
    const ifcApi = (object.userData as any)?.ifcAPI;
    const modelID = (object.userData as any)?.modelID;
    if (ifcApi && typeof modelID === "number" && typeof ifcApi.CloseModel === "function") {
        try {
            ifcApi.CloseModel(modelID);
        } catch (error) {
            console.warn("[IFC] 关闭模型失败", error);
        }
    }
    // 断开引用，避免结构树/属性闭包继续持有整棵实体图
    if (object.userData) {
        delete (object.userData as any).ifcAPI;
        delete (object.userData as any).ifcManager;
        delete (object.userData as any).modelID;
        delete (object.userData as any).ifcMetadataReady;
    }
}

/** 递归释放一个模型树里所有 IFC 运行时（多文件合并导出的场景会挂多个）。 */
export function releaseIfcRuntimes(root: THREE.Object3D | null | undefined) {
    if (!root) return;
    releaseIfcRuntime(root);
    root.traverse((child) => releaseIfcRuntime(child));
}
