import * as THREE from "three";

export type MeasureType = "dist" | "angle" | "coord" | "none";

export interface MeasurementRecord {
    id: string;
    type: string;
    val: string;
    group: THREE.Group;
    modelUuid?: string;
}

export interface SceneSettings {
    ambientInt: number;
    dirInt: number;
    backLightInt?: number;
    bgColor: string;
    highlightColor?: string;
    highlightShowBox?: boolean;
    clip?: {
        helperVisible?: boolean;
        helperOpacity?: number;
    };
    viewCubeSize?: number;
    frustumCulling?: boolean;
    maxRenderDistance?: number;
    colorSpace?: "srgb" | "linear";
    toneMapping?: "none" | "aces" | "neutral";
    exposure?: number;
    shadowQuality?: "off" | "low" | "medium" | "high";
    adaptiveQuality?: boolean;
    minPixelRatio?: number;
    maxPixelRatio?: number;
    targetFps?: number;
    performanceMode?: "balanced" | "smooth" | "quality";
}

export interface StructureTreeNode {
    id: string;
    name: string;
    type: "Mesh" | "Group";
    children?: StructureTreeNode[];
    bimId?: string;
    chunkId?: string;
    visible?: boolean;
    userData?: any;
}

export interface SceneManagerStats {
    meshes: number;
    faces: number;
    memory: number;
    textureMemory: number;
    drawCalls: number;
    chunksLoaded: number;
    chunksTotal: number;
    chunksQueued: number;
    pixelRatio: number;
}

