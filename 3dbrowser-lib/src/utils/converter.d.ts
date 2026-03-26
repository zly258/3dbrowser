import * as THREE from "three";
export declare function calculateGeometryMemory(geometry: THREE.BufferGeometry): number;
export declare function convertLMBTo3DTiles(root: THREE.Object3D, onProgress: (msg: string) => void): Promise<Map<string, Blob>>;
export declare function exportGLB(root: THREE.Object3D): Promise<Blob>;
export declare function exportLMB(root: THREE.Object3D, onProgress: (msg: string) => void): Promise<Blob>;
