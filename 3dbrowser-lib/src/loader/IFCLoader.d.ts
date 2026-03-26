import * as THREE from "three";
import { ProgressCallback, TFunc } from "../theme/Locales";
export declare const loadIFC: (input: string | File | ArrayBuffer, onProgress: ProgressCallback, t: TFunc, libPath?: string) => Promise<THREE.Group>;
