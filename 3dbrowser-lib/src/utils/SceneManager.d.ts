import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TilesRenderer } from "3d-tiles-renderer";
export type MeasureType = 'dist' | 'angle' | 'coord' | 'none';
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
    bgColor: string;
    viewCubeSize?: number;
    frustumCulling?: boolean;
    maxRenderDistance?: number;
    colorSpace?: 'srgb' | 'linear';
    toneMapping?: 'none' | 'aces' | 'neutral';
    exposure?: number;
    shadowQuality?: 'off' | 'low' | 'medium' | 'high';
    adaptiveQuality?: boolean;
    minPixelRatio?: number;
    maxPixelRatio?: number;
    targetFps?: number;
    sunLatitude?: number;
    sunLongitude?: number;
    sunTime?: number;
    sunEnabled?: boolean;
    sunShadow?: boolean;
    fontSize?: 'compact' | 'medium' | 'loose';
}
export interface StructureTreeNode {
    id: string;
    name: string;
    type: 'Mesh' | 'Group';
    children?: StructureTreeNode[];
    bimId?: string;
    chunkId?: string;
    visible?: boolean;
    userData?: any;
}
export declare class SceneManager {
    canvas: HTMLCanvasElement;
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    controls: OrbitControls;
    clock: THREE.Clock;
    contentGroup: THREE.Group;
    helpersGroup: THREE.Group;
    measureGroup: THREE.Group;
    ghostGroup: THREE.Group;
    clipHelpersGroup: THREE.Group;
    ambientLight: THREE.AmbientLight;
    dirLight: THREE.DirectionalLight;
    backLight: THREE.DirectionalLight;
    sunLight: THREE.DirectionalLight;
    structureRoot: StructureTreeNode;
    private nodeMap;
    private bimIdToNodeIds;
    tilesRenderer: TilesRenderer | null;
    selectionBox: THREE.Box3Helper;
    highlightMesh: THREE.Mesh;
    private lastSelectedUuid;
    private highlightedUuids;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    measureType: MeasureType;
    currentMeasurePoints: THREE.Vector3[];
    currentMeasureModelUuid: string | null;
    previewLine: THREE.Line | null;
    previewPolygon: THREE.LineLoop | null;
    tempMarker: THREE.Points;
    measureRecords: Map<string, MeasurementRecord>;
    private boxSelectState;
    clippingPlanes: THREE.Plane[];
    clipPlaneHelpers: THREE.Mesh[];
    sceneCenter: THREE.Vector3;
    globalOffset: THREE.Vector3;
    componentMap: Map<number | string, any>;
    optimizedMapping: Map<string, {
        mesh: THREE.BatchedMesh;
        instanceId: number;
        originalColor: number;
        geometry?: THREE.BufferGeometry;
    }[]>;
    settings: SceneSettings;
    dotTexture: THREE.Texture;
    sceneBounds: THREE.Box3;
    private cachedSceneSphere;
    private sceneSphereValid;
    precomputedBounds: THREE.Box3;
    private chunks;
    private processingChunks;
    private cancelledChunkIds;
    private frustum;
    private projScreenMatrix;
    private logicTimer;
    private nbimFiles;
    private nbimMeta;
    private nbimPropsByOriginalUuid;
    private sharedMaterial;
    private interactableList;
    private interactableListValid;
    private _needsBoundsUpdate;
    onTilesUpdate?: () => void;
    onStructureUpdate?: () => void;
    onMeasureUpdate?: (records: MeasurementRecord[]) => void;
    onChunkProgress?: (loaded: number, total: number) => void;
    private lastReportedProgress;
    private chunkLoadedCount;
    private chunkPadding;
    private maxConcurrentChunkLoads;
    private maxChunkLoadsPerFrame;
    private maxLoadedChunks;
    private maxCachedChunks;
    private chunkLoadingEnabled;
    private maxRenderDistance;
    private _lastCullingTime;
    private chunkMeshCache;
    private chunkCacheOrder;
    private originalStats;
    private originalStatsByModel;
    private workers;
    private workerQueue;
    private activeWorkerCount;
    private maxWorkers;
    private frameSampleTime;
    private frameCounter;
    private fps;
    private isCameraMoving;
    private activePixelRatio;
    private chunkLoadResumeAt;
    private cullingDirty;
    private deferredStructureThreshold;
    private octreeWorkerThreshold;
    private initialChunkLoadTarget;
    private warmupChunkBoost;
    private chunkWarmupActive;
    private chunkResidencyMs;
    private readonly chunkRuntimeProfiles;
    private movingPeripheralCursor;
    private movingPeripheralLastRefreshAt;
    private postMoveRecoveryUntil;
    private readonly chunkCullingTempSize;
    private readonly chunkCullingTempDirection;
    private readonly chunkCullingTempForward;
    private readonly chunkCullingTempCenterNdc;
    private boundsScanBatchSize;
    private chunkRegistrationBatchSize;
    private chunkGhostBatchSize;
    constructor(canvas: HTMLCanvasElement);
    updateSettings(newSettings: Partial<SceneSettings>): void;
    private updateSunPosition;
    private updateSunShadow;
    createCircleTexture(): any;
    animate(): void;
    private updateAdaptiveQuality;
    private initHardwareProfile;
    private collectObjectOverview;
    private countStructureRenderableNodes;
    private estimateNbimStats;
    private registerOriginalStats;
    private unregisterOriginalStats;
    private disposeChunkMesh;
    private touchChunkCache;
    private cacheChunkMesh;
    private takeCachedChunkMesh;
    private clearChunkCache;
    private unregisterOptimizedMeshMapping;
    private registerOptimizedMeshMapping;
    private ensureChunkGhost;
    private attachStructureRoot;
    private replaceStructureNode;
    private buildAndRegisterModelStructure;
    private yieldToMainThread;
    private createPreviewGhost;
    private computeItemBoundsProgressively;
    private createChunkGhostsProgressively;
    private registerLeafChunksProgressively;
    private buildLeafPlans;
    updateCameraClipping(): void;
    resize(width?: number, height?: number): void;
    private reportChunkProgress;
    private getChunkRuntimeProfile;
    private isInPostMoveRecovery;
    private isMovingPeripheralChunk;
    private shouldRefreshPeripheralChunk;
    private checkCullingAndLoad;
    private runWorkerTask;
    private processWorkerQueue;
    private unloadChunk;
    private loadChunk;
    setChunkLoadingEnabled(enabled: boolean): void;
    setContentVisible(visible: boolean): void;
    private buildSceneGraph;
    /**
     * 构建基于 IFC 图层和空间结构的复合树
     */
    /**
     * 构建基于 IFC 图层和空间结构的复合树
     */
    private buildIFCStructure;
    private prepareObjectRuntimeData;
    private applyGlobalOffsetForModel;
    private configureModelWarmup;
    private prepareStructureStage;
    private prepareModelBoundsStage;
    private prepareModelRuntimeStage;
    private attachModelToContentGroup;
    private prepareModelChunkStage;
    private finalizeModelStage;
    private scheduleDeferredStructureReplacement;
    addModel(object: THREE.Object3D, onProgress?: (p: number, msg: string) => void): Promise<void>;
    removeObject(uuid: string): boolean;
    removeModel(uuid: string): Promise<boolean>;
    addTileset(url: string, onProgress?: (p: number, msg: string) => void): import("3d-tiles-renderer").TilesGroup;
    private getTypeIndex;
    private guessType;
    private generateChunkBinaryV8;
    private reconstructBatchedMesh;
    exportNbim(): Promise<void>;
    loadNbim(file: File, onProgress?: (p: number, msg: string) => void): Promise<void>;
    clear(): Promise<void>;
    getStructureNodes(id: string): StructureTreeNode[] | undefined;
    getNbimProperties(id: string): any | null;
    setAllVisibility(visible: boolean): void;
    hideObjects(uuids: string[]): void;
    isolateObjects(uuids: string[]): void;
    setObjectVisibility(uuid: string, visible: boolean, showParents?: boolean): void;
    highlightObject(uuid: string | null): void;
    highlightObjects(uuids: string[]): void;
    pick(clientX: number, clientY: number): {
        object: THREE.Object3D;
        intersect: THREE.Intersection;
    } | null;
    getRayIntersects(clientX: number, clientY: number): THREE.Intersection | null;
    computeTotalBounds(onlyVisible?: boolean, forceRecompute?: boolean): THREE.Box3;
    updateSceneBounds(): void;
    fitView(keepOrientation?: boolean): void;
    fitViewToObject(uuid: string): void;
    fitBox(box: THREE.Box3, updateCameraPosition?: boolean): void;
    setView(view: string): void;
    getCameraState(): {
        position: any;
        target: any;
        zoom: any;
        left: any;
        right: any;
        top: any;
        bottom: any;
    };
    setCameraState(state: any): void;
    locateMeasurement(id: string): void;
    startMeasurement(type: MeasureType): void;
    addMeasurePoint(point: THREE.Vector3, modelUuid?: string): {
        id: string;
        type: string;
        val: string;
    } | null;
    private updateMeasurePreview;
    updateMeasureHover(clientX: number, clientY: number): void;
    finalizeMeasurement(): {
        id: string;
        type: MeasureType;
        val: string;
    };
    private createLabel;
    highlightMeasurement(id: string | null): void;
    pickMeasurement(clientX: number, clientY: number): string | null;
    addMarker(point: THREE.Vector3, parent: THREE.Object3D): void;
    addLine(points: THREE.Vector3[], parent: THREE.Object3D): void;
    private addLineLoop;
    private addPolygonFill;
    private computeGeometryVolume;
    private computeGeometryArea;
    /**
     * 获取对象的面积和体积
     */
    getObjectGeometryData(uuid: string): {
        area: number;
        volume: number;
    };
    /**
     * 开始框选
     */
    startBoxSelect(clientX: number, clientY: number): void;
    /**
     * 更新框选范围
     */
    updateBoxSelect(clientX: number, clientY: number): void;
    /**
     * 完成框选，返回选中的对象 UUID 列表
     */
    endBoxSelect(): string[];
    /**
     * 取消框选
     */
    cancelBoxSelect(): void;
    private updateBoxSelectRect;
    private removeBoxSelectRect;
    /**
     * 通过屏幕矩形选择对象
     */
    private selectByScreenRect;
    removeMeasurement(id: string): void;
    clearAllMeasurements(): void;
    clearMeasurementPreview(): void;
    setupClipping(): void;
    setClippingEnabled(enabled: boolean): void;
    updateClippingPlanes(bounds: THREE.Box3, values: {
        x: number[];
        y: number[];
        z: number[];
    }, active: {
        x: boolean;
        y: boolean;
        z: boolean;
    }): void;
    private updatePlaneHelper;
    /**
     * 检查包围盒是否完全被当前剖切面裁剪掉
     * 如果包围盒完全在任意一个激活的剖切面的“背面”，则认为被裁剪
     */
    private isBoxClipped;
    getStats(): {
        meshes: number;
        faces: number;
        memory: number;
        textureMemory: number;
        drawCalls: any;
        fps: number;
        chunksLoaded: number;
        chunksTotal: number;
        chunksQueued: number;
        pixelRatio: number;
    };
    dispose(): void;
}
