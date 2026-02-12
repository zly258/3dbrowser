import * as THREE from 'three';
import { TFunc } from "../theme/Locales";
export declare class OCCTLoader {
    private wasmUrl;
    readParameters: {
        productContext: number;
        assemblyLevel: number;
        shapeRepr: number;
        shapeAspect: number;
        subShapesNames: number;
        codePage: string;
        linearDeflection: number;
        angularDeflection: number;
    };
    constructor(wasmUrl?: string);
    load(buffer: ArrayBuffer, t: TFunc, onProgress?: (p: number, msg: string) => void): Promise<THREE.Group>;
}
