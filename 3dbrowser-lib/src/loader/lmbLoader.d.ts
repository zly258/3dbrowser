import * as THREE from "three";
import { Loader, LoadingManager } from "three";
export declare const setMaterialProperties: (material: THREE.Material) => void;
export declare const generateUniqueId: (name: string) => string;
export declare function decompressVertice(baseVertex: Float32Array, vertexScale: Float32Array, vertex: Int16Array): {
    rx: number;
    ry: number;
    rz: number;
};
export declare const decodeNormal: (packed: number) => {
    nx: number;
    ny: number;
    nz: number;
};
export declare const parseColor: (color: number) => number;
export declare const extractScaleFromMatrix3: (matrix: Float32Array) => number[];
export declare const normalizeMatrix3: (matrix: Float32Array) => Float32Array<ArrayBuffer>;
export declare const composeMatrixByMatrix3: (matrix: Float32Array, position: Float32Array) => any;
export declare class LMBLoader extends Loader {
    manager: LoadingManager;
    private static expressIdCounter;
    constructor(manager?: LoadingManager);
    loadAsync(url: string, onProgress?: (progress: any) => void): Promise<THREE.Group>;
    parse(buffer: ArrayBuffer, onProgress?: (progress: number) => void): any;
    parseNode(buffer: ArrayBuffer, view: DataView, offset: number): {
        name: string;
        matrix: Float32Array<ArrayBuffer>;
        position: Float32Array<ArrayBuffer>;
        vertices: Float32Array<ArrayBuffer>;
        normals: Float32Array<ArrayBuffer>;
        indices: any;
        colorIndex: number;
        instances: any[];
        nextOffset: number;
    };
}
