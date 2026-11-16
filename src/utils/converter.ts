import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

export async function exportGLB(root: THREE.Object3D): Promise<Blob> {
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
