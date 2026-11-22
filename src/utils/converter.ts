import * as THREE from "three";

/**
 * 导出 GLB。GLTFExporter 体积不小且只在“导出”时用到，
 * 因此改为动态 import，避免它被打进首屏入口 chunk。
 */
export async function exportGLB(root: THREE.Object3D): Promise<Blob> {
    const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
    const exporter = new GLTFExporter();
    return new Promise((resolve, reject) => {
        exporter.parse(
            root,
            (result) => {
                const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
                resolve(blob);
            },
            (err) => reject(err),
            { binary: true }
        );
    });
}
