import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

/**
 * 将3D场景导出为GLB格式
 * @param root 3D对象根节点
 * @returns 包含GLB数据的Blob
 */
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