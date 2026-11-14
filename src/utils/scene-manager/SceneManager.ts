import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
    calculateGeometryMemory,
    collectItems,
    collectItemsBatched,
    buildOctree,
    collectLeafNodes
} from "../octree";
import { deriveInitialRuntimeFromHardware } from "../scene-core/chunkRuntime";
import { debugLog } from "../scene-core/debugLogger";
import { stableExplodeDirection } from "../scene-core/explode";
import { readNbimHeader, readNbimManifest, type NbimManifest, type NbimPropertyDocument, type NbimPropertyNameIndexItem } from "../scene-core/nbimIO";
import {
    applyCancelBoxSelect,
    applyEndBoxSelect,
    applyStartBoxSelect,
    applyUpdateBoxSelect,
    createInitialBoxSelectState
} from "./boxSelect";
import {
    collectPrefetchCandidates,
    enqueueChunkPrefetch as enqueueChunkPrefetchItems,
    getChunkReadCacheBytes,
    hasValidChunkBinaryRange as hasValidChunkBinaryRangeValue,
    readChunkBuffer as readChunkBufferValue,
    trimChunkReadCache
} from "./chunkIO";
import {
    applyUnloadChunk,
    attachLoadedChunkMesh,
    cleanupChunkGhost,
    finalizeLoadedChunk,
    resolveChunkMeshForLoad
} from "./chunkExecution";
import { planChunkLoads, selectChunksToUnload } from "./chunkLifecycle";
import { reconstructBatchedMeshFromWorkerData } from "./chunkMesh";
import { applyIndustrialMaterials, applyIndustrialRendererSettings, createIndustrialSharedMaterial } from "./renderStyle";
import { applyDisplayMode, normalizeDisplayMode, type DisplayMode } from "./displayMode";
import { DisplayEdgeBuilder } from "./displayEdges";
import { ChunkRenderProxy } from "./renderProxy";
import { processChunkPrefetchQueue } from "./chunkPrefetch";
import {
    acquireGhostLineResource,
    cacheChunkMeshEntry,
    clearChunkMeshCacheEntries,
    createGhostLineResource,
    disposeChunkMeshResource,
    ensureChunkGhostResource,
    registerOptimizedMeshResourceMapping,
    releaseGhostLineResource,
    takeCachedChunkMeshEntry,
    touchChunkMeshCacheOrder,
    unregisterOptimizedMeshResourceMapping
} from "./chunkResources";
import { getBatchedGeometryId, getBatchedGeometryViewStats, getBatchedInstanceGeometry, getBatchedInstanceLocalBox, getBatchedInstanceWorldBox } from "./batchedGeometryView";
import { processChunkWorkerQueue, queueChunkWorkerTask, type ChunkWorkerTask } from "./chunkWorkerPool";
import { ensureChunkSpatialState, evaluateChunkVisibility } from "./chunkVisibility";
import {
    computeChunkFrameBudget,
    isMovingPeripheralChunk as isMovingPeripheralChunkRule,
    reportChunkProgressIfNeeded,
    selectChunkRuntimeProfile,
    updatePeripheralRefreshWindow
} from "./chunkScheduling";
import {
    applySetClipHelperOptions,
    applySetupClipping,
    applyUpdateClippingPlanes,
    isBoxClippedByPlanes
} from "./clipping";
import { disposeSceneManagerResources } from "./lifecycle";
import { getObjectGeometryDataFromScene } from "./geometry";
import {
    buildExportStructureTree,
    buildPropertyNameIndex,
    collectIfcModelReferences,
    collectIfcObjectBasicPropertyIndex,
    collectIfcObjectPropertyIndex,
    collectNbimBimProperties,
    collectNbimPropertyOwners,
    countStructureRenderableNodes,
    createNbimContainerGroup,
    deriveDefaultNbimStem,
    encodeNbimManifest,
    groupNbimPropertiesByOwner,
    prepareNbimExportChunks,
    resolveNbimPropertyDocuments,
    sanitizeDisplayLabel
} from "./nbim";
import {
    applyNbimGlobalBounds,
    appendNbimStructure,
    buildNbimQuickStats,
    finalizeNbimLoad,
    populateNbimNodeMappings,
    registerNbimChunks
} from "./nbimLoad";
import {
    applyClearLocateFocus,
    applyHighlightGlow,
    applyHighlightObjects,
    applyRefreshHighlightColors,
    applySetLocateResultSet,
    type HighlightInstanceRef
} from "./highlight";
import {
    collectAllRenderableTargets,
    collectRenderableBoundsForIds,
    collectRenderableTargetsForIds,
    type RenderTarget
} from "./renderTargets";
import {
    applyAddMeasurePoint,
    applyClearMeasurementPreview,
    applyFinalizeMeasurement,
    applyHighlightMeasurement,
    applyPickMeasurement,
    applyUpdateMeasureHover,
    applyUpdateMeasurePreview
} from "./measurement";
import {
    applyGetRayIntersects,
    ensureInteractableList,
    selectInteractablesByScreenRect
} from "./picking";
import {
    resolveBimIdByUuid,
    resolveNbimFlatProperties,
    resolveNbimIfcPropertyGroups,
    resolveNbimNode,
    resolveSelectionUuid as resolveSceneSelectionUuid,
    resolveNodeUuidByBimId as resolveSceneNodeUuidByBimId
} from "./selection";
import { collectSceneManagerStats } from "./stats";
import {
    applyVisibilityBatch,
    applyIsolateObjects,
    applySetAllVisibility,
    applySetObjectVisibility,
    type SceneVisibilityBatchOptions,
    type SceneVisibilityChange
} from "./visibility";
import {
    type PerformancePreset,
    type SceneChunkOptions,
    type SceneManagerOptions,
    resolveSceneChunkOptions
} from "../scene-core/types";
import {
    type MeasurementRecord,
    type MeasureType,
    type SceneManagerStats,
    type SceneSettings,
    type StructureTreeNode
} from "./types";
import type { PropertyGroupInput } from "../../viewer/propertyIndex";
import { sanitizeFileStem, stripFileExtension } from "../../viewer/exportNaming";

const CHUNK_PROGRESS_REPORT_INTERVAL_MS = 48;
const NBIM_CHUNK_REGISTRATION_BATCH = 220;
const GHOST_VISIBLE_FIRST_BATCH = 180;

type ExplodeMode = 'radial' | 'horizontal' | 'vertical';

interface ChunkRuntimeProfile {
    name: 'compact' | 'balanced' | 'massive';
    movingFocusCentralityThreshold: number;
    movingFocusPixelThreshold: number;
    chunkVisibilityHoldMs: number;
    centerPriorityThreshold: number;
    forwardPriorityThreshold: number;
    movingCoreCentralityThreshold: number;
    movingCorePixelThreshold: number;
    movingCoreForwardThreshold: number;
    movingPeripheralRefreshMs: number;
    movingPeripheralBatchRatio: number;
    movingPeripheralMinBatchSize: number;
    movingCullingIntervalMs: number;
    recoveryCullingIntervalMs: number;
    idleCullingIntervalMs: number;
    resumeAfterMoveMs: number;
    postMoveRecoveryMs: number;
    centerPriorityWindowMs: number;
    movingLoadBudgetMin: number;
    movingLoadBudgetMax: number;
    recoveryLoadBudgetMin: number;
    recoveryLoadBudgetMax: number;
    recoveryLoadBudgetRatio: number;
}

/**
 * 分块“解码后几何”到“真实堆占用”的经验倍数。
 * 历史：早期同时保留 worker 源数组 + BatchedMesh 合并缓冲 → 4.2；
 * S2 改为零拷贝视图 → 2.0。
 * S5 视图改为按需构建后，实测全模型 1165 块：堆 3034MB、固定开销约 548MB、
 * 读缓存 88MB → 每块真实足迹 ≈ 2.06MB，而名义几何 1.556MB → 倍数 ≈ 1.32。
 * 取 1.32：1978MB × 1.32 ≈ 2611MB，小于预算 2699MB，1271 块可全量驻留，
 * 预计堆 ≈ 3.25GB（78%），仍留出瞬时解码缓冲的余量。
 */
const CHUNK_FOOTPRINT_MULTIPLIER = 1.32;

export class SceneManager {
    canvas: HTMLCanvasElement;
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    controls: OrbitControls;
    clock: THREE.Clock;

    // 组
    contentGroup: THREE.Group;
    helpersGroup: THREE.Group;
    measureGroup: THREE.Group;
    ghostGroup: THREE.Group; // 渐进式加载时的占位边框组
    clipHelpersGroup: THREE.Group; // 剖切面辅助组

    // 灯光
    ambientLight: THREE.AmbientLight;
    hemiLight: THREE.HemisphereLight;
    dirLight: THREE.DirectionalLight;
    backLight: THREE.DirectionalLight;

    // 结构树
    structureRoot: StructureTreeNode = { id: 'root', name: 'Root', type: 'Group', children: [] };
    private nodeMap = new Map<string, StructureTreeNode[]>();
    private bimIdToNodeIds = new Map<string, string[]>();

    selectionBox: THREE.Box3Helper;
    highlightMesh: THREE.Mesh;
    /** 当前显示样式：真实（着色+边线）/ 着色 / 线框 */
    displayMode: DisplayMode = "shaded";
    private lastSelectedUuid: string | null = null; // 优化高亮，记录上次选中的 UUID
    private highlightedUuids: Set<string> = new Set();
    private highlightedInstance: HighlightInstanceRef | null = null;
    private highlightGlowUntil = 0;
    private lastHighlightGlowAt = 0;
    private highlightGlowSettled = true;
    private highlightGlowMesh: THREE.Mesh | null = null;
    private locateFocusUuid: string | null = null;
    private locateResultSet = new Set<string>();
    private locateMaterialCache = new Map<string, THREE.Material | THREE.Material[]>();
    private locateObjectMaterialCache = new Map<string, THREE.Material | THREE.Material[]>();
    private locateDimmedInstances = new Map<string, { mesh: THREE.BatchedMesh; instanceId: number; originalColor: number; originalVisible: boolean }>();
    private locateIsolationRestoreChanges: SceneVisibilityChange[] = [];
    private locateIsolationActive = false;
    private clashPairObjectMaterialCache = new Map<string, THREE.Material | THREE.Material[]>();
    private clashPairInstanceColorCache = new Map<string, { mesh: THREE.BatchedMesh; instanceId: number; originalColor: number }>();
    private clashPairUuids = new Set<string>();
    private highlightPulseColor = new THREE.Color("#ffffff");
    private explodeEnabled = false;
    private explodeStrength = 0;
    private explodeCenter = new THREE.Vector3();
    private explodeMode: ExplodeMode = 'radial';
    private explodeObjectStates = new Map<string, { object: THREE.Object3D; basePosition: THREE.Vector3; directionLocal: THREE.Vector3; weight: number }>();
    private explodeInstanceStates = new Map<string, { mesh: THREE.BatchedMesh; instanceId: number; baseMatrix: THREE.Matrix4; directionLocal: THREE.Vector3; weight: number }>();
    private readonly explodeScratchUniform = new THREE.Vector3();
    private readonly explodeScratchMix = new THREE.Vector3();
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;

    // 测量状态
    measureType: MeasureType = 'none';
    currentMeasurePoints: THREE.Vector3[] = [];
    currentMeasureModelUuid: string | null = null;
    previewLine: THREE.Line | null = null;
    previewPolygon: THREE.LineLoop | null = null;
    tempMarker: THREE.Points;
    measureRecords: Map<string, MeasurementRecord> = new Map();

    // 框选状态
    private boxSelectState = createInitialBoxSelectState();

    // 裁剪状态
    clippingPlanes: THREE.Plane[] = [];
    clipPlaneHelpers: THREE.Mesh[] = [];
    clipHelperVisible = false;
    clipHelperOpacity = 0.12;

    sceneCenter: THREE.Vector3 = new THREE.Vector3();

    // 偏移状态 (解决大坐标问题)
    globalOffset: THREE.Vector3 = new THREE.Vector3();

    // 组件映射
    componentMap: Map<number | string, any> = new Map();

    // 优化后的网格映射: originalUuid -> { mesh, instanceId, originalColor, geometry }[]
    optimizedMapping: Map<string, { mesh: THREE.BatchedMesh, instanceId: number, originalColor: number, geometry?: THREE.BufferGeometry }[]> = new Map();

    // 设置
    settings: SceneSettings = {
        // 环境光偏高会让“着色（无边线）”模式显得发白发浅、体积感弱；
        // 这里压低环境光、略提主光，靠明暗关系而不是纯亮度来区分构件。
        ambientInt: 0.62,
        dirInt: 1.55,
        hemiInt: 0.46,
        bgColor: "#eef1f5",
        viewCubeSize: 100,
        colorSpace: 'srgb',
        toneMapping: 'aces',
        exposure: 0.92,
        shadowQuality: 'medium',
        adaptiveQuality: true,
        minPixelRatio: 0.6,
        maxPixelRatio: 2,
        targetFps: 50,
        performanceMode: 'balanced',
        autoResident: true,
        highlightColor: "#0b5fa5",
        highlightShowBox: false,
        backLightInt: 0.62,
        maxRenderDistance: 1000000, // 增加默认渲染距离到 1km (针对 mm 单位)
    };

    // 资源
    dotTexture: THREE.Texture;

    // 缓存
    sceneBounds: THREE.Box3 = new THREE.Box3();
    private cachedSceneSphere: THREE.Sphere = new THREE.Sphere();
    private sceneSphereValid: boolean = false;
    precomputedBounds: THREE.Box3 = new THREE.Box3(); // 预计算的包围盒

    // 渐进式加载状态 (对齐 refs)
    private chunks: any[] = [];
    private chunkIdSet = new Set<string>();
    private chunkById = new Map<string, any>();
    private chunkIndexById = new Map<string, number>();
    private processingChunks = new Set<string>();
    private cancelledChunkIds = new Set<string>();
    private frustum = new THREE.Frustum();
    private projScreenMatrix = new THREE.Matrix4();
    private logicTimer: any = null;
    private nbimFiles: Map<string, File> = new Map(); // 支持多文件引用
    private nbimMeta: Map<string, { version: number; bimIdTable?: string[] }> = new Map();
    private nbimPropsByOriginalUuid: Map<string, Record<string, any>> = new Map();
    private nbimSearchDocsByUuid: Map<string, NbimPropertyDocument> = new Map();
    private nbimSearchDocsByBimId: Map<string, NbimPropertyDocument> = new Map();
    /** 全部属性文档（按 uuid 去重），供搜索一次遍历；避免从多键 Map 重复展开 3 倍。 */
    private nbimAllSearchDocs: NbimPropertyDocument[] = [];
    private nbimDocIndexByUuid: Map<string, number> = new Map();
    /** 超大模型的属性文档先按原始键挂起，选中/搜索时再按需索引，避免加载时卡住主线程。 */
    private nbimPendingDocs: Record<string, NbimPropertyDocument> | null = null;
    private nbimPendingDocsList: NbimPropertyDocument[] | null = null;
    private nbimPendingRootId = "";
    private nbimPropertyNameIndex: Map<string, NbimPropertyNameIndexItem> = new Map();
    private nbimPropertyNameIndexVersion = 0;
    private sharedMaterial = createIndustrialSharedMaterial();

    // 拾取优化
    private interactableList: THREE.Object3D[] = [];
    private interactableListValid: boolean = false;
    private _needsBoundsUpdate: boolean = false;

    // 回调
    onStructureUpdate?: () => void;
    onMeasureUpdate?: (records: MeasurementRecord[]) => void;
    onChunkProgress?: (loaded: number, total: number, pending: number) => void;

    private lastReportedProgress = { loaded: -1, total: -1, pending: -1 };
    private lastChunkProgressReportAt = 0;
    private chunkLoadedCount: number = 0;
    private chunkPadding = 0.2;
    private maxConcurrentChunkLoads = 128; // 提高并发
    private maxChunkLoadsPerFrame = 64;   // 提高并发
    private maxLoadedChunks = 512;        // 最大已加载分块数，超过则卸载最远的
    /** 着色模式下的常驻上限；切到真实/线框时临时下调，切回时恢复 */
    private shadedMaxLoadedChunks = 0;
    /** 最近一次预算计算里的固定开销（属性/结构树/JS 基线），用于样式切换时估算 */
    private lastBaseUsedMB = 650;
    /** 切到真实/线框时，分帧卸载的定时器 */
    private edgeTransitionTimer: number | null = null;
    /** 切真实/线框后逐帧补边线的队列（避免一次性生成上百块边线卡死主线程） */
    private edgeBuildQueue: THREE.Object3D[] = [];
    private edgeBuildTimer: number | null = null;
    private edgeBuildGeneration = 0;
    private maxCachedChunks = 48;
    /** 已加载分块解码后的内存预算（MB），为 0 时只按数量限制。 */
    private chunkResidentBudgetMB = 0;
    /** NBIM 分块“原始字节 → 解码后几何内存”的实测比例（由 manifest.stats 推导）。 */
    private nbimDecodedMBPerRawByte = 1;
    /** 整个模型能装进内存预算时，忽略 4px 小分块剔除，把全部分块加载出来。 */
    private allowFullChunkLoad = false;
    /** 当前模型（含已打开的其他模型）能否全部装进内存预算 */
    private fitsAllChunks = false;
    /** 上一轮 culling 是否成功排到了待加载分块；用于按需渲染循环是否要继续。 */
    private chunkLoadPlanPending = false;
    private chunkLoadingEnabled = true;
    private maxRenderDistance = 1000000; // 最大渲染距离
    private _lastCullingTime: number = 0;
    private chunkMeshCache = new Map<string, THREE.BatchedMesh>();
    private chunkCacheOrder: string[] = [];
    private readonly chunkReadCache = new Map<string, ArrayBuffer>();
    private chunkReadCacheOrder: string[] = [];
    private prefetchQueue: string[] = [];
    private prefetchQueueSet = new Set<string>();
    private prefetchInFlight = new Set<string>();
    private prefetchRoundRobinCursor = 0;
    private prefetchPaused = false;
    private originalStats = { meshes: 0, faces: 0, memory: 0 };
    private originalStatsByModel = new Map<string, { meshes: number; faces: number; memory: number }>();

    // Worker 池
    private workers: Worker[] = [];
    private workerQueue: ChunkWorkerTask[] = [];
    private activeWorkerCount = 0;
    private maxWorkers = 4; // 限制固定为 4 个，平衡性能与系统开销
    private readonly options: SceneManagerOptions;
    private readonly resolvedChunkOptions: ReturnType<typeof resolveSceneChunkOptions>;
    /** 远景粗 LOD：按实例世界尺寸剔除小构件 */
    private coarseLodEnabled = false;
    private isCameraMoving = false;
    private wasCameraMoving = false;
    private cameraMoveSettleTimer: number | null = null;
    private lastDisplayEdgeOpacityAt = 0;
    private activePixelRatio = 1;
    /** 已应用到渲染器的像素比（setPixelRatio 会重新分配绘图缓冲，必须去重） */
    private appliedPixelRatio = 0;
    /** 已应用到渲染器的绘图缓冲尺寸（setSize 会清空画布，必须去重） */
    private appliedBufferWidth = -1;
    private appliedBufferHeight = -1;
    private chunkLoadResumeAt = 0;
    private cullingDirty = true;
    private deferredStructureThreshold = 20000;
    private octreeWorkerThreshold = 25000;
    private initialChunkLoadTarget = 18;
    private warmupChunkBoost = 12;
    private chunkWarmupActive = false;
    private chunkResidencyMs = 1800;
    private readonly chunkRuntimeProfiles: Record<ChunkRuntimeProfile['name'], ChunkRuntimeProfile> = {
        compact: {
            name: 'compact',
            movingFocusCentralityThreshold: 0.16,
            movingFocusPixelThreshold: 24,
            chunkVisibilityHoldMs: 180,
            centerPriorityThreshold: 0.52,
            forwardPriorityThreshold: 0.64,
            movingCoreCentralityThreshold: 0.5,
            movingCorePixelThreshold: 36,
            movingCoreForwardThreshold: 0.58,
            movingPeripheralRefreshMs: 140,
            movingPeripheralBatchRatio: 0.24,
            movingPeripheralMinBatchSize: 40,
            movingCullingIntervalMs: 34,
            recoveryCullingIntervalMs: 58,
            idleCullingIntervalMs: 120,
            resumeAfterMoveMs: 90,
            postMoveRecoveryMs: 320,
            centerPriorityWindowMs: 180,
            movingLoadBudgetMin: 2,
            movingLoadBudgetMax: 8,
            recoveryLoadBudgetMin: 4,
            recoveryLoadBudgetMax: 12,
            recoveryLoadBudgetRatio: 0.45
        },
        balanced: {
            name: 'balanced',
            movingFocusCentralityThreshold: 0.18,
            movingFocusPixelThreshold: 28,
            chunkVisibilityHoldMs: 220,
            centerPriorityThreshold: 0.58,
            forwardPriorityThreshold: 0.68,
            movingCoreCentralityThreshold: 0.54,
            movingCorePixelThreshold: 42,
            movingCoreForwardThreshold: 0.62,
            movingPeripheralRefreshMs: 180,
            movingPeripheralBatchRatio: 0.18,
            movingPeripheralMinBatchSize: 64,
            movingCullingIntervalMs: 40,
            recoveryCullingIntervalMs: 72,
            idleCullingIntervalMs: 140,
            resumeAfterMoveMs: 110,
            postMoveRecoveryMs: 480,
            centerPriorityWindowMs: 240,
            movingLoadBudgetMin: 2,
            movingLoadBudgetMax: 6,
            recoveryLoadBudgetMin: 4,
            recoveryLoadBudgetMax: 10,
            recoveryLoadBudgetRatio: 0.36
        },
        massive: {
            name: 'massive',
            movingFocusCentralityThreshold: 0.2,
            movingFocusPixelThreshold: 32,
            chunkVisibilityHoldMs: 260,
            centerPriorityThreshold: 0.62,
            forwardPriorityThreshold: 0.72,
            movingCoreCentralityThreshold: 0.58,
            movingCorePixelThreshold: 48,
            movingCoreForwardThreshold: 0.66,
            movingPeripheralRefreshMs: 220,
            movingPeripheralBatchRatio: 0.12,
            movingPeripheralMinBatchSize: 96,
            movingCullingIntervalMs: 46,
            recoveryCullingIntervalMs: 88,
            idleCullingIntervalMs: 180,
            resumeAfterMoveMs: 130,
            postMoveRecoveryMs: 620,
            centerPriorityWindowMs: 300,
            movingLoadBudgetMin: 2,
            movingLoadBudgetMax: 5,
            recoveryLoadBudgetMin: 3,
            recoveryLoadBudgetMax: 8,
            recoveryLoadBudgetRatio: 0.28
        }
    };
    private movingPeripheralCursor = 0;
    private movingPeripheralLastRefreshAt = 0;
    private postMoveRecoveryUntil = 0;
    private deferredStructureTimer: ReturnType<typeof setTimeout> | null = null;
    private deferredStructureToken = 0;
    private loadGeneration = 0;
    private fastPreviewMeshLimit = 1200;
    private fastPreviewModels = new Set<string>();
    private readonly chunkCullingTempSize = new THREE.Vector3();
    private readonly chunkCullingTempDirection = new THREE.Vector3();
    private readonly chunkCullingTempForward = new THREE.Vector3();
    private readonly chunkCullingTempCenterNdc = new THREE.Vector3();
    private boundsScanBatchSize = 2400;
    private chunkRegistrationBatchSize = 18;
    private chunkGhostBatchSize = 24;
    private animationFrameId: number | null = null;
    private cameraFlightFrameId: number | null = null;
    private cameraFlightToken = 0;
    private animateFramePending = false;
    private disposed = false;
    private interactionShadowDowngraded = false;
    private interactionShadowRestoreAt = 0;
    private interactionShadowRestoreDelayMs = 220;
    private cullingScanCursor = 0;
    private cullingTimeBudgetMovingMs = 4.5;
    private cullingTimeBudgetRecoveryMs = 6.0;
    private cullingTimeBudgetIdleMs = 9.0;
    private forceMaxChunkLoadSpeed = true;

    private ghostEdgesGeometry: THREE.EdgesGeometry;
    private ghostMaterial: THREE.LineBasicMaterial;
    private ghostMeshPool: THREE.LineSegments[] = [];
    /** 渲染预算代理（远景分块用线框盒子代替完整几何，1 个 draw call） */
    private renderProxy: ChunkRenderProxy | null = null;
    private renderBudgetMode: "auto" | "full" = "full";
    private renderBudgetTriangles = 70000000;
    private renderBudgetChunkMax = 700;
    private renderBudgetSelected = new Set<string>();
    /** 连续多次采样到堆高水位后才触发卸载，避免瞬时 GC 抖动误判 */
    private memoryPressureScore = 0;

    private getChunkCostMB(chunk: any) {
        const value = Number(chunk?.estimatedDecodedMB);
        if (Number.isFinite(value) && value > 0) return value;
        return Math.max(1.5, ((Number(chunk?.byteLength) || 0) / 1048576) * 1.1);
    }

    /** 当前已加载分块占用的估算内存（MB），用于从“已用堆”里扣除几何占用，避免重复计账。 */
    private getResidentChunkMB() {
        let sum = 0;
        for (const chunk of this.chunks) {
            if (chunk?.loaded) sum += this.getChunkCostMB(chunk);
        }
        return sum;
    }

    private registerChunk(chunk: any) {
        this.chunks.push(chunk);
        this.chunkIdSet.add(chunk.id);
        this.chunkById.set(chunk.id, chunk);
        this.chunkIndexById.set(chunk.id, this.chunks.length - 1);
    }

    private rebuildChunkIdSet() {
        this.chunkIdSet.clear();
        this.chunkById.clear();
        this.chunkIndexById.clear();
        for (let index = 0; index < this.chunks.length; index++) {
            const chunk = this.chunks[index];
            this.chunkIdSet.add(chunk.id);
            this.chunkById.set(chunk.id, chunk);
            this.chunkIndexById.set(chunk.id, index);
        }
    }

    private getChunkById(chunkId: string) {
        return this.chunkById.get(chunkId);
    }

    private getChunkIndex(chunkId: string) {
        return this.chunkIndexById.get(chunkId) ?? -1;
    }

    constructor(canvas: HTMLCanvasElement, options: SceneManagerOptions = {}) {
        this.canvas = canvas;
        this.options = options;
        this.resolvedChunkOptions = resolveSceneChunkOptions(options.chunkOptions);
        // 粗 LOD 仅显式开启（chunkOptions.coarseLod / URL ?coarseLod=1）。
        // 之前按“堆上限 <2.8GB 自动开启”，但放大触发的卸载/重载会造成导航抖动，
        // 且会悄悄让远景小构件不可选；默认关闭，由用户显式选择。
        this.coarseLodEnabled = !!this.resolvedChunkOptions.coarseLod;
        if (options.performancePreset) {
            this.settings.performanceMode = options.performancePreset;
        }
        // 渲染预算代理：默认关闭，只有 URL ?renderBudget=auto 或 chunkOptions 显式开启
        const renderBudgetParam = typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("renderBudget")
            : null;
        this.renderBudgetMode = (renderBudgetParam === "auto" || this.resolvedChunkOptions.renderBudget === "auto")
            ? "auto"
            : "full";
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        // 为点生成简单的圆形精灵纹理
        this.dotTexture = this.createCircleTexture();
        this.clock = new THREE.Clock();
        this.initHardwareProfile();

        this.ghostEdgesGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
        this.ghostMaterial = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.1 });

        // 渲染器
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false,
            logarithmicDepthBuffer: false, // 正交相机不建议开启对数深度缓冲区，会导致 negative near 裁剪问题
            precision: "highp",
            powerPreference: "high-performance"
        });
        // 重要：设置初始大小
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 限制最大像素比为2，平衡性能与清晰度
        this.renderer.setSize(width, height, false);
        applyIndustrialRendererSettings(this.renderer, this.settings.bgColor, this.settings.exposure);
        this.renderer.localClippingEnabled = true;
        this.activePixelRatio = this.renderer.getPixelRatio();
        this.appliedPixelRatio = this.activePixelRatio;
        this.appliedBufferWidth = Math.floor(width * this.appliedPixelRatio);
        this.appliedBufferHeight = Math.floor(height * this.appliedPixelRatio);

        // 场景
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.settings.bgColor);
        this.displayEdges.setBackground(this.settings.bgColor);

        // 组
        this.contentGroup = new THREE.Group();
        this.contentGroup.name = "Content";
        this.scene.add(this.contentGroup);

        this.helpersGroup = new THREE.Group();
        this.helpersGroup.name = "Helpers";
        this.scene.add(this.helpersGroup);

        this.measureGroup = new THREE.Group();
        this.measureGroup.name = "Measure";
        this.scene.add(this.measureGroup);

        this.ghostGroup = new THREE.Group();
        this.ghostGroup.name = "Ghost";
        this.scene.add(this.ghostGroup);
        this.renderProxy = new ChunkRenderProxy(this.scene, this.ghostMaterial, 4096);

        this.clipHelpersGroup = new THREE.Group();
        this.clipHelpersGroup.name = "ClipHelpers";
        this.scene.add(this.clipHelpersGroup);

        // 相机
        const frustumSize = 100;
        const aspect = width / height;
        this.camera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2,
            frustumSize * aspect / 2,
            frustumSize / 2,
            frustumSize / -2,
            -1000000, 1000000
        );
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(1000, -1000, 1000);
        this.camera.lookAt(0, 0, 0);

        // 控制器
        this.controls = new OrbitControls(this.camera, canvas);
        this.controls.enableDamping = false;
        this.controls.screenSpacePanning = true;
        this.controls.maxPolarAngle = Math.PI;
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: undefined as any
        };
        this.controls.addEventListener('start', () => {
            const profile = this.getChunkRuntimeProfile();
            if (this.cameraMoveSettleTimer !== null) {
                window.clearTimeout(this.cameraMoveSettleTimer);
                this.cameraMoveSettleTimer = null;
            }
            this.isCameraMoving = true;
            this.prefetchPaused = true;
            this.chunkLoadResumeAt = performance.now() + profile.resumeAfterMoveMs;
            this.postMoveRecoveryUntil = 0;
            this.interactionShadowRestoreAt = 0;
            this.movingPeripheralLastRefreshAt = 0;
            this.movingPeripheralCursor = 0;
            this.markSceneDirty({ needsCulling: true });
        });
        this.controls.addEventListener('change', () => {
            const profile = this.getChunkRuntimeProfile();
            this.isCameraMoving = true;
            this.prefetchPaused = true;
            this.chunkLoadResumeAt = performance.now() + profile.resumeAfterMoveMs;
            this.postMoveRecoveryUntil = 0;
            this.interactionShadowRestoreAt = 0;
            this.markSceneDirty({ needsCulling: true });

            // 滚轮缩放等操作不一定触发 end 事件；用 200ms 静止兜底恢复满分辨率。
            if (this.cameraMoveSettleTimer !== null) window.clearTimeout(this.cameraMoveSettleTimer);
            this.cameraMoveSettleTimer = window.setTimeout(() => {
                this.cameraMoveSettleTimer = null;
                if (!this.isCameraMoving) return;
                this.isCameraMoving = false;
                this.wasCameraMoving = false;
                this.restoreFullRenderQuality();
                this.markSceneDirty({ needsCulling: true });
            }, 200);
        });
        this.controls.addEventListener('end', () => {
            const now = performance.now();
            const profile = this.getChunkRuntimeProfile();
            if (this.cameraMoveSettleTimer !== null) {
                window.clearTimeout(this.cameraMoveSettleTimer);
                this.cameraMoveSettleTimer = null;
            }
            this.isCameraMoving = false;
            this.wasCameraMoving = false;
            // 交互结束时立刻恢复满分辨率，避免静止画面停留在拖动分辨率。
            this.restoreFullRenderQuality();
            this.prefetchPaused = false;
            this.chunkLoadResumeAt = now + Math.max(24, Math.floor(profile.resumeAfterMoveMs * 0.75));
            this.postMoveRecoveryUntil = now + profile.postMoveRecoveryMs;
            this.interactionShadowRestoreAt = now + this.interactionShadowRestoreDelayMs;
            this.movingPeripheralLastRefreshAt = 0;
            this.movingPeripheralCursor = 0;
            
            // 浮动原点 (Floating Origin): 若相机焦点远离(0,0,0)，反向平移世界以消除计算精度抖动
            const dist = this.controls.target.length();
            if (dist > 50000) {
                const shift = this.controls.target.clone();
                this.scene.position.sub(shift);
                this.camera.position.sub(shift);
                this.controls.target.set(0, 0, 0);
                this.camera.updateProjectionMatrix();
                // 灯光跟随平移
                if (this.dirLight) this.dirLight.position.sub(shift);
                if (this.backLight) this.backLight.position.sub(shift);
                
                // 更新世界包围盒记录
                this.precomputedBounds.translate(shift.clone().negate());
                this.sceneBounds.translate(shift.clone().negate());
            }
            
            this.markSceneDirty({ needsCulling: true });
        });

        // 灯光：工业模型浏览以柔和天光、主光和背光为主，避免颜色过曝和阴影过黑。
        this.hemiLight = new THREE.HemisphereLight(0xf8fbff, 0xd9e1e8, this.settings.hemiInt ?? 0.58);
        this.scene.add(this.hemiLight);
        this.ambientLight = new THREE.AmbientLight(0xf7f8fb, this.settings.ambientInt);
        this.scene.add(this.ambientLight);
        this.dirLight = new THREE.DirectionalLight(0xfffcf6, this.settings.dirInt);
        this.dirLight.position.set(120, -90, 180);
        this.scene.add(this.dirLight);
        this.backLight = new THREE.DirectionalLight(0xe7edf5, this.settings.backLightInt ?? 0.62);
        this.backLight.position.set(-90, 60, 85);
        this.scene.add(this.backLight);

        // 选择辅助器
        const box = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
        this.selectionBox = new THREE.Box3Helper(box, new THREE.Color(0xffff00));
        this.selectionBox.visible = false;
        this.helpersGroup.add(this.selectionBox);

        const highlightMat = new THREE.MeshBasicMaterial({
            color: this.settings.highlightColor,
            transparent: false,
            opacity: 1,
            depthTest: false,
            depthWrite: false,
            side: THREE.BackSide
        });
        this.highlightMesh = new THREE.Mesh(new THREE.BufferGeometry(), highlightMat);
        this.highlightMesh.visible = false;
        this.highlightMesh.renderOrder = 999;
        this.helpersGroup.add(this.highlightMesh);

        // 测量辅助器（点）
        const markerGeo = new THREE.BufferGeometry();
        markerGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
        const markerMat = new THREE.PointsMaterial({
            color: 0xff0000,
            size: 8,
            sizeAttenuation: false,
            map: this.dotTexture,
            transparent: true,
            alphaTest: 0.5,
            depthTest: false
        });

        this.tempMarker = new THREE.Points(markerGeo, markerMat);
        this.tempMarker.visible = false;
        this.tempMarker.renderOrder = 1000;
        this.helpersGroup.add(this.tempMarker);

        // 裁剪设置
        this.setupClipping();

        // 射线投射
        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Points.threshold = 10;
        // @ts-ignore
        if (!this.raycaster.params.Line) this.raycaster.params.Line = { threshold: 1 };
        // @ts-ignore
        this.raycaster.params.Line.threshold = 2;

        this.mouse = new THREE.Vector2();

        this.animate = this.animate.bind(this);

        // 调试钩子：仅在 URL 带 ?dshDebug=1 时挂到 window，便于自动化测试断言
        // （分块数、内存分类、拾取、结构树）。生产环境不加全局污染。
        if (typeof window !== "undefined") {
            try {
                const params = new URLSearchParams(window.location.search);
                if (params.has("dshDebug")) {
                    (window as any).__viewer = this;
                }
                if (params.has("coarseLod")) {
                    this.coarseLodEnabled = true;
                }
            } catch {
                // 忽略 URL 解析异常
            }
        }

        this.markSceneDirty();
    }

    /** 按需调度一帧：合并多次调用，在相机静止且无后台任务时不常驻 requestAnimationFrame */
    requestRender() {
        if (this.disposed) return;
        if (this.animateFramePending) return;
        this.animateFramePending = true;
        this.animationFrameId = requestAnimationFrame(this.animate);
    }

    /**
    /**
     * 设置显示样式：
     *  - realistic 真实：着色 + 构件棱边
     *  - shaded    着色：仅着色
     *  - wireframe 线框：仅棱边
     */
    setDisplayMode(mode: DisplayMode) {
        this.displayMode = normalizeDisplayMode(mode);
        // 线框需要“先有棱边再隐藏实体”：边线是逐帧补的，先按着色显示，
        // 等边线生成完再真正切到线框，避免切换瞬间模型大面积消失。
        applyDisplayMode(this.contentGroup, this.displayMode === "wireframe" ? "shaded" : this.displayMode);
        // 真实模式边线适当减弱；线框模式保持清晰。
        this.displayEdges.setBaseOpacity(this.displayMode === "wireframe" ? 0.9 : 0.48);
        // 未加载分块的 ghost 线框：着色模式压淡，避免整个模型看起来像“被拆成骨架”。
        this.ghostMaterial.opacity = this.displayMode === "shaded" ? 0.1 : 0.3;

        if (this.displayMode === "shaded") {
            // 切回着色时释放所有边线（全模型边线可达 1GB+），并恢复常驻分块上限。
            this.cancelEdgeModeTransition();
            this.cancelProgressiveEdgeBuild();
            if (this.displayEdges.getStats().count > 0) this.displayEdges.clear();
            this.displayEdgesBuilt = false;
            if (this.shadedMaxLoadedChunks > 0) this.maxLoadedChunks = this.shadedMaxLoadedChunks;
            this.markSceneDirty({ needsCulling: true });
        } else {
            const isWireframe = this.displayMode === "wireframe";
            // 大模型真实样式只给最近的一小批分块描边：远处棱边本来就看不清，
            // 少做一批能明显缩短样式切换和后续旋转的开销；小模型保持原范围。
            const isLargeModel = this.chunks.length > 400;
            const realisticEdgeLimit = isLargeModel ? 24 : 40;
            // 真实样式：保留全部实体，只给近处分块补边线；
            // 线框样式：实体被隐藏，必须把所有可驻留分块都补上边线。
            this.displayEdges.setByteBudget(isWireframe
                ? this.computeEdgeModeByteBudgetMB()
                : Math.max(96, Math.min(isLargeModel ? 160 : 240, this.computeEdgeModeByteBudgetMB() * 0.4)));

            if (isWireframe) {
                const edgeCap = this.computeEdgeModeChunkCap();
                if (edgeCap < this.maxLoadedChunks) {
                    this.maxLoadedChunks = edgeCap;
                    this.beginEdgeModeTransition(edgeCap);
                } else {
                    this.startProgressiveEdgeBuild();
                }
            } else {
                this.cancelEdgeModeTransition();
                if (this.shadedMaxLoadedChunks > 0) this.maxLoadedChunks = this.shadedMaxLoadedChunks;
                this.startProgressiveEdgeBuild();
                this.markSceneDirty({ needsCulling: true });
            }
        }
        this.requestRender();
    }

    /** 真实/线框模式下，按“几何 + 边线”双份成本估算可常驻分块数 */
    private computeEdgeModeChunkCap() {
        const baseCap = this.shadedMaxLoadedChunks || this.maxLoadedChunks || 256;
        const perfMemory = (performance as any)?.memory;
        const heapLimitMB = perfMemory?.jsHeapSizeLimit
            ? perfMemory.jsHeapSizeLimit / 1048576
            : 4096;
        // 用预算时记录的固定开销，而不是瞬时 usedHeap（切线框时边线正在分配，
        // 用瞬时值会把上限越算越小，最终把模型裁到只剩几十块）。
        const baseUsedMB = Math.max(0, this.lastBaseUsedMB || 650);
        const cacheMB = getChunkReadCacheBytes(this.chunkReadCache) / 1048576;
        const budgetMB = Math.max(384, heapLimitMB * 0.78 - baseUsedMB - Math.min(128, cacheMB));
        // 实测：几何实际 ≈ 估算 × 0.63，边线 ≈ 估算 × 1.0 → 每块总成本 ≈ 估算 × 1.63
        const perChunkMB = Math.max(1.0, this.getAverageChunkFootprintMB() * 1.63);
        // 保护性上限：边线生成本身是同步重活，块数过多会先卡死再 OOM。
        // 大模型线框只保留近处约 200 块细节，其余分块显示框线（后续再做渐进生成）。
        const EDGE_DETAIL_CAP = 200;
        return Math.max(48, Math.min(baseCap, EDGE_DETAIL_CAP, Math.floor(budgetMB / perChunkMB)));
    }

    /** 真实/线框模式可用的边线总字节预算（MB） */
    private computeEdgeModeByteBudgetMB() {
        const perfMemory = (performance as any)?.memory;
        const heapLimitMB = perfMemory?.jsHeapSizeLimit ? perfMemory.jsHeapSizeLimit / 1048576 : 4096;
        const baseUsedMB = Math.max(0, this.lastBaseUsedMB || 650);
        const budgetMB = Math.max(384, heapLimitMB * 0.78 - baseUsedMB);
        return Math.max(128, Math.min(650, budgetMB * 0.45));
    }

    /**
     * 渲染预算：数据全量驻留，但一帧只提交预算内的分块几何，
     * 其余可见分块用合并线框代理表示。避免“充满视图 1.8 亿三角面”拖垮交互。
     */
    private applyRenderBudget(candidates: Array<{ chunk: any; pixel: number; dist: number }>) {
        const proxy = this.renderProxy;
        if (!proxy) return;
        const totalChunks = this.chunks.length;
        const active = this.renderBudgetMode !== "full"
            && this.displayMode !== "wireframe"
            && totalChunks > this.renderBudgetChunkMax;
        if (!active) {
            proxy.clear();
            this.renderBudgetSelected.clear();
            for (const { chunk } of candidates) {
                if (chunk.mesh && !chunk.mesh.visible) chunk.mesh.visible = true;
            }
            return;
        }

        const triOf = (chunk: any) => Number(chunk?.triCount) || 0;
        // 正交相机下 pixel 只反映世界尺寸、不反映距离；若只按 pixel 排序，
        // 会把近处分块换成线框、却在画面上盖住近景。这里统一优先保证近处分块。
        candidates.sort((a, b) => a.dist - b.dist || b.pixel - a.pixel);

        const selected = new Set<any>();
        let triangles = 0;
        // 1) 先保留上次选中的分块（仍可见且未超 1.2 倍预算），减少相机微动时的闪变
        for (const item of candidates) {
            const chunk = item.chunk;
            if (!this.renderBudgetSelected.has(chunk.id)) continue;
            const tri = triOf(chunk);
            if (selected.size < this.renderBudgetChunkMax && triangles + tri <= this.renderBudgetTriangles * 1.2) {
                selected.add(chunk);
                triangles += tri;
            }
        }
        // 2) 再按屏幕尺寸从大到小补满预算
        for (const item of candidates) {
            const chunk = item.chunk;
            if (selected.has(chunk)) continue;
            const tri = triOf(chunk);
            if (selected.size < this.renderBudgetChunkMax && triangles + tri <= this.renderBudgetTriangles) {
                selected.add(chunk);
                triangles += tri;
            }
        }

        const boxes: Array<{ min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }> = [];
        for (const item of candidates) {
            const chunk = item.chunk;
            const show = selected.has(chunk);
            if (chunk.mesh && chunk.mesh.visible !== show) chunk.mesh.visible = show;
            if (!show && chunk.bounds) {
                boxes.push({ min: chunk.bounds.min, max: chunk.bounds.max });
            }
        }
        this.renderBudgetSelected = new Set(Array.from(selected).map((chunk) => chunk.id));
        proxy.update(boxes);
    }

    private getAverageChunkFootprintMB() {
        let sum = 0;
        let count = 0;
        for (const chunk of this.chunks) {
            const value = Number(chunk?.estimatedDecodedMB);
            if (Number.isFinite(value) && value > 0) {
                sum += value;
                count++;
            }
        }
        return count > 0 ? sum / count : 2.0;
    }

    /** 远景粗 LOD 的实例尺寸阈值（米）：只有显式选择“自适应分辨率 LOD”时才启用。
     *  按当前视口“1 像素对应多少世界单位”推导，默认丢弃投影小于约 1.35px 的小构件。 */
    private getCoarseLodMinSize(chunk: any): number {
        if (!this.coarseLodEnabled) return 0;
        const viewHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
        const canvasHeight = this.renderer.domElement.clientHeight || 1;
        const onePixelWorld = Math.abs(viewHeight) / canvasHeight;
        if (!Number.isFinite(onePixelWorld) || onePixelWorld <= 0) return 0;
        return Math.max(0.015, Math.min(0.6, onePixelWorld * 1.35));
    }

    /** 同步卸载最远的分块，直到已加载数不超过 cap（切换显示样式前调用） */
    private trimLoadedChunksForMode(cap: number) {
        if (!Number.isFinite(cap) || cap <= 0) return;
        if (this.chunkLoadedCount <= cap) return;
        const cameraPos = this.camera.position;
        const centerOf = (chunk: any) => {
            if (!chunk.center && chunk.bounds) chunk.center = chunk.bounds.getCenter(new THREE.Vector3());
            return chunk.center || cameraPos;
        };
        const loaded = this.chunks.filter((chunk: any) => chunk?.loaded && chunk?.mesh);
        loaded.sort((a: any, b: any) => centerOf(b).distanceToSquared(cameraPos) - centerOf(a).distanceToSquared(cameraPos));
        for (const chunk of loaded) {
            if (this.chunkLoadedCount <= cap) break;
            this.unloadChunk(chunk);
        }
    }

    private cancelEdgeModeTransition() {
        if (this.edgeTransitionTimer !== null) {
            window.clearTimeout(this.edgeTransitionTimer);
            this.edgeTransitionTimer = null;
        }
    }

    private cancelProgressiveEdgeBuild() {
        this.edgeBuildGeneration++;
        if (this.edgeBuildTimer !== null) {
            window.clearTimeout(this.edgeBuildTimer);
            this.edgeBuildTimer = null;
        }
        this.edgeBuildQueue = [];
    }

    /**
     * 边线全部补完后：
     *  - 线框模式真正隐藏实体面（超大、无法描边的分块保留实体兜底，避免消失）
     *  - 真实模式恢复实体面
     */
    private finalizeDisplayModeAfterEdges() {
        for (const chunk of this.chunks) {
            const mesh = chunk?.mesh as THREE.Mesh | undefined;
            if (!mesh || !mesh.userData?.__edgeSkipped || mesh.userData.keepSolid) continue;
            const material = mesh.material as THREE.Material | THREE.Material[];
            if (Array.isArray(material)) continue;
            if (material && typeof (material as any).clone === "function") {
                const clone = material.clone();
                clone.visible = true;
                mesh.material = clone;
            }
            mesh.userData.keepSolid = true;
        }
        applyDisplayMode(this.contentGroup, this.displayMode);
        this.requestRender();
    }

    /**
     * 逐帧补边线：每帧最多 8ms，避免切换真实/线框时一次性对上百个分块做
     * EdgesGeometry 把主线程卡死（全模型切换曾出现数十秒无响应）。
     */
    private startProgressiveEdgeBuild() {
        this.cancelProgressiveEdgeBuild();
        const generation = this.edgeBuildGeneration;
        if (this.displayMode === "shaded") return;

        this.displayEdges.clear();
        this.displayEdgesBuilt = false;

        const isWireframe = this.displayMode === "wireframe";
        const realisticEdgeLimit = this.chunks.length > 400 ? 24 : 40;
        let loaded = this.chunks.filter((chunk: any) => chunk?.loaded && chunk?.mesh);
        if (!isWireframe) {
            // 真实样式：只给屏幕占比最大的近处分块补边线，远处保持纯着色。
            loaded = loaded
                .filter((chunk: any) => Number(chunk?._lastPixelSize) > 8)
                .sort((a: any, b: any) => Number(b._lastPixelSize) - Number(a._lastPixelSize))
                .slice(0, realisticEdgeLimit);
        }
        // 排序后 reverse，配合 pop() 从“最值得”的分块开始。
        this.edgeBuildQueue = loaded.map((chunk: any) => chunk.mesh as THREE.Object3D).reverse();

        const step = () => {
            this.edgeBuildTimer = null;
            if (generation !== this.edgeBuildGeneration || this.disposed || this.displayMode === "shaded") return;
            // 分块加载仍在进行时先让路，避免边线生成和 worker 解码抢主线程造成卡顿。
            if (this.processingChunks.size > 2) {
                this.edgeBuildTimer = window.setTimeout(step, 200);
                return;
            }
            const deadline = performance.now() + 8;
            while (this.edgeBuildQueue.length > 0 && performance.now() < deadline) {
                const object = this.edgeBuildQueue.pop();
                if (!object || !object.parent) continue;
                this.displayEdges.buildFor(object, true);
            }
            if (this.edgeBuildQueue.length > 0) {
                this.edgeBuildTimer = window.setTimeout(step, 16);
            } else {
                this.displayEdgesBuilt = true;
                this.displayEdges.setVisible(true);
                this.finalizeDisplayModeAfterEdges();
                this.requestRender();
            }
        };
        this.edgeBuildTimer = window.setTimeout(step, 16);
    }

    /**
     * 切到真实/线框：分帧把常驻块数降到 targetCap，再统一生成边线。
     * 一次性卸载几百块会产生 >1GB 瞬时垃圾，GC 跟不上就会把堆冲到 4.5GB+；
     * 每帧只卸 48 块，给 GC 留出回收窗口。
     */
    private beginEdgeModeTransition(targetCap: number) {
        this.cancelEdgeModeTransition();
        const started = performance.now();
        const step = () => {
            this.edgeTransitionTimer = null;
            if (this.disposed || this.displayMode === "shaded") return;

            const loaded = this.chunkLoadedCount;
            if (loaded > targetCap + 8) {
                this.maxLoadedChunks = Math.max(targetCap, loaded - 48);
                this.markSceneDirty({ needsCulling: true });
                this.checkCullingAndLoad();
                if (performance.now() - started < 20000) {
                    this.edgeTransitionTimer = window.setTimeout(step, 160);
                    return;
                }
                // 兜底：超时后同步一次卸干净
                this.maxLoadedChunks = targetCap;
                this.trimLoadedChunksForMode(targetCap);
            }

            this.maxLoadedChunks = targetCap;
            this.startProgressiveEdgeBuild();
            this.requestRender();
        };
        this.edgeTransitionTimer = window.setTimeout(step, 200);
    }

    getDisplayMode(): DisplayMode {
        return this.displayMode;
    }

    /** 显示样式棱边生成器 */
    private displayEdges = new DisplayEdgeBuilder();
    private displayEdgesBuilt = false;

    /** 内容变化后需要重建棱边 */
    invalidateDisplayModeCache() {
        this.displayEdges.clear();
        this.displayEdgesBuilt = false;
    }

    /** 内容新增后为新增部分生成棱边（真实/线框模式） */
    private buildDisplayEdgesFor(object: THREE.Object3D) {
        if (this.displayMode === "shaded") return;
        if (this.edgeBuildTimer !== null) {
            this.edgeBuildQueue.push(object);
            return;
        }
        this.displayEdges.buildFor(object, true);
        this.displayEdgesBuilt = true;
        this.displayEdges.setVisible(true);
    }

    private renderFrame() {
        this.renderer.render(this.scene, this.camera);
    }

    private markSceneDirty(options: {
        needsRender?: boolean;
        needsBoundsUpdate?: boolean;
        needsCulling?: boolean;
        invalidateInteractables?: boolean;
    } = {}) {
        const {
            needsRender = true,
            needsBoundsUpdate = false,
            needsCulling = false,
            invalidateInteractables = false
        } = options;

        if (invalidateInteractables) {
            this.interactableListValid = false;
        }
        if (needsBoundsUpdate) {
            this._needsBoundsUpdate = true;
        }
        if (needsCulling) {
            this.cullingDirty = true;
        }
        if (needsRender) {
            this.requestRender();
        }
    }

    invalidateRender(options: {
        needsRender?: boolean;
        needsBoundsUpdate?: boolean;
        needsCulling?: boolean;
        invalidateInteractables?: boolean;
    } = {}) {
        this.markSceneDirty(options);
    }

    updateSettings(newSettings: Partial<SceneSettings>) {
        const previousAdaptiveQuality = this.settings.adaptiveQuality;
        const previousMaxPixelRatio = this.settings.maxPixelRatio;
        const previousMinPixelRatio = this.settings.minPixelRatio;
        const previousPerformanceMode = this.settings.performanceMode;
        const highlightColorChanged = newSettings.highlightColor !== undefined
            && newSettings.highlightColor !== this.settings.highlightColor;
        this.settings = { ...this.settings, ...newSettings };
        this.applyHighlightSettings();

        // 自适应画质开关/像素比范围变化要立即生效：
        // 之前只改了 settings，像素比要等下一次相机运动或 resize 才更新，
        // 表现为“关闭自适应画质没有效果”。
        const qualityChanged = (newSettings.adaptiveQuality !== undefined && newSettings.adaptiveQuality !== previousAdaptiveQuality)
            || (newSettings.maxPixelRatio !== undefined && newSettings.maxPixelRatio !== previousMaxPixelRatio)
            || (newSettings.minPixelRatio !== undefined && newSettings.minPixelRatio !== previousMinPixelRatio);
        if (qualityChanged) {
            const desiredRatio = this.settings.adaptiveQuality
                ? this.computeDesiredPixelRatio()
                : Math.min(window.devicePixelRatio || 1, this.settings.maxPixelRatio ?? 2);
            if (this.applyPixelRatio(desiredRatio)) {
                const rect = this.canvas.getBoundingClientRect();
                this.applyCanvasSize(Math.max(1, rect.width), Math.max(1, rect.height));
            }
            this.markSceneDirty();
        }

        // 渲染预算/几何策略已收敛：默认全量几何，这里不再提供运行时切换。

        // 性能策略切换立即生效（之前被 performancePreset 覆盖，永久无效）
        if (newSettings.performanceMode !== undefined && newSettings.performanceMode !== previousPerformanceMode) {
            this.applyPerformanceMode(newSettings.performanceMode);
        }

        // 高亮颜色变化后立即重绘当前高亮的实例，否则要重新点选才生效。
        if (highlightColorChanged && this.highlightedUuids.size > 0) {
            const context = this.getHighlightContext();
            const result = applyRefreshHighlightColors(context);
            this.syncHighlightState(context.state);
            if (result.needsRender) this.markSceneDirty();
        }
        if (newSettings.clip) {
            this.setClipHelperOptions({
                visible: newSettings.clip.helperVisible,
                opacity: newSettings.clip.helperOpacity
            });
        }

        // 应用光照
        this.ambientLight.intensity = this.settings.ambientInt;
        if (this.hemiLight) this.hemiLight.intensity = this.settings.hemiInt ?? 0.58;
        this.dirLight.intensity = this.settings.dirInt;
        this.backLight.intensity = this.settings.backLightInt ?? 0.62;

        // 应用渲染色彩链路
        this.renderer.outputColorSpace = this.settings.colorSpace === 'linear'
            ? THREE.LinearSRGBColorSpace
            : THREE.SRGBColorSpace;
        this.renderer.toneMapping = this.settings.toneMapping === 'none'
            ? THREE.NoToneMapping
            : this.settings.toneMapping === 'neutral'
                ? THREE.NeutralToneMapping
                : THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = this.settings.exposure ?? 0.92;

        // 应用背景
        this.renderer.setClearColor(this.settings.bgColor, 1);
        this.scene.background = new THREE.Color(this.settings.bgColor);
        // 边线颜色跟随底色，避免深色视口下棱边看不清
        this.displayEdges.setBackground(this.settings.bgColor);

        // 应用视锥体剔除
        if (newSettings.frustumCulling !== undefined) {
            this.contentGroup.traverse(obj => {
                if ((obj as THREE.Mesh).isMesh) {
                    obj.frustumCulled = newSettings.frustumCulling!;
                } else if ((obj as any).isBatchedMesh) {
                    // 分块自身有正确的包围球，交给渲染器做原生视锥剔除；
                    // 手动可见性只负责加载/ghost 逻辑。
                    obj.frustumCulled = newSettings.frustumCulling !== false;
                }
            });
        }

        // 应用最大渲染距离
        if (newSettings.maxRenderDistance !== undefined) {
            this.maxRenderDistance = newSettings.maxRenderDistance;
            // 立即触发一次剔除检查
            this.checkCullingAndLoad();
        }

        this.markSceneDirty({
            needsCulling: newSettings.maxRenderDistance !== undefined,
            invalidateInteractables: newSettings.frustumCulling !== undefined
        });
    }

    createCircleTexture() {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        if (context) {
            context.beginPath();
            context.arc(size / 2, size / 2, size / 2 - 2, 0, 2 * Math.PI);
            context.fillStyle = '#ffffff';
            context.fill();
        }
        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    animate = () => {
        if (this.disposed) return;
        this.animateFramePending = false;
        this.animationFrameId = null;

        const frameNow = performance.now();
        if (this.controls) {
            this.controls.update();
        }

        this.updateInteractionPerformance(frameNow);
        this.updateAdaptiveQuality();
        this.updateDisplayEdgeAppearance(frameNow);

        // 如果需要更新边界 (例如分块加载/卸载后)
        if (this._needsBoundsUpdate) {
            this.updateSceneBounds();
            this._needsBoundsUpdate = false;
        }

        // 先更新相机裁剪面，确保后续的视锥剔除和渲染使用正确的参数
        this.updateCameraClipping();

        // 优先在相机变化或加载状态变化后做一次剔除，平时退回到更稀疏的兜底检查
        const now = performance.now();
        const profile = this.getChunkRuntimeProfile();
        const phase = this.getChunkRenderPhase(now);
        const cullingInterval = this.cullingDirty
            ? (phase === 'moving'
                ? profile.movingCullingIntervalMs
                : phase === 'recovery'
                    ? profile.recoveryCullingIntervalMs
                    : Math.min(profile.recoveryCullingIntervalMs, 70))
            : profile.idleCullingIntervalMs;
        if (!this._lastCullingTime || now - this._lastCullingTime > cullingInterval) {
            this.checkCullingAndLoad(now);
            this._lastCullingTime = now;
            this.cullingDirty = false;
        }

        this.updateHighlightGlow(now);

        const highlightMaterial = this.highlightMesh.material as THREE.MeshBasicMaterial;
        if (highlightMaterial) {
            if (this.locateFocusUuid && this.highlightMesh.visible) {
                const focusColor = new THREE.Color(this.settings.highlightColor || "#ff9f1c");
                const pulseMix = 0.22 + ((Math.sin(frameNow / 125) + 1) * 0.3);
                highlightMaterial.color.copy(focusColor).lerp(this.highlightPulseColor, pulseMix);
                highlightMaterial.opacity = 1;
            } else {
                highlightMaterial.color.set(this.settings.highlightColor || "#ff9f1c");
                highlightMaterial.opacity = 1;
            }
        }

        const selectionLineMat = this.selectionBox.material as THREE.LineBasicMaterial | THREE.LineBasicMaterial[] | undefined;
        if (this.locateFocusUuid && this.selectionBox.visible && selectionLineMat && !Array.isArray(selectionLineMat)) {
            const baseSel = new THREE.Color(this.settings.highlightColor || "#ff9f1c");
            const pulseSel = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(frameNow / 125));
            selectionLineMat.color.copy(baseSel).lerp(this.highlightPulseColor, 0.34 * pulseSel);
        } else if (selectionLineMat && !Array.isArray(selectionLineMat)) {
            selectionLineMat.color.set(this.settings.highlightColor || "#ff9f1c");
        }

        this.renderFrame();

        const chunkWorkActive = this.chunkLoadingEnabled
            && (this.processingChunks.size > 0 || this.chunkWarmupActive || this.chunkLoadPlanPending);
        const locatingPulse = !!(this.locateFocusUuid && (this.highlightMesh.visible || this.selectionBox.visible));
        const highlightGlowing = !!this.highlightedInstance && now < this.highlightGlowUntil;
        const keepLoop =
            this.isCameraMoving ||
            this.isInPostMoveRecovery(now) ||
            chunkWorkActive ||
            highlightGlowing ||
            locatingPulse;

        if (keepLoop) {
            this.requestRender();
        }
    }

    /**
     * 交互结束/静止时强制回到满分辨率。
     * 渲染是按需循环的，若只在 animate 里恢复，鼠标松开后可能不再调度帧，
     * 画面会一直停留在拖动时的 0.8 像素比上（表现为“越转越糊”）。
     */
    private restoreFullRenderQuality() {
        if (!this.settings.adaptiveQuality) return;
        const deviceRatio = window.devicePixelRatio || 1;
        const maxRatio = Math.min(deviceRatio, this.settings.maxPixelRatio ?? 2);
        if (this.applyPixelRatio(maxRatio)) {
            const rect = this.canvas.getBoundingClientRect();
            this.applyCanvasSize(Math.max(1, rect.width), Math.max(1, rect.height));
        }
        this.requestRender();
    }

    /**
     * 相机离模型越远，边线越淡：避免大模型缩小看全局时大量棱边重叠成一团，显得“粗/黑”。
     */
    private updateDisplayEdgeAppearance(now: number) {
        if (this.displayMode === "shaded" || !this.displayEdgesBuilt) return;
        if (now - this.lastDisplayEdgeOpacityAt < 250) return;
        this.lastDisplayEdgeOpacityAt = now;
        if (this.sceneBounds.isEmpty()) return;

        const sphere = new THREE.Sphere();
        this.sceneBounds.getBoundingSphere(sphere);
        if (!(sphere.radius > 0)) return;

        const distance = this.camera.position.distanceTo(sphere.center);
        const ratio = distance / sphere.radius;
        // 相机离模型越远，边线越淡：全局视角下大量棱边重叠会糊成一团“粗黑线”。
        // ratio≈1.6 开始衰减，ratio≥4 时降到 0.18，近看仍保持清晰轮廓。
        const far = THREE.MathUtils.clamp((ratio - 1.6) / 2.4, 0, 1);
        this.displayEdges.setOpacityFactor(1 - 0.82 * far);
    }

    private applyPerformanceMode(mode: "balanced" | "smooth" | "quality") {
        this.settings.performanceMode = mode;
        this.cullingTimeBudgetMovingMs = mode === "smooth" ? 6 : mode === "quality" ? 9 : 7.5;
        this.cullingTimeBudgetRecoveryMs = mode === "smooth" ? 8 : mode === "quality" ? 12 : 10.5;
        this.cullingTimeBudgetIdleMs = mode === "smooth" ? 10 : mode === "quality" ? 16 : 14;
        const desired = this.computeDesiredPixelRatio();
        if (this.applyPixelRatio(desired)) {
            const rect = this.canvas.getBoundingClientRect();
            this.applyCanvasSize(Math.max(1, rect.width), Math.max(1, rect.height));
        }
        this.markSceneDirty();
    }

    setPerformancePreset(mode: "balanced" | "smooth" | "quality") {
        this.options.performancePreset = mode;
        this.applyPerformanceMode(mode);
    }

    /** 设置面板用的只读运行信息（驻留/预算/策略） */
    getRenderStrategyInfo() {
        return {
            loaded: this.chunkLoadedCount,
            total: this.chunks.length,
            estimatedResidentMB: Number(this.getResidentChunkMB().toFixed(1)),
            residentBudgetMB: Number(this.chunkResidentBudgetMB.toFixed(1)),
            fitsAll: this.fitsAllChunks,
            memoryPressure: this.memoryPressureScore >= 2
        };
    }

    /** 连续两次采样到堆超过 82% 才视为内存压力，低于 68% 自动解除。 */
    private isMemoryPressureHigh(): boolean {
        const memory = (performance as any)?.memory;
        if (!memory?.jsHeapSizeLimit) return false;
        const usedMB = memory.usedJSHeapSize / 1048576;
        const limitMB = memory.jsHeapSizeLimit / 1048576;
        if (usedMB >= limitMB * 0.82) this.memoryPressureScore = Math.min(3, this.memoryPressureScore + 1);
        else if (usedMB <= limitMB * 0.68) this.memoryPressureScore = 0;
        return this.memoryPressureScore >= 2;
    }

    private updateAdaptiveQuality() {
        if (!this.settings.adaptiveQuality) {
            this.wasCameraMoving = this.isCameraMoving;
            // 兜底：关闭自适应画质后必须始终满分辨率。
            // 否则历史遗留的低 DPR 会在缩放/拖动时一直保留，表现为“越缩放越糊”。
            const maxRatio = Math.min(window.devicePixelRatio || 1, this.settings.maxPixelRatio ?? 2);
            if (Math.abs(maxRatio - this.appliedPixelRatio) >= 0.001) {
                this.applyPixelRatio(maxRatio);
                const rect = this.canvas.getBoundingClientRect();
                this.applyCanvasSize(Math.max(1, rect.width), Math.max(1, rect.height));
                this.markSceneDirty();
            }
            return;
        }

        // 相机由运动转为静止：立即恢复满分辨率，确保静止画面/截图/测量都是全清晰度。
        if (this.wasCameraMoving && !this.isCameraMoving) {
            this.restoreFullRenderQuality();
        }
        this.wasCameraMoving = this.isCameraMoving;

        const desiredRatio = this.computeDesiredPixelRatio();
        if (Math.abs(desiredRatio - this.activePixelRatio) < 0.05) return;

        this.applyPixelRatio(desiredRatio);
        const rect = this.canvas.getBoundingClientRect();
        this.applyCanvasSize(Math.max(1, rect.width), Math.max(1, rect.height));
    }

    /**
     * 统一的像素比决策：自适应质量开启时按场景规模与相机移动状态降采样。
     * resize() 与 updateAdaptiveQuality() 共用本方法，避免两者互相覆盖像素比
     * 造成缓冲区反复重建（拖拽面板时的闪烁来源之一）。
     */
    private computeDesiredPixelRatio(): number {
        const deviceRatio = window.devicePixelRatio || 1;
        if (!this.settings.adaptiveQuality) {
            return Math.min(deviceRatio, 2);
        }

        const minRatio = Math.min(deviceRatio, this.settings.minPixelRatio ?? 0.8);
        const maxRatio = Math.min(deviceRatio, this.settings.maxPixelRatio ?? 2);
        const mode = this.settings.performanceMode ?? 'balanced';

        let desiredRatio = maxRatio;
        if (this.isCameraMoving) {
            // A 档：交互过程中只做温和降采样（相对原生分辨率 0.75~0.85），
            // 静止后由 restoreFullRenderQuality() 立即恢复满分辨率。
            const movingScale = mode === 'quality'
                ? 0.85
                : mode === 'smooth'
                    ? 0.6
                    : 0.72;
            desiredRatio = Math.max(minRatio, maxRatio * movingScale);
        }

        return Math.max(minRatio, Math.min(maxRatio, desiredRatio));
    }

    /** 仅在像素比真正变化时调用 setPixelRatio（它会重建绘图缓冲并清空画布） */
    private applyPixelRatio(ratio: number): boolean {
        if (Math.abs(ratio - this.appliedPixelRatio) < 0.001) return false;
        this.appliedPixelRatio = ratio;
        this.activePixelRatio = ratio;
        // setPixelRatio 内部会用旧的 CSS 尺寸重建一次缓冲，这里作废缓存，
        // 保证随后的 applyCanvasSize 一定会按新尺寸重新设置。
        this.appliedBufferWidth = -1;
        this.appliedBufferHeight = -1;
        this.renderer.setPixelRatio(ratio);
        return true;
    }

    /** 仅在绘图缓冲尺寸真正变化时调用 setSize（它会清空画布） */
    private applyCanvasSize(w: number, h: number): boolean {
        const bufferWidth = Math.floor(w * this.appliedPixelRatio);
        const bufferHeight = Math.floor(h * this.appliedPixelRatio);
        if (bufferWidth === this.appliedBufferWidth && bufferHeight === this.appliedBufferHeight) {
            return false;
        }
        this.appliedBufferWidth = bufferWidth;
        this.appliedBufferHeight = bufferHeight;
        this.renderer.setSize(w, h, false);
        return true;
    }

    private updateInteractionPerformance(now: number) {
        if (this.interactionShadowDowngraded && now >= this.interactionShadowRestoreAt) {
            this.interactionShadowDowngraded = false;
        }
    }

    private initHardwareProfile() {
        const nav = navigator as Navigator & { deviceMemory?: number };
        const cpuCount = Math.max(2, nav.hardwareConcurrency || 4);
        const memoryGb = nav.deviceMemory || 8;
        const preset = (this.options.performancePreset ?? this.settings.performanceMode ?? "balanced") as PerformancePreset;
        const runtime = deriveInitialRuntimeFromHardware(cpuCount, preset);

        if (this.forceMaxChunkLoadSpeed) {
            // 极速模式：按硬件提高并行度，优先可见分片尽快解码与上屏。
            // 低内存设备降档：并发解码的瞬时内存峰值与 worker 数成正比，
            // 4GB 设备全开 11-12 workers 会在大模型加载中途 OOM。
            const lowMemory = memoryGb <= 4;
            const workerCap = lowMemory ? 4 : 12;
            this.maxWorkers = Math.max(3, Math.min(workerCap, cpuCount - 1));
            this.maxConcurrentChunkLoads = lowMemory
                ? Math.min(64, this.maxWorkers * 12)
                : Math.max(128, Math.min(192, this.maxWorkers * 24));
            this.maxChunkLoadsPerFrame = lowMemory
                ? Math.min(24, this.maxWorkers * 6)
                : Math.max(64, Math.min(128, this.maxWorkers * 14));
            this.cullingTimeBudgetMovingMs = 7.5;
            this.cullingTimeBudgetRecoveryMs = 10.5;
            this.cullingTimeBudgetIdleMs = 14.0;
            this.chunkRegistrationBatchSize = 28;
            this.chunkGhostBatchSize = 40;
        } else {
            // 按 CPU 核数适度提高并行度，加载更快；上限 8，避免抢主线程与内存峰值
            this.maxWorkers = Math.max(4, Math.min(8, cpuCount - 1));
            this.maxConcurrentChunkLoads = Math.max(runtime.maxConcurrentChunkLoads, Math.min(128, this.maxWorkers * 20));
            this.maxChunkLoadsPerFrame = Math.max(runtime.maxChunkLoadsPerFrame, Math.min(96, this.maxWorkers * 10));
        }
        this.maxLoadedChunks = memoryGb <= 4 ? 160 : memoryGb <= 8 ? 320 : 640;
        this.shadedMaxLoadedChunks = this.maxLoadedChunks;
        this.maxCachedChunks = memoryGb <= 4 ? 24 : memoryGb <= 8 ? 48 : 96;
        this.settings.targetFps = this.resolvedChunkOptions.targetMinFps;
    }

    private collectObjectOverview(object: THREE.Object3D) {
        let meshes = 0;
        let faces = 0;
        let memory = 0;

        object.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (!mesh.isMesh || !mesh.geometry) return;

            meshes++;
            if (mesh.geometry.index) {
                faces += mesh.geometry.index.count / 3;
            } else if (mesh.geometry.attributes.position) {
                faces += mesh.geometry.attributes.position.count / 3;
            }
            memory += calculateGeometryMemory(mesh.geometry);
        });

        return {
            meshes,
            faces: Math.floor(faces),
            memory: parseFloat(memory.toFixed(2))
        };
    }

    private async estimateNbimStats(file: File, chunks: any[], version: number) {
        let meshes = 0;
        let faces = 0;
        let memory = 0;

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const chunk = chunks[chunkIndex];
            const buffer = await file.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength).arrayBuffer();
            const dv = new DataView(buffer);
            let offset = 0;
            const geoCount = dv.getUint32(offset, true); offset += 4;
            const geometryFaces: number[] = [];

            for (let i = 0; i < geoCount; i++) {
                const vertCount = dv.getUint32(offset, true); offset += 4;
                const indexCount = dv.getUint32(offset, true); offset += 4;
                offset += vertCount * 12;
                offset += vertCount * 12;
                if (indexCount > 0) offset += indexCount * 4;
                geometryFaces.push(indexCount > 0 ? indexCount / 3 : vertCount / 3);
            }

            const instanceCount = dv.getUint32(offset, true); offset += 4;
            meshes += instanceCount;
            memory += chunk.byteLength / (1024 * 1024);

            for (let i = 0; i < instanceCount; i++) {
                offset += 4; // bimId / bimIdIndex
                offset += 4; // typeIndex
                offset += 4; // color
                offset += 64; // matrix
                const geoIdx = dv.getUint32(offset, true); offset += 4;
                faces += geometryFaces[geoIdx] || 0;
            }

            if (chunkIndex > 0 && chunkIndex % 8 === 0) {
                await this.yieldToMainThread();
            }
        }

        return {
            meshes,
            faces: Math.floor(faces),
            memory: parseFloat(memory.toFixed(2))
        };
    }

    private registerOriginalStats(originalUuid: string, stats: { meshes: number; faces: number; memory: number }) {
        this.originalStatsByModel.set(originalUuid, stats);
        this.originalStats.meshes += stats.meshes;
        this.originalStats.faces += stats.faces;
        this.originalStats.memory = parseFloat((this.originalStats.memory + stats.memory).toFixed(2));
    }

    private unregisterOriginalStats(originalUuid: string) {
        const stats = this.originalStatsByModel.get(originalUuid);
        if (!stats) return;
        this.originalStats.meshes = Math.max(0, this.originalStats.meshes - stats.meshes);
        this.originalStats.faces = Math.max(0, this.originalStats.faces - stats.faces);
        this.originalStats.memory = parseFloat(Math.max(0, this.originalStats.memory - stats.memory).toFixed(2));
        this.originalStatsByModel.delete(originalUuid);
    }

    private disposeChunkMesh(mesh: THREE.BatchedMesh) {
        // 边线是批量网格的子节点，回收前先移除，避免残留与重复
        this.displayEdges.releaseFor(mesh);
        disposeChunkMeshResource({
            mesh,
            sharedMaterial: this.sharedMaterial
        });
    }

    private touchChunkCache(chunkId: string) {
        this.chunkCacheOrder = touchChunkMeshCacheOrder(this.chunkCacheOrder, chunkId);
    }

    private cacheChunkMesh(chunk: any, mesh: THREE.BatchedMesh) {
        const result = cacheChunkMeshEntry({
            chunk,
            mesh,
            chunkMeshCache: this.chunkMeshCache,
            chunkCacheOrder: this.chunkCacheOrder,
            maxCachedChunks: this.maxCachedChunks,
            disposeChunkMesh: (nextMesh) => this.disposeChunkMesh(nextMesh)
        });
        this.chunkCacheOrder = result.chunkCacheOrder;
    }

    private takeCachedChunkMesh(chunkId: string) {
        const result = takeCachedChunkMeshEntry({
            chunkId,
            chunkMeshCache: this.chunkMeshCache,
            chunkCacheOrder: this.chunkCacheOrder
        });
        this.chunkCacheOrder = result.chunkCacheOrder;
        return result.mesh;
    }

    private clearChunkCache(filter?: (chunkId: string, mesh: THREE.BatchedMesh) => boolean) {
        this.chunkCacheOrder = clearChunkMeshCacheEntries({
            chunkMeshCache: this.chunkMeshCache,
            chunkCacheOrder: this.chunkCacheOrder,
            disposeChunkMesh: (mesh) => this.disposeChunkMesh(mesh),
            filter
        });
    }

    private hasValidChunkBinaryRange(chunk: any) {
        return hasValidChunkBinaryRangeValue(chunk);
    }

    private async readChunkBuffer(chunk: any) {
        const result = await readChunkBufferValue({
            chunk,
            nbimFiles: this.nbimFiles,
            chunkReadCache: this.chunkReadCache,
            chunkReadCacheSize: this.resolvedChunkOptions.chunkReadCacheSize,
            chunkReadCacheMB: this.resolvedChunkOptions.chunkReadCacheMB
        });
        this.chunkReadCacheOrder = result.chunkReadCacheOrder;
        return result.buffer;
    }

    private enqueueChunkPrefetch(chunkIds: string[]) {
        this.prefetchQueue = enqueueChunkPrefetchItems({
            chunkIds,
            chunkPrefetchWindow: this.resolvedChunkOptions.chunkPrefetchWindow,
            prefetchQueue: this.prefetchQueue,
            prefetchQueueSet: this.prefetchQueueSet,
            prefetchInFlight: this.prefetchInFlight
        });
    }

    private schedulePrefetchFromVisibleChunks(visibleChunks: any[]) {
        const result = collectPrefetchCandidates({
            visibleChunks,
            chunkPrefetchWindow: this.resolvedChunkOptions.chunkPrefetchWindow,
            prefetchPaused: this.prefetchPaused,
            isCameraMoving: this.isCameraMoving,
            prefetchRoundRobinCursor: this.prefetchRoundRobinCursor,
            chunks: this.chunks,
            processingChunks: this.processingChunks,
            chunkReadCache: this.chunkReadCache,
            getChunkIndex: (chunkId) => this.getChunkIndex(chunkId)
        });
        this.prefetchRoundRobinCursor = result.prefetchRoundRobinCursor;
        this.enqueueChunkPrefetch(result.chunkIds);
        void this.processPrefetchQueue();
    }

    private async processPrefetchQueue() {
        await processChunkPrefetchQueue({
            prefetchPaused: this.prefetchPaused,
            isCameraMoving: this.isCameraMoving,
            prefetchQueue: this.prefetchQueue,
            prefetchQueueSet: this.prefetchQueueSet,
            prefetchInFlight: this.prefetchInFlight,
            maxWorkers: this.maxWorkers,
            getChunkById: (chunkId) => this.getChunkById(chunkId),
            chunkReadCache: this.chunkReadCache,
            readChunkBuffer: (chunk) => this.readChunkBuffer(chunk),
            processQueue: () => this.processPrefetchQueue()
        });
    }

    private unregisterOptimizedMeshMapping(bm: THREE.BatchedMesh) {
        unregisterOptimizedMeshResourceMapping({
            mesh: bm,
            optimizedMapping: this.optimizedMapping
        });
    }

    private registerOptimizedMeshMapping(bm: THREE.BatchedMesh) {
        registerOptimizedMeshResourceMapping({
            mesh: bm,
            optimizedMapping: this.optimizedMapping
        });

        // 如果当前处于定位隔离或用户隐藏状态，新加载的 NBIM 分块也必须继承结构树可见性。
        // 否则只会隐藏当前已加载分块，后续加载/预取的分块仍然显示，表现为“隔离不彻底”。
        const batchIdToUuid = bm.userData.batchIdToUuid as Map<number, string> | undefined;
        if (!batchIdToUuid) return;

        let changed = false;
        batchIdToUuid.forEach((uuid, batchId) => {
            const nodes = this.nodeMap.get(uuid);
            if (!nodes || nodes.length === 0) return;
            const visible = nodes.some((node) => node.visible !== false);
            bm.setVisibleAt(batchId, visible);
            changed = true;
        });

        if (changed) {
            bm.computeBoundingSphere?.();
        }
    }

    private acquireGhostLine() {
        return acquireGhostLineResource({
            ghostMeshPool: this.ghostMeshPool,
            ghostEdgesGeometry: this.ghostEdgesGeometry,
            ghostMaterial: this.ghostMaterial
        });
    }

    private releaseGhostLine(line: THREE.LineSegments) {
        releaseGhostLineResource({
            line,
            ghostMeshPool: this.ghostMeshPool
        });
    }

    private createGhostLine(name: string, bounds: THREE.Box3) {
        return createGhostLineResource({
            name,
            bounds,
            acquireGhostLine: () => this.acquireGhostLine()
        });
    }

    private ensureChunkGhost(chunk: any) {
        ensureChunkGhostResource({
            chunk,
            ghostGroup: this.ghostGroup,
            createGhostLine: (name, bounds) => this.createGhostLine(name, bounds)
        });
    }

    private attachStructureRoot(modelRoot: StructureTreeNode) {
        if (modelRoot.name === 'Root' && modelRoot.children && modelRoot.children.length > 0) {
            if (!this.structureRoot.children) this.structureRoot.children = [];
            this.structureRoot.children.push(...modelRoot.children);
        } else {
            if (!this.structureRoot.children) this.structureRoot.children = [];
            this.structureRoot.children.push(modelRoot);
        }
    }

    private replaceStructureNode(targetId: string, replacement: StructureTreeNode) {
        const replaceInNodes = (nodes: StructureTreeNode[]) => {
            for (let i = 0; i < nodes.length; i++) {
                if (nodes[i].id === targetId) {
                    nodes[i] = replacement;
                    return true;
                }
                if (nodes[i].children && replaceInNodes(nodes[i].children!)) return true;
            }
            return false;
        };

        if (this.structureRoot.children) {
            replaceInNodes(this.structureRoot.children);
        }
    }

    private buildAndRegisterModelStructure(object: THREE.Object3D) {
        let modelRoot: StructureTreeNode;
        if (object.userData.isIFC) {
            modelRoot = this.buildIFCStructure(object);
        } else {
            modelRoot = this.buildSceneGraph(object);
        }

        const markOriginalUuid = (node: StructureTreeNode) => {
            if (!node.userData) node.userData = {};
            node.userData.originalUuid = object.uuid;
            if (node.children) node.children.forEach(markOriginalUuid);
        };
        markOriginalUuid(modelRoot);

        const indexBimIds = (node: StructureTreeNode) => {
            if (node.bimId) {
                const key = `${object.uuid}::${node.bimId}`;
                if (!this.bimIdToNodeIds.has(key)) this.bimIdToNodeIds.set(key, []);
                this.bimIdToNodeIds.get(key)!.push(node.id);
            }
            if (node.children) node.children.forEach(indexBimIds);
        };
        indexBimIds(modelRoot);

        return modelRoot;
    }

    private async yieldToMainThread() {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }

    private createPreviewGhost(bounds: THREE.Box3, name: string) {
        const edges = this.createGhostLine(name, bounds);
        if (edges.material instanceof THREE.LineBasicMaterial) {
            edges.material.opacity = 0.45;
        }
        this.ghostGroup.add(edges);
        return edges;
    }

    private async computeItemBoundsProgressively(
        items: any[],
        onProgress?: (p: number, msg: string) => void
    ) {
        const bounds = new THREE.Box3();
        const tmpMin = new THREE.Vector3();
        const tmpMax = new THREE.Vector3();
        const tmpScale = new THREE.Vector3();

        for (let start = 0; start < items.length; start += this.boundsScanBatchSize) {
            const end = Math.min(items.length, start + this.boundsScanBatchSize);
            for (let itemIndex = start; itemIndex < end; itemIndex++) {
                const item = items[itemIndex];
                const center = item.center;
                let r = 0;
                const geo = item.geometry;
                if (!geo.boundingSphere) geo.computeBoundingSphere();
                if (geo.boundingSphere) {
                    tmpScale.setFromMatrixScale(item.matrix);
                    const maxScale = Math.max(tmpScale.x, tmpScale.y, tmpScale.z);
                    r = geo.boundingSphere.radius * maxScale;
                }
                tmpMin.set(center.x - r, center.y - r, center.z - r);
                tmpMax.set(center.x + r, center.y + r, center.z + r);
                bounds.expandByPoint(tmpMin);
                bounds.expandByPoint(tmpMax);
            }

            if (onProgress && items.length > 0) {
                onProgress(20 + Math.min(12, Math.floor((end / items.length) * 12)), "正在统计大模型范围...");
            }
            if (end < items.length) {
                await this.yieldToMainThread();
            }
        }

        bounds.min.subScalar(0.1);
        bounds.max.addScalar(0.1);
        return bounds;
    }

    private async createChunkGhostsProgressively(
        ghostSpecs: Array<{ chunkId: string; bounds: THREE.Box3 }>
    ) {
        if (ghostSpecs.length === 0) return;

        for (let start = 0; start < ghostSpecs.length; start += this.chunkGhostBatchSize) {
            const end = Math.min(ghostSpecs.length, start + this.chunkGhostBatchSize);
            let addedAnyGhost = false;
            for (let index = start; index < end; index++) {
                const spec = ghostSpecs[index];
                const chunk = this.getChunkById(spec.chunkId);
                if (!chunk || chunk.loaded || this.cancelledChunkIds.has(spec.chunkId)) continue;
                if (this.ghostGroup.getObjectByName(`ghost_${spec.chunkId}`)) continue;
                const edges = this.createGhostLine(`ghost_${spec.chunkId}`, spec.bounds);
                this.ghostGroup.add(edges);
                addedAnyGhost = true;
            }

            if (addedAnyGhost) {
                this.markSceneDirty();
            }

            if (end < ghostSpecs.length) {
                await this.yieldToMainThread();
            }
        }
    }

    private async registerLeafChunksProgressively(
        object: THREE.Object3D,
        leafNodes: Array<{ bounds: THREE.Box3; level: number; items: any[] }>,
        onProgress?: (p: number, msg: string) => void
    ) {
        const ghostSpecs: Array<{ chunkId: string; bounds: THREE.Box3 }> = [];

        for (let start = 0; start < leafNodes.length; start += this.chunkRegistrationBatchSize) {
            const end = Math.min(leafNodes.length, start + this.chunkRegistrationBatchSize);
            for (let index = start; index < end; index++) {
                const node = leafNodes[index];
                const chunkId = `${object.uuid}_chunk_${index}`;
                const chunkBounds = node.bounds.clone();

                node.items.forEach(item => {
                    const treeNodes = this.nodeMap.get(item.uuid);
                    if (treeNodes) {
                        treeNodes.forEach(treeNode => {
                            if (treeNode.bimId === undefined) {
                                treeNode.bimId = treeNode.id;
                            }
                            treeNode.chunkId = chunkId;
                        });
                    }
                });

                const paddedBounds = chunkBounds.clone();
                const padSize = chunkBounds.getSize(new THREE.Vector3()).multiplyScalar(this.chunkPadding);
                paddedBounds.expandByVector(padSize);

                // 按本分块实际几何估算解码内存，供驻留预算/卸载使用；
                // 旧实现没有该字段，chunkCostMB 一律按 1.5MB，大模型会被严重低估。
                let chunkMemoryMB = 0;
                const countedGeometries = new Set<THREE.BufferGeometry>();
                node.items.forEach((item: any) => {
                    const geometry = item?.geometry as THREE.BufferGeometry | undefined;
                    if (!geometry || countedGeometries.has(geometry)) return;
                    countedGeometries.add(geometry);
                    chunkMemoryMB += calculateGeometryMemory(geometry);
                });

                this.registerChunk({
                    id: chunkId,
                    bounds: chunkBounds,
                    paddedBounds,
                    _padding: this.chunkPadding,
                    center: chunkBounds.getCenter(new THREE.Vector3()),
                    loaded: false,
                    node,
                    estimatedDecodedMB: Math.max(0.35, chunkMemoryMB * CHUNK_FOOTPRINT_MULTIPLIER),
                    groupName: `optimized_${object.uuid}`,
                    originalUuid: object.uuid
                });

                ghostSpecs.push({ chunkId, bounds: chunkBounds });
            }

            if (onProgress && leafNodes.length > 0) {
                onProgress(40 + Math.floor((end / leafNodes.length) * 50), `正在生成分块... (${end}/${leafNodes.length})`);
            }
            if (end < leafNodes.length) {
                await this.yieldToMainThread();
            }
        }

        return ghostSpecs;
    }

    private async buildLeafPlans(
        items: any[],
        bounds: THREE.Box3,
        maxItemsPerNode: number,
        maxDepth: number
    ) {
        const workerThreshold = this.resolvedChunkOptions.preferWorkerOctree ? 1200 : this.octreeWorkerThreshold;
        if (items.length < workerThreshold) {
            const octree = buildOctree(items, bounds, { maxItemsPerNode, maxDepth });
            return collectLeafNodes(octree).map((node) => ({
                bounds: node.bounds,
                level: node.level,
                items: node.items
            }));
        }

        const centers = new Float32Array(items.length * 3);
        const radii = new Float32Array(items.length);
        for (let i = 0; i < items.length; i++) {
            const center = items[i].center;
            centers[i * 3] = center.x;
            centers[i * 3 + 1] = center.y;
            centers[i * 3 + 2] = center.z;
            radii[i] = 0;
            if (i > 0 && i % 16000 === 0) {
                await this.yieldToMainThread();
            }
        }

        const result = await this.runWorkerTask({
            taskType: "buildOctreePlan",
            centers,
            radii,
            bounds: [
                bounds.min.x, bounds.min.y, bounds.min.z,
                bounds.max.x, bounds.max.y, bounds.max.z
            ],
            maxItemsPerNode,
            maxDepth
        }, [centers.buffer, radii.buffer]);

        const leaves: Array<{ bounds: THREE.Box3; level: number; items: any[] }> = [];
        for (let i = 0; i < result.length; i++) {
            const leaf = result[i];
            leaves.push({
                bounds: new THREE.Box3(
                    new THREE.Vector3(leaf.bounds[0], leaf.bounds[1], leaf.bounds[2]),
                    new THREE.Vector3(leaf.bounds[3], leaf.bounds[4], leaf.bounds[5])
                ),
                level: leaf.level,
                items: Array.from(leaf.itemIndices, (itemIndex: number) => items[itemIndex])
            });
            if (i > 0 && i % 120 === 0) {
                await this.yieldToMainThread();
            }
        }

        return leaves;
    }

    updateCameraClipping() {
        if (!this.sceneBounds || this.sceneBounds.isEmpty()) return;

        if (!this.sceneSphereValid) {
            this.sceneBounds.getBoundingSphere(this.cachedSceneSphere);
            this.sceneSphereValid = true;
        }

        const dist = this.camera.position.distanceTo(this.cachedSceneSphere.center);

        // 增加更宽的裁剪范围，确保即便相机在模型内部或非常靠近时，也不会因为精度或计算误差导致裁剪
        // 使用半径的 20 倍作为基础，加上到中心的距离，确保范围足够覆盖整个可能的视锥空间
        const range = Math.max(this.cachedSceneSphere.radius * 20.0, dist + this.cachedSceneSphere.radius * 5.0);

        // 只有当变化显著时才更新，避免每帧都触发投影矩阵更新
        const threshold = 0.01; // 1% 的变化阈值
        if (Math.abs(this.camera.far - range) / Math.max(this.camera.far, 1) > threshold ||
            Math.abs(this.camera.near - (-range)) / Math.max(Math.abs(this.camera.near), 1) > threshold) {
            this.camera.near = -range;
            this.camera.far = range;
            this.camera.updateProjectionMatrix();
        }
    }

    resize(width?: number, height?: number) {
        if (!this.canvas || this.disposed) return;

        let w = width;
        let h = height;

        if (w === undefined || h === undefined) {
            const rect = this.canvas.parentElement?.getBoundingClientRect() || this.canvas.getBoundingClientRect();
            w = rect.width;
            h = rect.height;
        }

        w = Math.max(1, w);
        h = Math.max(1, h);

        if (w === 0 || h === 0) return;

        const aspect = w / h;
        const cam = this.camera;

        // 计算当前视锥体的高度
        const currentHeight = cam.top - cam.bottom;
        // 计算新的半高和半宽
        const halfHeight = currentHeight / 2;
        const halfWidth = halfHeight * aspect;

        // 仅在宽高比真正变化时更新投影矩阵
        let cameraChanged = false;
        if (Math.abs(cam.right - halfWidth) > 1e-4 || Math.abs(cam.top - halfHeight) > 1e-4) {
            cam.left = -halfWidth;
            cam.right = halfWidth;
            cam.top = halfHeight;
            cam.bottom = -halfHeight;
            cam.updateProjectionMatrix();
            cameraChanged = true;
        }

        // 像素比与画布尺寸的变化都会重建 WebGL 绘图缓冲（并清空画布），
        // 这里统一做去重，避免同一次布局变化触发多次缓冲区重建。
        const ratioChanged = this.applyPixelRatio(this.computeDesiredPixelRatio());
        const sizeChanged = this.applyCanvasSize(w, h);

        // 如果使用了 OrbitControls，需要更新它
        if (this.controls) {
            this.controls.update();
        }

        this.markSceneDirty({ needsCulling: cameraChanged });

        // 关键：绘图缓冲被重建后画布内容是空的。若等到下一帧的 animate 才渲染，
        // 浏览器会先呈现一张空白画布——这正是拖动面板宽度时剧烈闪烁的根因。
        // 因此在当前帧立即补渲染一次，保证任何时刻呈现的都是完整画面。
        if (ratioChanged || sizeChanged) {
            this.updateCameraClipping();
            this.renderFrame();
        }
    }

    private reportChunkProgress() {
        const pending = this.processingChunks.size + (this.chunkLoadPlanPending ? 1 : 0);
        const result = reportChunkProgressIfNeeded({
            now: performance.now(),
            total: this.chunks.length,
            loaded: this.chunkLoadedCount,
            pending,
            lastReportedProgress: this.lastReportedProgress,
            lastChunkProgressReportAt: this.lastChunkProgressReportAt
        });
        if (this.onChunkProgress && result.shouldNotify) {
            this.lastReportedProgress = result.nextProgress;
            this.lastChunkProgressReportAt = result.nextReportedAt;
            this.onChunkProgress(result.nextProgress.loaded, result.nextProgress.total, result.nextProgress.pending);
        }
    }

    private getChunkRuntimeProfile(chunkCount = this.chunks.length): ChunkRuntimeProfile {
        return selectChunkRuntimeProfile({
            chunkCount,
            compact: this.chunkRuntimeProfiles.compact,
            balanced: this.chunkRuntimeProfiles.balanced,
            massive: this.chunkRuntimeProfiles.massive
        });
    }

    private isInPostMoveRecovery(now: number) {
        return !this.isCameraMoving && now < this.postMoveRecoveryUntil;
    }

    private applyHighlightSettings() {
        const highlightMaterial = this.highlightMesh.material as THREE.MeshBasicMaterial | undefined;
        if (highlightMaterial) {
            highlightMaterial.color.set(this.settings.highlightColor || "#ff9f1c");
            highlightMaterial.transparent = false;
            highlightMaterial.opacity = 1;
            highlightMaterial.depthTest = false;
            highlightMaterial.depthWrite = false;
            highlightMaterial.side = THREE.BackSide;
            highlightMaterial.needsUpdate = true;
        }

        const boxMaterial = this.selectionBox.material as THREE.LineBasicMaterial | THREE.LineBasicMaterial[] | undefined;
        if (Array.isArray(boxMaterial)) {
            boxMaterial.forEach((material) => material.color.set(this.settings.highlightColor || "#ff9f1c"));
        } else if (boxMaterial) {
            boxMaterial.color.set(this.settings.highlightColor || "#ff9f1c");
        }
    }

    private getChunkRenderPhase(now: number): 'moving' | 'recovery' | 'idle' {
        if (this.isCameraMoving) return 'moving';
        if (this.isInPostMoveRecovery(now)) return 'recovery';
        return 'idle';
    }

    private getChunkFrameBudget(
        phase: 'moving' | 'recovery' | 'idle',
        profile: ChunkRuntimeProfile,
        warmupExtra: number
    ) {
        return computeChunkFrameBudget({
            forceMaxChunkLoadSpeed: this.forceMaxChunkLoadSpeed,
            maxChunkLoadsPerFrame: this.maxChunkLoadsPerFrame,
            performanceMode: this.settings.performanceMode ?? 'balanced',
            chunkCount: this.chunks.length,
            phase,
            profile,
            warmupExtra
        });
    }

    private isMovingPeripheralChunk(
        centrality: number,
        pixelSize: number,
        forwardness: number,
        profile: ChunkRuntimeProfile
    ) {
        return isMovingPeripheralChunkRule({
            centrality,
            pixelSize,
            forwardness,
            profile
        });
    }

    private shouldRefreshPeripheralChunk(
        now: number,
        chunkIndex: number,
        totalChunks: number,
        profile: ChunkRuntimeProfile
    ) {
        const result = updatePeripheralRefreshWindow({
            now,
            isCameraMoving: this.isCameraMoving,
            chunkIndex,
            totalChunks,
            profile,
            movingPeripheralCursor: this.movingPeripheralCursor,
            movingPeripheralLastRefreshAt: this.movingPeripheralLastRefreshAt
        });
        this.movingPeripheralCursor = result.movingPeripheralCursor;
        this.movingPeripheralLastRefreshAt = result.movingPeripheralLastRefreshAt;
        return result.shouldRefresh;
    }

    private checkCullingAndLoad(now = performance.now()) {
        if (!this.chunkLoadingEnabled) return;
        if (this.chunks.length === 0) return;
        this.reportChunkProgress();

        if (this.processingChunks.size >= this.maxConcurrentChunkLoads) return;
        const profile = this.getChunkRuntimeProfile();
        const phase = this.getChunkRenderPhase(now);
        const mode = this.settings.performanceMode ?? 'balanced';

        this.camera.updateMatrixWorld();
        this.projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

        const padding = this.chunkPadding;
        const cameraPos = this.camera.position;
        const cameraForward = this.chunkCullingTempForward;
        this.camera.getWorldDirection(cameraForward);
        const toChunkDirection = this.chunkCullingTempDirection;
        const tempSize = this.chunkCullingTempSize;
        const tempCenterNdc = this.chunkCullingTempCenterNdc;
        const viewHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
        const canvasHeight = this.renderer.domElement.clientHeight;
        const isOrthographicCamera = (this.camera as any).isOrthographicCamera === true;
        // 正交相机按视口高度换算；透视相机再叠加距离项。
        const perspectiveFocalPx = isOrthographicCamera
            ? 0
            : canvasHeight / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov || 45) * 0.5));

        const toLoad: any[] = [];
        const loadedChunks: any[] = [];
        const renderCandidates: Array<{ chunk: any; pixel: number; dist: number }> = [];
        const chunkCostMB = (chunk: any) => typeof chunk?.estimatedDecodedMB === "number"
            ? chunk.estimatedDecodedMB
            : Math.max(1.5, ((Number(chunk?.byteLength) || 0) / 1048576) * 5.5);
        const isClippingActive = this.renderer.clippingPlanes.length > 0;
        let sceneMutated = false;

        const totalChunks = this.chunks.length;
        const cullingLoopStart = performance.now();
        const cullingTimeBudgetMs = phase === 'moving'
            ? this.cullingTimeBudgetMovingMs
            : phase === 'recovery'
                ? this.cullingTimeBudgetRecoveryMs
                : this.cullingTimeBudgetIdleMs;
        let abortedByBudget = false;
        const sampleUnloadedWhileMoving = mode !== 'quality' && phase === 'moving' && totalChunks > 1800;
        const movingSampleStride = sampleUnloadedWhileMoving
            ? (totalChunks > 5000 ? 8 : totalChunks > 3000 ? 6 : 4)
            : 1;
        const movingSampleSeed = sampleUnloadedWhileMoving
            ? Math.floor(now / Math.max(1, profile.movingPeripheralRefreshMs)) % movingSampleStride
            : 0;
        const startIndex = totalChunks > 0 ? (this.cullingScanCursor % totalChunks) : 0;
        for (let scanOffset = 0; scanOffset < totalChunks; scanOffset++) {
            const chunkIndex = (startIndex + scanOffset) % totalChunks;
            const c = this.chunks[chunkIndex];
            if ((scanOffset & 31) === 0) {
                const elapsed = performance.now() - cullingLoopStart;
                if (elapsed > cullingTimeBudgetMs) {
                    abortedByBudget = true;
                    this.cullingScanCursor = (chunkIndex + 1) % totalChunks;
                    break;
                }
            }
            ensureChunkSpatialState({
                chunk: c,
                padding,
                tempSize
            });

            const inFrustum = this.frustum.intersectsBox(c.paddedBounds);
            const isClipped = isClippingActive && this.isBoxClipped(c.bounds);
            const evaluation = evaluateChunkVisibility({
                chunk: c,
                chunkIndex,
                totalChunks,
                now,
                phase,
                profile,
                performanceMode: mode,
                isBoxClipped: isClipped,
                inFrustum,
                maxRenderDistance: this.maxRenderDistance,
                cameraPos,
                cameraForward,
                projScreenMatrix: this.projScreenMatrix,
                toChunkDirection,
                tempCenterNdc,
                viewHeight,
                canvasHeight,
                sampleUnloadedWhileMoving,
                movingSampleStride,
                movingSampleSeed,
                resolveShouldRefreshPeripheral: (isPeripheralWhileMoving) =>
                    !isPeripheralWhileMoving || this.shouldRefreshPeripheralChunk(now, chunkIndex, totalChunks, profile),
                chunkWarmupActive: this.chunkWarmupActive,
                chunkLoadedCount: this.chunkLoadedCount,
                initialChunkLoadTarget: this.initialChunkLoadTarget,
                chunkLoadResumeAt: this.chunkLoadResumeAt,
                chunkMeshCached: this.chunkMeshCache.has(c.id),
                allowFullChunkLoad: this.allowFullChunkLoad
            });
            if (evaluation.shouldSkipSample) {
                continue;
            }

            if (evaluation.effectiveVisible) {
                c.lastVisibleAt = now;
            }
            if (evaluation.centrality > 0.42 || evaluation.forwardness > 0.55) {
                c.lastFocusAt = now;
            }
            c.lastEffectiveVisible = evaluation.effectiveVisible;
            const boxDiag = c.bounds.getSize(tempSize).length();
            c._lastPixelSize = isOrthographicCamera
                ? (boxDiag / Math.max(1e-6, viewHeight)) * canvasHeight
                : (boxDiag / Math.max(1e-3, evaluation.dist)) * perspectiveFocalPx;

            // 渲染策略切换后，新的分块按新策略解码；已加载分块保持现状。
            // 分辨率变化（放大）后，当前粗 LOD 阈值如果明显偏粗，就重新加载更细的几何。
            // 用“已应用的阈值 vs 当前期望阈值”判断，避免按像素反复卸载/重载抖动。
            if (c.loaded && c._coarseLodApplied > 0 && !this.processingChunks.has(c.id)) {
                const desiredMinSize = this.getCoarseLodMinSize(c);
                if (c._coarseLodApplied > desiredMinSize * 1.25
                    && now - (c.lastLodUpgradeAt || 0) > 1500) {
                    c.lastLodUpgradeAt = now;
                    this.unloadChunk(c);
                    sceneMutated = true;
                    continue;
                }
            }

            if (c.loaded) {
                loadedChunks.push(c);
                if (c.mesh) {
                    if (c.mesh.visible !== evaluation.effectiveVisible) {
                        c.mesh.visible = evaluation.effectiveVisible;
                        sceneMutated = true;
                    }
                } else {
                    const optimizedGroup = this.contentGroup.getObjectByName(c.groupName);
                    const bm = optimizedGroup?.getObjectByName(c.id);
                    if (bm) {
                        c.mesh = bm;
                        bm.visible = evaluation.effectiveVisible;
                        sceneMutated = true;
                    }
                }
                if (evaluation.effectiveVisible && c.mesh) {
                    renderCandidates.push({ chunk: c, pixel: c._lastPixelSize || 0, dist: evaluation.dist });
                }
            } else if (!this.processingChunks.has(c.id) && evaluation.shouldBeVisible && evaluation.priority !== null) {
                c.priority = evaluation.priority;
                toLoad.push(c);
            }
        }
        if (!abortedByBudget) {
            this.cullingScanCursor = (startIndex + totalChunks) % Math.max(totalChunks, 1);
        }

        this.applyRenderBudget(renderCandidates);

        const memoryPressure = this.settings.autoResident !== false && this.isMemoryPressureHigh();
        const unloadTargets = selectChunksToUnload({
            isCameraMoving: this.isCameraMoving,
            loadedChunks,
            // 只有真实内存压力才按数量/预算卸载；否则视口变化（放大/平移）只隐藏不卸载。
            maxLoadedChunks: memoryPressure
                ? Math.max(48, loadedChunks.length - 96)
                : (this.fitsAllChunks ? Number.MAX_SAFE_INTEGER : this.maxLoadedChunks),
            maxResidentMB: memoryPressure ? this.chunkResidentBudgetMB : 0,
            chunkCostMB,
            cameraPos,
            now,
            chunkResidencyMs: this.chunkResidencyMs,
            // 内存吃紧、且有新分块要进来时才主动腾位置；正常浏览不腾。
            minFreeSlots: (!memoryPressure
                && !this.fitsAllChunks
                && loadedChunks.length >= this.maxLoadedChunks
                && toLoad.length > 0)
                ? Math.min(24, toLoad.length)
                : 0
        });
        for (const chunk of unloadTargets) {
            this.unloadChunk(chunk);
        }
        if (unloadTargets.length > 0) {
            sceneMutated = true;
        }

        // 重新统计“卸载后仍真实驻留”的分块，否则预算仍按卸载前的满额计算，
        // 会导致同一帧卸载 N 块却一块也补不进来，下一帧再加载，形成抖动。
        const residentChunks = loadedChunks.filter((chunk) => chunk.loaded && chunk.mesh);
        const loadedEstimatedMB = residentChunks.reduce((sum, chunk) => sum + chunkCostMB(chunk), 0);
        let processingEstimatedMB = 0;
        this.processingChunks.forEach((id) => {
            const chunk = this.chunkById.get(id);
            if (chunk) processingEstimatedMB += chunkCostMB(chunk);
        });

        const loadPlan = planChunkLoads({
            toLoad,
            now: performance.now(),
            chunkLoadResumeAt: this.chunkLoadResumeAt,
            maxConcurrentChunkLoads: this.maxConcurrentChunkLoads,
            processingChunkCount: this.processingChunks.size,
            maxResidentChunks: this.maxLoadedChunks,
            residentChunkCount: residentChunks.length,
            maxResidentMB: this.chunkResidentBudgetMB,
            residentUsedMB: loadedEstimatedMB + processingEstimatedMB,
            chunkCostMB,
            chunkWarmupActive: this.chunkWarmupActive,
            chunkLoadedCount: this.chunkLoadedCount,
            initialChunkLoadTarget: this.initialChunkLoadTarget,
            warmupChunkBoost: this.warmupChunkBoost,
            getChunkFrameBudget: (nextPhase, nextProfile, warmupExtra) =>
                this.getChunkFrameBudget(nextPhase, nextProfile, warmupExtra),
            phase,
            profile
        });
        for (const chunk of loadPlan) {
            this.loadChunk(chunk);
        }
        if (loadPlan.length > 0) {
            sceneMutated = true;
            // 还有一批要加载：保持 culling 脏标记，下一帧继续排，直到加载完或预算用尽。
            this.cullingDirty = true;
        }
        this.chunkLoadPlanPending = loadPlan.length > 0;
        this.reportChunkProgress();

        this.schedulePrefetchFromVisibleChunks(loadedChunks);
        if (!this.forceMaxChunkLoadSpeed) {
            // 保留入口，当前极速模式下不做自适应降速。
        }

        if (abortedByBudget) {
            // 延后剩余扫描到后续帧，避免单帧卡顿尖峰。
            this.cullingDirty = true;
        }

        if (this.chunkWarmupActive && this.chunkLoadedCount >= this.initialChunkLoadTarget) {
            this.chunkWarmupActive = false;
            sceneMutated = true;
        }

        if (sceneMutated || abortedByBudget) {
            this.markSceneDirty();
        }
    }

    private async runWorkerTask(data: any, transferables: any[]): Promise<any> {
        return queueChunkWorkerTask({
            workerQueue: this.workerQueue,
            data,
            transferables,
            processQueue: () => this.processWorkerQueue()
        });
    }

    private processWorkerQueue() {
        processChunkWorkerQueue({
            activeWorkerCount: this.activeWorkerCount,
            maxWorkers: this.maxWorkers,
            workerQueue: this.workerQueue,
            workers: this.workers,
            createWorker: () => {
                // @ts-ignore
                return new Worker(new URL('../chunkWorker.ts', import.meta.url), { type: 'module' });
            },
            getActiveWorkerCount: () => this.activeWorkerCount,
            onActiveWorkerCountChange: (count) => {
                this.activeWorkerCount = count;
            },
            processQueue: () => this.processWorkerQueue()
        });
    }

    private unloadChunk(chunk: any) {
        const result = applyUnloadChunk({
            chunk,
            now: performance.now(),
            unregisterOptimizedMeshMapping: (mesh) => this.unregisterOptimizedMeshMapping(mesh),
            cacheChunkMesh: (nextChunk, mesh) => {
                if (nextChunk.lodLevel === 1) {
                    // 粗 LOD 网格不缓存，避免下次升级时又命中简化版本。
                    this.disposeChunkMesh(mesh);
                    return;
                }
                this.cacheChunkMesh(nextChunk, mesh);
            },
            ensureChunkGhost: (nextChunk) => this.ensureChunkGhost(nextChunk)
        });
        if (!result.changed) return;

        this.chunkLoadedCount = Math.max(0, this.chunkLoadedCount + result.chunkLoadedCountDelta);
        this.markSceneDirty({
            invalidateInteractables: true,
            needsBoundsUpdate: true,
            needsCulling: true
        });
    }

    private async loadChunk(chunk: any) {
        this.processingChunks.add(chunk.id);
        this.markSceneDirty();
        try {
            let loadedNow = false;
            let needsRender = false;
            let needsBoundsUpdate = false;
            let invalidateInteractables = false;
            let needsCulling = false;
            // 远景块按屏幕尺寸选择粗 LOD：只保留世界尺寸较大的实例。
            chunk._coarseLodMinSize = this.getCoarseLodMinSize(chunk);
            chunk._coarseLodApplied = chunk._coarseLodMinSize;
            const { mesh: bm, prefetchCandidates, triangles: chunkTriangles, lodStats } = await resolveChunkMeshForLoad({
                chunk,
                sharedMaterial: this.sharedMaterial,
                takeCachedChunkMesh: (chunkId) => this.takeCachedChunkMesh(chunkId),
                yieldToMainThread: () => this.yieldToMainThread(),
                nbimFiles: this.nbimFiles,
                hasValidChunkBinaryRange: (nextChunk) => this.hasValidChunkBinaryRange(nextChunk),
                readChunkBuffer: (nextChunk) => this.readChunkBuffer(nextChunk),
                nbimMeta: this.nbimMeta,
                runWorkerTask: (data, transferables) => this.runWorkerTask(data, transferables),
                reconstructBatchedMesh: (data, material) => reconstructBatchedMeshFromWorkerData({
                    data,
                    material,
                    resolveUuidByBimId: (originalUuid, bimId) => {
                        const key = `${originalUuid}::${bimId}`;
                        const nodeIds = this.bimIdToNodeIds.get(key);
                        if (nodeIds && nodeIds.length > 0 && chunk.nbimFileId) {
                            // 同一个 NBIM 可能被打开多次，优先命中本次加载对应的结构节点。
                            for (const nodeId of nodeIds) {
                                const node = this.nodeMap.get(nodeId)?.[0];
                                if (node?.userData?.loadId === chunk.nbimFileId) return nodeId;
                            }
                        }
                        return nodeIds?.[0] || bimId || originalUuid;
                    }
                }),
                isCameraMoving: this.isCameraMoving,
                chunkPrefetchWindow: this.resolvedChunkOptions.chunkPrefetchWindow,
                getChunkIndex: (chunkId) => this.getChunkIndex(chunkId),
                chunks: this.chunks,
                processingChunks: this.processingChunks
            });

            if (prefetchCandidates.length > 0) {
                this.enqueueChunkPrefetch(prefetchCandidates);
                void this.processPrefetchQueue();
            }

            if (bm) {
                const attached = attachLoadedChunkMesh({
                    chunk,
                    mesh: bm,
                    cancelledChunkIds: this.cancelledChunkIds,
                    chunkIdSet: this.chunkIdSet,
                    disposeChunkMesh: (mesh) => this.disposeChunkMesh(mesh),
                    globalOffset: this.globalOffset,
                    contentGroup: this.contentGroup,
                    registerOptimizedMeshMapping: (mesh) => this.registerOptimizedMeshMapping(mesh),
                    frustumCulled: this.settings.frustumCulling !== false
                });
                loadedNow = attached.attached;
                if (loadedNow) {
                    // 记录本次加载标识，删除模型时用它精确回收 chunkMeshCache，
                    // 否则同一 NBIM 打开两份时无法区分、缓存会一直持有几何。
                    bm.userData.loadId = chunk.nbimFileId || chunk.originalUuid;
                    chunk.triCount = chunkTriangles || 0;
                    invalidateInteractables = true;
                    needsBoundsUpdate = true;
                    needsRender = true;
                    // 分块网格是后挂上来的，需要单独补棱边
                    this.buildDisplayEdgesFor(bm);
                }
            }

            if (bm) {
                if (lodStats && lodStats.originalVerts > 0) {
                    const ratio = Math.max(0.05, lodStats.keptVerts / lodStats.originalVerts);
                    chunk.lodRatio = ratio;
                    chunk.lodLevel = ratio < 0.98 ? 1 : 0;
                    if (chunk.lodLevel === 1) {
                        // 粗 LOD 的实际驻留成本按顶点比例折算，低内存机器可以多装一些块。
                        chunk.estimatedDecodedMB = Math.max(
                            0.35,
                            (Number(chunk.estimatedDecodedMB) || 1.5) * ratio
                        );
                    }
                } else {
                    chunk.lodLevel = 0;
                    chunk.lodRatio = 1;
                }
            }

            const finalized = finalizeLoadedChunk({
                chunk,
                loadedNow,
                now: performance.now(),
                chunkLoadedCount: this.chunkLoadedCount,
                chunkWarmupActive: this.chunkWarmupActive,
                initialChunkLoadTarget: this.initialChunkLoadTarget,
                deactivateFastPreviewForModel: (originalUuid) => this.deactivateFastPreviewForModel(originalUuid)
            });
            this.chunkLoadedCount = finalized.nextChunkLoadedCount;
            this.chunkWarmupActive = finalized.nextChunkWarmupActive;
            if (finalized.progressChanged) {
                this.reportChunkProgress();
                needsCulling = true;
                needsRender = true;
            }
            this.cancelledChunkIds.delete(chunk.id);

            const ghostCleanup = cleanupChunkGhost({
                chunkId: chunk.id,
                ghostGroup: this.ghostGroup,
                releaseGhostLine: (line) => this.releaseGhostLine(line)
            });
            if (ghostCleanup.changed) {
                needsRender = true;
            }
            if (needsRender) {
                this.markSceneDirty({
                    invalidateInteractables,
                    needsBoundsUpdate,
                    needsCulling
                });
            }
        } catch (err) {
            console.error(`加载分块 ${chunk.id} 失败:`, err);
        } finally {
            this.processingChunks.delete(chunk.id);
            // 让界面及时收到 pending 变化（尤其是最后一个分块结束、pending 归零时）。
            this.reportChunkProgress();
            this.markSceneDirty();
        }
    }

    setChunkLoadingEnabled(enabled: boolean) {
        this.chunkLoadingEnabled = enabled;
        this.prefetchPaused = !enabled;
        this.cullingDirty = true;
        if (enabled) {
            this.checkCullingAndLoad();
        }
        this.markSceneDirty({ needsCulling: enabled });
    }

    private applyNbimScaleTuning(
        chunkEntries: any[],
        manifestStats?: { meshes?: number; faces?: number; memory?: number }
    ) {
        const chunks = Array.isArray(chunkEntries) ? chunkEntries : [];
        const chunkCount = chunks.length;
        const userChunkOptions = this.options.chunkOptions || {};
        const autoTuned = {
            chunkPrefetchWindow: 0,
            chunkReadCacheSize: chunkCount >= 800 ? 96 : 128,
            targetMinFps: 20
        };

        this.setChunkOptions({
            chunkPrefetchWindow: userChunkOptions.chunkPrefetchWindow ?? autoTuned.chunkPrefetchWindow,
            chunkReadCacheSize: userChunkOptions.chunkReadCacheSize ?? autoTuned.chunkReadCacheSize,
            chunkReadCacheMB: userChunkOptions.chunkReadCacheMB,
            coarseLod: userChunkOptions.coarseLod ?? this.coarseLodEnabled,
            targetMinFps: userChunkOptions.targetMinFps ?? autoTuned.targetMinFps,
            ghostMode: userChunkOptions.ghostMode ?? this.resolvedChunkOptions.ghostMode,
            loadProfile: userChunkOptions.loadProfile ?? this.resolvedChunkOptions.loadProfile,
            deferIfcProperties: userChunkOptions.deferIfcProperties ?? this.resolvedChunkOptions.deferIfcProperties,
            preferWorkerOctree: userChunkOptions.preferWorkerOctree ?? this.resolvedChunkOptions.preferWorkerOctree,
            fastGeometrySanitize: userChunkOptions.fastGeometrySanitize ?? this.resolvedChunkOptions.fastGeometrySanitize
        });

        // 按“单个分块解码后的内存占用 × JS 堆上限”推导驻留预算。
        const totalRawBytes = chunks.reduce((sum, chunk) => sum + (Number(chunk?.decodedLength) || Number(chunk?.byteLength) || 0), 0);
        const totalRawMB = totalRawBytes / 1048576;

        // 关键修正：NBIM 分块二进制里已经是“解码后”的顶点/法线/索引 + 实例矩阵，
        // 真正进入 JS 堆的几何内存与原始字节数同量级（约 0.6~1.3 倍），
        // 旧代码按 5.5 倍估算会把一个 2.9GB / 1271 块的模型算成 ~16GB，
        // 于是把驻留上限压到 90 多块：模型只剩一小块实体、其余全是 ghost 线框，
        // 只有已加载分块能拾取，看起来就是“加载不动、点选失效、结构残缺”。
        // 优先用 manifest.stats.memory（导出时按真实几何统计的内存），缺失时才保守估算。
        const manifestDecodedMB = Number(manifestStats?.memory);
        const hasManifestMemory = Number.isFinite(manifestDecodedMB) && manifestDecodedMB > 0;
        const newDecodedMB = hasManifestMemory ? manifestDecodedMB : totalRawMB * 1.1;
        this.nbimDecodedMBPerRawByte = totalRawBytes > 0
            ? Math.max(0.2, Math.min(1.5, (newDecodedMB * 1048576) / totalRawBytes))
            : 1;

        // 支持连续打开多个 NBIM：预算和分块上限要按“已有模型 + 本次模型”累计。
        // 注意 registerOriginalStats 已经先登记了本次模型的统计，这里要先扣掉，避免重复累加。
        const existingChunkCount = this.chunks.length;
        const currentAccountedMB = hasManifestMemory ? manifestDecodedMB : totalRawMB;
        const existingDecodedMB = Math.max(0, (Number(this.originalStats.memory) || 0) - currentAccountedMB);
        const totalChunkCount = existingChunkCount + chunkCount;
        const totalDecodedMB = existingDecodedMB + newDecodedMB;
        const perChunkGeometryMB = totalChunkCount > 0
            ? Math.max(0.35, totalDecodedMB / totalChunkCount)
            : 1.5;
        const perChunkFootprintMB = perChunkGeometryMB * CHUNK_FOOTPRINT_MULTIPLIER;

        const perfMemory = (performance as any)?.memory;
        const heapLimitMB = perfMemory?.jsHeapSizeLimit
            ? perfMemory.jsHeapSizeLimit / 1048576
            : Math.max(1536, ((navigator as any)?.deviceMemory || 8) * 512);
        // 用“当前已用堆”倒推还能给几何多少空间：结构树 / 23 万条属性文档 / 材质等
        // 在这个模型上就要占 1GB 以上，固定按堆比例预留会低估非几何开销。
        let baseUsedMB = perfMemory?.usedJSHeapSize
            ? Math.max(0, perfMemory.usedJSHeapSize / 1048576 - this.getResidentChunkMB())
            : 0;
        // 上一次重模型遗留的未回收垃圾会把 usedJSHeapSize 抬到几 GB，
        // 按它算预算会把常驻上限压到只剩几十块；超过 60% 堆上限就视为脏数据。
        if (baseUsedMB > heapLimitMB * 0.6) baseUsedMB = 650;
        this.lastBaseUsedMB = baseUsedMB > 0 ? baseUsedMB : 650;
        const usableBudgetMB = baseUsedMB > 0
            ? heapLimitMB * 0.80 - baseUsedMB
            : heapLimitMB * 0.5;
        const geometryBudgetMB = Math.min(3200, Math.max(384, usableBudgetMB));
        const fitsAll = totalDecodedMB > 0
            && totalDecodedMB * CHUNK_FOOTPRINT_MULTIPLIER <= geometryBudgetMB;
        this.fitsAllChunks = fitsAll;

        // 装得下就全量；装不下就按预算限制驻留数。两种情况都放开 4px 剔除，
        // 让预算内的分块（按中心/距离优先级）尽量铺满，而不是只加载视野正中几块。
        const derivedLoadedCap = Math.floor(geometryBudgetMB / perChunkFootprintMB);
        this.maxLoadedChunks = fitsAll
            ? totalChunkCount
            : Math.max(48, Math.min(totalChunkCount, derivedLoadedCap));
        this.shadedMaxLoadedChunks = this.maxLoadedChunks;
        this.maxCachedChunks = Math.max(8, Math.min(128, Math.floor(this.maxLoadedChunks / 4)));
        this.chunkResidentBudgetMB = geometryBudgetMB;
        this.allowFullChunkLoad = true;

        // 并行解码的在途内存峰值同样受单块大小约束（预留约 1GB 缓冲）。
        if (this.forceMaxChunkLoadSpeed) {
            const derivedConcurrent = Math.floor(1024 / perChunkFootprintMB);
            this.maxConcurrentChunkLoads = Math.max(8, Math.min(this.maxConcurrentChunkLoads, derivedConcurrent));
            this.maxChunkLoadsPerFrame = Math.max(4, Math.min(this.maxChunkLoadsPerFrame, Math.ceil(derivedConcurrent / 2)));
        }

        debugLog("SceneManager/NBIM", "分块预算", {
            chunkCount,
            totalRawMB: Number(totalRawMB.toFixed(1)),
            totalDecodedMB: Number(totalDecodedMB.toFixed(1)),
            perChunkFootprintMB: Number(perChunkFootprintMB.toFixed(2)),
            baseUsedMB: Number(baseUsedMB.toFixed(0)),
            heapLimitMB: Number(heapLimitMB.toFixed(0)),
            geometryBudgetMB: Number(geometryBudgetMB.toFixed(0)),
            fitsAll,
            maxLoadedChunks: this.maxLoadedChunks,
            maxCachedChunks: this.maxCachedChunks,
            maxConcurrentChunkLoads: this.maxConcurrentChunkLoads
        });
    }

    setChunkOptions(options: SceneChunkOptions = {}) {
        const resolved = resolveSceneChunkOptions(options);
        this.resolvedChunkOptions.chunkReadCacheSize = resolved.chunkReadCacheSize;
        this.resolvedChunkOptions.chunkReadCacheMB = resolved.chunkReadCacheMB;
        this.coarseLodEnabled = resolved.coarseLod;
        this.resolvedChunkOptions.chunkPrefetchWindow = resolved.chunkPrefetchWindow;
        this.resolvedChunkOptions.ghostMode = resolved.ghostMode;
        this.resolvedChunkOptions.targetMinFps = resolved.targetMinFps;
        this.resolvedChunkOptions.loadProfile = resolved.loadProfile;
        this.resolvedChunkOptions.deferIfcProperties = resolved.deferIfcProperties;
        this.resolvedChunkOptions.preferWorkerOctree = resolved.preferWorkerOctree;
        this.resolvedChunkOptions.fastGeometrySanitize = resolved.fastGeometrySanitize;
        this.settings.targetFps = resolved.targetMinFps;

        this.chunkReadCacheOrder = trimChunkReadCache({
            chunkReadCache: this.chunkReadCache,
            chunkReadCacheSize: this.resolvedChunkOptions.chunkReadCacheSize,
            chunkReadCacheMB: this.resolvedChunkOptions.chunkReadCacheMB
        });
    }

    getChunkOptions() {
        return {
            chunkReadCacheSize: this.resolvedChunkOptions.chunkReadCacheSize,
            chunkReadCacheMB: this.resolvedChunkOptions.chunkReadCacheMB,
            coarseLod: this.coarseLodEnabled,
            chunkPrefetchWindow: this.resolvedChunkOptions.chunkPrefetchWindow,
            ghostMode: this.resolvedChunkOptions.ghostMode,
            targetMinFps: this.resolvedChunkOptions.targetMinFps,
            loadProfile: this.resolvedChunkOptions.loadProfile,
            deferIfcProperties: this.resolvedChunkOptions.deferIfcProperties,
            preferWorkerOctree: this.resolvedChunkOptions.preferWorkerOctree,
            fastGeometrySanitize: this.resolvedChunkOptions.fastGeometrySanitize
        };
    }

    setContentVisible(visible: boolean) {
        this.contentGroup.visible = visible;
        this.ghostGroup.visible = visible;
        this.markSceneDirty({ needsCulling: true });
    }

    /**
     * 深拷贝 NBIM 结构树并保证节点 id 全局唯一。
     * 同一个 NBIM 被打开两次时，结构树里的根节点 id 都是文件名（如 `xxx.lmb`），
     * 直接复用会出现 React 重复 key，并且 nodeMap 里 id 冲突——删除其中一个模型
     * 会把另一个也一起从结构树上过滤掉。
     */
    private cloneStructureTreeWithUniqueIds(root: any, loadId: string) {
        const used = new Set<string>(this.nodeMap.keys());
        const clone = (node: any): any => {
            if (!node || typeof node !== "object") return node;
            const copy: any = {
                ...node,
                userData: node.userData ? { ...node.userData, loadId } : { loadId }
            };
            const baseId = String(node.id ?? "");
            let id = baseId;
            let suffix = 2;
            while (used.has(id)) {
                id = `${baseId}#${suffix}`;
                suffix++;
            }
            used.add(id);
            copy.id = id;
            if (Array.isArray(node.children)) {
                copy.children = node.children.map(clone);
            }
            return copy;
        };
        return clone(root);
    }

    private buildSceneGraph(object: THREE.Object3D): StructureTreeNode {
        const fallbackName = (object as any).isMesh ? `Mesh_${object.id}` : `Group_${object.id}`;
        const node: StructureTreeNode = {
            id: object.uuid,
            name: sanitizeDisplayLabel(object.name, object.userData?.name) || fallbackName,
            type: (object as any).isMesh ? 'Mesh' : 'Group',
            children: [],
            bimId: object.userData?.bimId ? String(object.userData.bimId)
                : object.userData?.expressID !== undefined ? String(object.userData.expressID)
                    : (object.name ? String(object.name) : undefined),
            userData: { ...object.userData }
        };

        // 将节点添加到映射表（支持一个 ID 对应多个节点）
        if (!this.nodeMap.has(object.uuid)) this.nodeMap.set(object.uuid, []);
        this.nodeMap.get(object.uuid)!.push(node);

        for (const child of object.children) {
            node.children!.push(this.buildSceneGraph(child));
        }
        return node;
    }

    /**
     * 构建基于 IFC 图层和空间结构的复合树
     */
    private buildIFCStructure(object: THREE.Object3D): StructureTreeNode {
        // 递归构建原始空间结构
        const buildSpatialRecursive = (obj: THREE.Object3D): StructureTreeNode => {
            const fallbackName = (obj as any).isMesh ? `Mesh_${obj.id}` : `Group_${obj.id}`;
            const node: StructureTreeNode = {
                id: obj.uuid,
                name: sanitizeDisplayLabel(obj.name, obj.userData?.name) || fallbackName,
                type: (obj as any).isMesh ? 'Mesh' : 'Group',
                children: [],
                bimId: obj.userData?.bimId ? String(obj.userData.bimId)
                    : obj.userData?.expressID !== undefined ? String(obj.userData.expressID)
                        : (obj.name ? String(obj.name) : undefined),
                userData: { ...obj.userData }
            };

            if (!this.nodeMap.has(obj.uuid)) this.nodeMap.set(obj.uuid, []);
            this.nodeMap.get(obj.uuid)!.push(node);

            for (const child of obj.children) {
                if (child.userData?.isIfcGridHelper) continue;
                node.children!.push(buildSpatialRecursive(child));
            }
            return node;
        };

        return buildSpatialRecursive(object);
    }

    private async prepareObjectRuntimeData(
        object: THREE.Object3D,
        maxAnisotropy: number,
        batchSize = 6000
    ) {
        const stack: THREE.Object3D[] = [object];
        let traverseIndex = 0;

        while (stack.length > 0) {
            const child = stack.pop()!;
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                this.componentMap.set(mesh.uuid, mesh);
                if (mesh.userData.expressID !== undefined) {
                    this.componentMap.set(mesh.userData.expressID, mesh);
                }
                if (!mesh.userData.bimId) {
                    if (mesh.userData.expressID !== undefined) mesh.userData.bimId = String(mesh.userData.expressID);
                    else mesh.userData.bimId = mesh.uuid;
                }
                if (mesh.material) {
                    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    materials.forEach(mat => {
                        if ((mat as THREE.MeshStandardMaterial).map) {
                            (mat as THREE.MeshStandardMaterial).map!.anisotropy = maxAnisotropy;
                        }
                    });
                }
            }
            traverseIndex++;

            for (let i = child.children.length - 1; i >= 0; i--) {
                stack.push(child.children[i]);
            }

            if (traverseIndex > 0 && traverseIndex % batchSize === 0) {
                await this.yieldToMainThread();
            }
        }
    }

    private applyGlobalOffsetForModel(object: THREE.Object3D) {
        const modelBox = new THREE.Box3().setFromObject(object);
        if (modelBox.isEmpty()) return modelBox;

        if (this.globalOffset.length() === 0) {
            modelBox.getCenter(this.globalOffset);
            console.log("初始化全局偏移以解决大坐标问题:", this.globalOffset);
        }

        object.position.sub(this.globalOffset);
        object.updateMatrixWorld(true);
        return new THREE.Box3().setFromObject(object);
    }

    /**
     * 非 NBIM（LMB/GLB/IFC 等）模型的分块驻留预算：
     * 用当前累计的真实几何内存决定“能否全部加载”，装得下就放开全部分块，
     * 让模型完整显示、处处可点选；装不下才按内存预算流式卸载。
     */
    private applyModelChunkBudget() {
        const perfMemory = (performance as any)?.memory;
        const heapLimitMB = perfMemory?.jsHeapSizeLimit
            ? perfMemory.jsHeapSizeLimit / 1048576
            : Math.max(1536, ((navigator as any)?.deviceMemory || 8) * 512);
        let baseUsedMB = perfMemory?.usedJSHeapSize
            ? Math.max(0, perfMemory.usedJSHeapSize / 1048576 - this.getResidentChunkMB())
            : 0;
        // 上一次重模型遗留的未回收垃圾会把 usedJSHeapSize 抬到几 GB，
        // 按它算预算会把常驻上限压到只剩几十块；超过 60% 堆上限就视为脏数据。
        if (baseUsedMB > heapLimitMB * 0.6) baseUsedMB = 650;
        this.lastBaseUsedMB = baseUsedMB > 0 ? baseUsedMB : 650;
        const usableBudgetMB = baseUsedMB > 0 ? heapLimitMB * 0.80 - baseUsedMB : heapLimitMB * 0.5;
        const geometryBudgetMB = Math.min(3200, Math.max(384, usableBudgetMB));
        const totalDecodedMB = Math.max(0, Number(this.originalStats.memory) || 0);
        const fitsAll = totalDecodedMB > 0
            && totalDecodedMB * CHUNK_FOOTPRINT_MULTIPLIER <= geometryBudgetMB;
        this.fitsAllChunks = fitsAll;

        this.chunkResidentBudgetMB = geometryBudgetMB;
        // 分块还没创建，先放开 4px 剔除；具体驻留数量由内存预算（chunkCostMB）约束。
        this.allowFullChunkLoad = true;
        if (fitsAll) {
            this.maxLoadedChunks = Math.max(this.maxLoadedChunks, 8192);
            this.maxCachedChunks = Math.max(this.maxCachedChunks, 128);
        }
        this.shadedMaxLoadedChunks = this.maxLoadedChunks;
    }

    private configureModelWarmup(meshCount: number) {
        this.chunkWarmupActive = true;
        if (this.resolvedChunkOptions.loadProfile === "max-speed") {
            this.initialChunkLoadTarget = meshCount > 100000 ? 42 : meshCount > 30000 ? 32 : 20;
            this.warmupChunkBoost = 16;
            return;
        }
        this.initialChunkLoadTarget = meshCount > 100000 ? 24 : meshCount > 30000 ? 18 : 12;
        this.warmupChunkBoost = 12;
    }

    private prepareStructureStage(
        object: THREE.Object3D,
        meshCount: number,
        onProgress?: (p: number, msg: string) => void
    ) {
        const shouldDeferStructure = meshCount >= this.deferredStructureThreshold;
        let deferredPlaceholderId: string | null = null;

        if (onProgress) {
            onProgress(5, shouldDeferStructure ? "正在准备轻量预览..." : "正在构建场景树...");
        }

        if (shouldDeferStructure) {
            deferredPlaceholderId = `deferred_${object.uuid}`;
            const placeholder: StructureTreeNode = {
                id: deferredPlaceholderId,
                name: `${object.name || 'Model'} (${meshCount} meshes)`,
                type: 'Group',
                children: [],
                userData: {
                    originalUuid: object.uuid,
                    deferred: true,
                    meshCount
                }
            };
            this.attachStructureRoot(placeholder);
            if (this.onStructureUpdate) this.onStructureUpdate();
        } else {
            const modelRoot = this.buildAndRegisterModelStructure(object);
            this.attachStructureRoot(modelRoot);
        }

        return { shouldDeferStructure, deferredPlaceholderId };
    }

    private prepareModelBoundsStage(object: THREE.Object3D, modelBox: THREE.Box3) {
        if (!modelBox.isEmpty()) {
            this.precomputedBounds.union(modelBox);
            this.sceneBounds.copy(this.precomputedBounds);
        }

        return !modelBox.isEmpty()
            ? this.createPreviewGhost(modelBox.clone(), `preview_${object.uuid}`)
            : null;
    }

    private async prepareModelRuntimeStage(object: THREE.Object3D, meshCount: number) {
        const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
        const shouldDeferRuntimeData = meshCount > 30000;
        if (shouldDeferRuntimeData) {
            void this.prepareObjectRuntimeData(object, maxAnisotropy, 8000);
        } else {
            await this.prepareObjectRuntimeData(object, maxAnisotropy, 6000);
        }
    }

    private prepareFastVisibleStage(
        object: THREE.Object3D,
        meshCount: number,
        onProgress?: (p: number, msg: string) => void
    ) {
        if (meshCount < 12000) return false;

        let visibleCount = 0;
        const limit = this.fastPreviewMeshLimit;
        object.traverse((child) => {
            if (!(child as THREE.Mesh).isMesh) return;
            const mesh = child as THREE.Mesh;
            const isVisible = visibleCount < limit;
            mesh.visible = isVisible;
            mesh.userData.fastPreview = isVisible;
            if (isVisible) visibleCount++;
        });

        if (onProgress) {
            onProgress(8, `正在准备快速预览... (${visibleCount} meshes)`);
        }

        if (visibleCount > 0) {
            object.userData.fastPreviewActive = true;
            this.fastPreviewModels.add(object.uuid);
        }

        return visibleCount > 0;
    }

    private attachModelToContentGroup(object: THREE.Object3D, keepVisible = false) {
        const fileGroup = new THREE.Group();
        fileGroup.name = `file_${object.uuid}`;
        fileGroup.userData.originalUuid = object.uuid;
        const modelName = sanitizeFileStem(
            sanitizeDisplayLabel(
                typeof object.userData?.modelName === "string" ? object.userData.modelName : "",
                stripFileExtension(object.name),
                object.name
            ) || "model"
        );
        fileGroup.userData.modelName = modelName;
        object.userData.originalUuid = object.uuid;
        object.userData.modelName = modelName;
        fileGroup.add(object);

        object.visible = keepVisible;
        this.contentGroup.add(fileGroup);
        // 新载入的模型立即套用当前显示样式（真实/着色/线框）
        applyDisplayMode(fileGroup, this.displayMode);
        this.buildDisplayEdgesFor(fileGroup);
        this.markSceneDirty({
            invalidateInteractables: true,
            needsRender: false
        });
    }

    private async prepareModelChunkStage(
        object: THREE.Object3D,
        meshCount: number,
        onProgress?: (p: number, msg: string) => void
    ) {
        if (onProgress) onProgress(10, "正在收集构件...");

        const preferFastCollect = this.resolvedChunkOptions.loadProfile === "max-speed";
        const collectBatchedThreshold = preferFastCollect ? 1200 : this.octreeWorkerThreshold;
        const items = meshCount >= collectBatchedThreshold
            ? await collectItemsBatched(object, {
                batchSize: preferFastCollect ? 5200 : 3000,
                onProgress: (processed, total) => {
                    if (!onProgress || total === 0) return;
                    const ratio = processed / total;
                    onProgress(10 + Math.round(ratio * 10), `正在收集构件... (${processed}/${total})`);
                }
            })
            : collectItems(object);

        if (items.length === 0) return;

        if (onProgress) onProgress(20, `已收集 ${items.length} 个构件，正在计算八叉树...`);
        const bounds = await this.computeItemBoundsProgressively(items, onProgress);

        if (onProgress) onProgress(35, "正在计算八叉树...");

        const maxItemsPerNode = 3000;
        const maxDepth = 6;
        const leafNodes = await this.buildLeafPlans(items, bounds, maxItemsPerNode, maxDepth);

        const ghostSpecs = await this.registerLeafChunksProgressively(object, leafNodes, onProgress);
        this.reportChunkProgress();
        this.checkCullingAndLoad();
        void this.createChunkGhostsProgressively(ghostSpecs);

        const meshesToHideSet = new Set<THREE.Mesh>();
        for (const item of items) {
            const sourceMesh = (item as any).sourceMesh as THREE.Mesh | undefined;
            if (sourceMesh?.isMesh) {
                meshesToHideSet.add(sourceMesh);
            }
        }
        const meshesToHide = meshesToHideSet.size > 0
            ? Array.from(meshesToHideSet)
            : (() => {
                const fallbackMeshes: THREE.Mesh[] = [];
                object.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        fallbackMeshes.push(child as THREE.Mesh);
                    }
                });
                return fallbackMeshes;
            })();

        for (let i = 0; i < meshesToHide.length; i++) {
            const child = meshesToHide[i];
            if (object.userData.fastPreviewActive && child.userData.fastPreview) {
                continue;
            }
            child.visible = false;
            child.userData.isOptimized = true;
            if (i > 0 && i % 6000 === 0) {
                await this.yieldToMainThread();
            }
        }

        if (onProgress) onProgress(95, "分块准备完成");
    }

    private finalizeModelStage(previewGhost: THREE.Object3D | null, onProgress?: (p: number, msg: string) => void) {
        this.sceneBounds = this.computeTotalBounds(false);
        this.precomputedBounds = this.sceneBounds.clone();
        if (this.globalOffset.length() > 0) {
            this.precomputedBounds.translate(this.globalOffset);
        }

        this.updateSettings(this.settings);
        if (onProgress) onProgress(100, "模型已加入加载队列");
        this.checkCullingAndLoad();

        if (!previewGhost) return;
        this.ghostGroup.remove(previewGhost);
        this.releaseGhostLine(previewGhost as THREE.LineSegments);
        this.markSceneDirty();
    }

    private cancelDeferredStructureBuild() {
        if (this.deferredStructureTimer) {
            clearTimeout(this.deferredStructureTimer);
            this.deferredStructureTimer = null;
        }
        this.deferredStructureToken++;
    }

    beginLoadGeneration() {
        this.loadGeneration += 1;
        return this.loadGeneration;
    }

    isLoadGenerationCurrent(generation: number) {
        return generation === this.loadGeneration;
    }

    private deactivateFastPreviewForModel(originalUuid: string) {
        if (!this.fastPreviewModels.has(originalUuid)) return;
        this.fastPreviewModels.delete(originalUuid);
        const fileGroup = this.contentGroup.getObjectByName(`file_${originalUuid}`);
        if (!fileGroup) return;

        fileGroup.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                child.visible = false;
                if (child.userData.fastPreview) delete child.userData.fastPreview;
            }
            if (child.userData?.fastPreviewActive) {
                child.userData.fastPreviewActive = false;
            }
        });
    }

    private scheduleDeferredStructureReplacement(
        object: THREE.Object3D,
        shouldDeferStructure: boolean,
        deferredPlaceholderId: string | null
    ) {
        if (shouldDeferStructure && deferredPlaceholderId) {
            this.cancelDeferredStructureBuild();
            const token = this.deferredStructureToken;
            this.deferredStructureTimer = setTimeout(() => {
                try {
                    if (token !== this.deferredStructureToken) return;
                    const modelRoot = this.buildAndRegisterModelStructure(object);
                    this.replaceStructureNode(deferredPlaceholderId!, modelRoot);
                    if (this.onStructureUpdate) this.onStructureUpdate();
                    this.markSceneDirty({
                        invalidateInteractables: true,
                        needsBoundsUpdate: true,
                        needsCulling: true
                    });
                } catch (error) {
                    console.warn("延迟构建结构树失败:", error);
                }
            }, 80);
            return;
        }

        if (this.onStructureUpdate) {
            this.onStructureUpdate();
        }
    }

    async addModel(object: THREE.Object3D, onProgress?: (p: number, msg: string) => void) {
        object.updateMatrixWorld(true);

        const modelBox = this.applyGlobalOffsetForModel(object);
        const objectOverview = this.collectObjectOverview(object);
        const meshCount = objectOverview.meshes;
        this.configureModelWarmup(meshCount);
        this.registerOriginalStats(object.uuid, objectOverview);
        this.applyModelChunkBudget();

        const { shouldDeferStructure, deferredPlaceholderId } = this.prepareStructureStage(object, meshCount, onProgress);
        const previewGhost = this.prepareModelBoundsStage(object, modelBox);
        const quickVisibleEnabled = this.prepareFastVisibleStage(object, meshCount, onProgress);

        await this.prepareModelRuntimeStage(object, meshCount);
        this.attachModelToContentGroup(object, quickVisibleEnabled);
        this.markSceneDirty({
            invalidateInteractables: true,
            needsBoundsUpdate: true,
            needsCulling: true
        });
        await this.prepareModelChunkStage(object, meshCount, onProgress);
        this.markSceneDirty({
            invalidateInteractables: true,
            needsBoundsUpdate: true,
            needsCulling: true
        });
        this.finalizeModelStage(previewGhost, onProgress);
        this.scheduleDeferredStructureReplacement(object, shouldDeferStructure, deferredPlaceholderId);
        this.scheduleSearchPropertyIndexRebuild(object, onProgress);
        this.markSceneDirty({
            invalidateInteractables: true,
            needsBoundsUpdate: true,
            needsCulling: true
        });
    }

    removeObject(uuid: string) {
        this.cancelDeferredStructureBuild();
        const nodes = this.nodeMap.get(uuid);
        // 尝试获取该节点所属的原始模型 UUID (用于 NBIM 分块匹配)
        const originalUuid = nodes?.[0]?.userData?.originalUuid || uuid;
        // 同一个 NBIM 可以被打开多次，originalUuid 相同。loadId 区分“这一次加载”。
        const loadId = nodes?.[0]?.userData?.loadId ? String(nodes[0].userData.loadId) : "";

        // 1. 彻底移除相关的优化组 (针对 NBIM / 实例化分块)
        // 注意：可能有多个优化组（对应不同的分块）
        const optimizedGroupsToRemove: THREE.Object3D[] = [];
        this.contentGroup.traverse(child => {
            // 匹配逻辑：名字匹配，或者 userData 里的原始 UUID 匹配。
            // 同一个 NBIM 可能被打开多次（originalUuid 相同），此时必须按本次加载的
            // 优化组名（optimized_${唯一 rootId}）精确匹配，否则会把另一份一起删掉。
            const isMatch = loadId
                ? (child.userData?.loadId === loadId
                    && (child.userData?.isOptimizedGroup === true
                        || child.name.startsWith('optimized_')
                        || child.name.startsWith('file_')))
                : (child.name === `optimized_${uuid}`) ||
                    (child.name === `file_${uuid}`) ||
                    (child.userData.originalUuid === uuid) ||
                    (child.userData.originalUuid === originalUuid) ||
                    (child.name.startsWith('optimized_') && (child.userData.originalUuid === uuid || child.userData.originalUuid === originalUuid)) ||
                    (child.name.startsWith('file_') && (child.userData.originalUuid === uuid || child.userData.originalUuid === originalUuid));

            if (isMatch) {
                optimizedGroupsToRemove.push(child);
            }
        });

        optimizedGroupsToRemove.forEach(group => {
            group.traverse(child => {
                if ((child as any).isBatchedMesh) {
                    const bm = child as THREE.BatchedMesh;
                    // 必须先解除 optimizedMapping 引用，否则删除后这些映射仍持有
                    // BatchedMesh 及其 batchIdToGeometry（几 MB / 块），堆内存不会下降。
                    this.unregisterOptimizedMeshMapping(bm);
                    this.disposeChunkMesh(bm);
                }
            });
            group.removeFromParent();
        });

        // 2. 从 contentGroup 中找到原始对象并递归清理
        const obj = this.contentGroup.getObjectByProperty("uuid", uuid);
        // 注意：node 已经在函数开头定义过了

        const processRemoval = (o: THREE.Object3D | StructureTreeNode) => {
            const id = (o instanceof THREE.Object3D) ? o.uuid : (o as StructureTreeNode).id;

            // 处理 BatchedMesh 实例移除（通过隐藏实现）
            const mappings = this.optimizedMapping.get(id);
            if (mappings) {
                mappings.forEach(m => {
                    m.mesh.setVisibleAt(m.instanceId, false);
                });
                this.optimizedMapping.delete(id);
            }

            // 如果是 Mesh，释放资源
            if ((o as THREE.Mesh).isMesh) {
                const mesh = o as THREE.Mesh;
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) {
                    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    materials.forEach(m => m.dispose());
                }
            } else if ((o as any).isBatchedMesh) {
                const bm = o as any;
                this.unregisterOptimizedMeshMapping(bm);
                this.disposeChunkMesh(bm);
            }

            // 清理相关的组件映射
            this.componentMap.delete(id);
            if (o instanceof THREE.Object3D && o.userData.expressID !== undefined) {
                this.componentMap.delete(o.userData.expressID);
            }
            const nodeInfos = this.nodeMap.get(id);
            if (nodeInfos) {
                nodeInfos.forEach(nodeInfo => {
                    if (nodeInfo.bimId !== undefined) {
                        this.componentMap.delete(nodeInfo.bimId);
                    }
                });
            }

            this.nodeMap.delete(id);
        };

        if (obj) {
            obj.traverse(processRemoval);
            obj.removeFromParent();
        } else if (nodes && nodes.length > 0) {
            const traverseNode = (n: StructureTreeNode) => {
                processRemoval(n);
                if (n.children) n.children.forEach(traverseNode);
            };
            traverseNode(nodes[0]);
        }
        this.markSceneDirty({
            invalidateInteractables: true,
            needsRender: false
        });
        if (loadId) {
            this.unregisterOriginalStats(loadId);
        } else {
            this.unregisterOriginalStats(originalUuid);
            this.unregisterOriginalStats(uuid);
        }
        this.fastPreviewModels.delete(uuid);
        this.fastPreviewModels.delete(originalUuid);
        this.clearChunkCache((chunkId, mesh) => {
            if (loadId) return mesh.userData.loadId === loadId;
            const owner = (mesh.userData.originalUuid || "") as string;
            return owner === uuid || owner === originalUuid || chunkId.startsWith(uuid) || chunkId.startsWith(originalUuid);
        });
        if (loadId) {
            this.nbimFiles.delete(loadId);
            this.nbimMeta.delete(loadId);
            // 原始分块二进制读取缓存同样按 loadId 前缀清理，否则大模型删除后
            // 仍有上百个 ~2MB 的 ArrayBuffer 挂在 chunkReadCache 里。
            for (const key of [...this.chunkReadCache.keys()]) {
                if (key.startsWith(`${loadId}:`)) this.chunkReadCache.delete(key);
            }
            this.chunkReadCacheOrder = this.chunkReadCacheOrder.filter((id) => this.chunkReadCache.has(id));
            this.prefetchQueue = this.prefetchQueue.filter((id) => !String(id).startsWith(`${loadId}::`));
            this.prefetchQueueSet = new Set(this.prefetchQueue);

            // 属性文档同样按 owner（原模型 uuid）回收，避免删除大模型后
            // 几万条属性行长期占用堆。若同一 uuid 还有别的加载实例在用，则保留。
            const owner = originalUuid;
            const ownerStillLoaded = this.chunks.some((c) => c.originalUuid === owner);
            if (!ownerStillLoaded) {
                this.nbimPropsByOriginalUuid.delete(owner);
                if (this.nbimPendingDocs) {
                    for (const key of Object.keys(this.nbimPendingDocs)) {
                        if (key.startsWith(`${owner}::`)) delete this.nbimPendingDocs[key];
                    }
                    this.nbimPendingDocsList = null;
                }
                for (const [key, doc] of this.nbimSearchDocsByUuid) {
                    if (doc?.owner === owner) this.nbimSearchDocsByUuid.delete(key);
                }
                for (const [key, doc] of this.nbimSearchDocsByBimId) {
                    if (doc?.owner === owner) this.nbimSearchDocsByBimId.delete(key);
                }
                if (this.nbimAllSearchDocs.length > 0) {
                    this.nbimAllSearchDocs = this.nbimAllSearchDocs.filter((doc) => doc?.owner !== owner);
                    this.nbimDocIndexByUuid.clear();
                    this.nbimAllSearchDocs.forEach((doc, index) => this.nbimDocIndexByUuid.set(doc.uuid, index));
                }
            }
        }

        if (this.currentMeasureModelUuid === uuid || this.currentMeasureModelUuid === originalUuid) {
            this.currentMeasureModelUuid = null;
        }

        // 3. 移除关联的分块和鬼影
        let removedLoadedChunks = 0;
        this.chunks = this.chunks.filter(c => {
            const isMatch = loadId
                ? c.nbimFileId === loadId
                : (c.originalUuid === uuid || c.originalUuid === originalUuid || c.id.startsWith(uuid));
            if (isMatch) {
                // 已加载的分块被移除时必须同步递减计数，否则状态栏会出现 CH 256/227 这种
                // “已加载数大于总数”的错误，并且分块进度永远判不到 100%。
                if (c.loaded) removedLoadedChunks++;
                this.cancelledChunkIds.add(c.id);
                this.processingChunks.delete(c.id);
                const ghost = this.ghostGroup.getObjectByName(`ghost_${c.id}`);
                if (ghost) {
                    this.ghostGroup.remove(ghost);
                    this.releaseGhostLine(ghost as THREE.LineSegments);
                }
                return false;
            }
            return true;
        });
        this.rebuildChunkIdSet();
        if (removedLoadedChunks > 0) {
            this.chunkLoadedCount = Math.max(0, this.chunkLoadedCount - removedLoadedChunks);
        }
        this.reportChunkProgress();

        // 拾取列表里仍然引用着刚被删除的 BatchedMesh；不主动清空的话这些 mesh
        // （以及它们内部的几何缓冲）会一直被数组引用，堆内存不下降。
        this.interactableList = [];
        this.interactableListValid = false;
        const stillAttached = (mesh: any) => !!mesh && !!mesh.parent;
        for (const [key, value] of this.locateDimmedInstances) {
            if (!stillAttached(value.mesh)) this.locateDimmedInstances.delete(key);
        }
        for (const [key, value] of this.clashPairInstanceColorCache) {
            if (!stillAttached(value.mesh)) this.clashPairInstanceColorCache.delete(key);
        }

        // 清理已删除节点的 bimId → 结构节点索引，否则大模型的 23 万条字符串索引会长期残留。
        for (const [key, ids] of this.bimIdToNodeIds) {
            const kept = ids.filter((id) => this.nodeMap.has(id));
            if (kept.length === 0) {
                this.bimIdToNodeIds.delete(key);
            } else if (kept.length !== ids.length) {
                this.bimIdToNodeIds.set(key, kept);
            }
        }

        // 4. 从结构树中彻底移除该节点
        if (this.structureRoot) {
            const filterNodes = (nodes: StructureTreeNode[]): StructureTreeNode[] => {
                return nodes.filter(n => {
                    if (n.id === uuid) return false;
                    if (!this.nodeMap.has(n.id) && n.id !== 'root') return false;
                    if (n.children) {
                        n.children = filterNodes(n.children);
                    }
                    return true;
                });
            };

            if (this.structureRoot.id === uuid) {
                this.structureRoot = { id: 'root', name: 'Root', type: 'Group', children: [] };
            } else if (this.structureRoot.children) {
                this.structureRoot.children = filterNodes(this.structureRoot.children);
            }
        }

        // 5. 重新计算包围盒并更新场景
        // 必须 forceRecompute：computeTotalBounds() 默认返回缓存的 precomputedBounds，
        // 删除模型后缓存里还包含被删对象的范围，会导致“充满”仍按旧范围取景。
        this.precomputedBounds = this.computeTotalBounds(false, true);
        if (this.precomputedBounds.isEmpty()) {
            this.contentGroup.traverse(child => {
                if ((child as any).isMesh && child.visible) {
                    const box = new THREE.Box3().setFromObject(child);
                    if (!box.isEmpty()) this.precomputedBounds.union(box);
                }
            });
        }

        this.updateSceneBounds();
        // 模型被删除后内存预算要按剩余分块重算，否则上限仍按删除前的大小限制，
        // 会导致剩下的模型明明装得下却只加载一部分。
        this.recomputeChunkBudgetFromResident();
        if (this.onStructureUpdate) this.onStructureUpdate();
        this.markSceneDirty({
            invalidateInteractables: true,
            needsBoundsUpdate: true,
            needsCulling: true
        });

        // 6. 删除关联的测量记录
        this.measureRecords.forEach((record, recordId) => {
            // 如果测量的关联模型是当前删除的对象，或者其子对象，则删除测量
            let isRelated = record.modelUuid === uuid || record.modelUuid === originalUuid;

            if (!isRelated && record.modelUuid && obj) {
                // 检查关联模型是否是正在删除对象的子孙
                obj.traverse(child => {
                    if (child.uuid === record.modelUuid) {
                        isRelated = true;
                    }
                });
            }

            if (isRelated) {
                this.removeMeasurement(recordId);
            }
        });

        return true;
    }

    /**
     * 用当前剩余分块重算驻留预算（删除模型 / 关闭部分模型后调用）。
     * 与 applyNbimScaleTuning 的区别是：这里不需要 manifest，直接按剩余分块的平均解码内存推算。
     */
    private recomputeChunkBudgetFromResident() {
        const chunkCount = this.chunks.length;
        if (chunkCount === 0) {
            this.maxLoadedChunks = 512;
            this.shadedMaxLoadedChunks = 0;
            this.maxCachedChunks = 48;
            this.chunkResidentBudgetMB = 0;
            this.allowFullChunkLoad = false;
            this.fitsAllChunks = false;
            return;
        }

        const totalDecodedMB = this.chunks.reduce((sum, chunk) => {
            const value = Number(chunk?.estimatedDecodedMB);
            return sum + (Number.isFinite(value) && value > 0 ? value : 1.5);
        }, 0);
        const perChunkFootprintMB = Math.max(0.35, totalDecodedMB / chunkCount);

        const perfMemory = (performance as any)?.memory;
        const heapLimitMB = perfMemory?.jsHeapSizeLimit
            ? perfMemory.jsHeapSizeLimit / 1048576
            : Math.max(1536, ((navigator as any)?.deviceMemory || 8) * 512);
        let baseUsedMB = perfMemory?.usedJSHeapSize
            ? Math.max(0, perfMemory.usedJSHeapSize / 1048576 - this.getResidentChunkMB())
            : 0;
        // 上一次重模型遗留的未回收垃圾会把 usedJSHeapSize 抬到几 GB，
        // 按它算预算会把常驻上限压到只剩几十块；超过 60% 堆上限就视为脏数据。
        if (baseUsedMB > heapLimitMB * 0.6) baseUsedMB = 650;
        this.lastBaseUsedMB = baseUsedMB > 0 ? baseUsedMB : 650;
        const usableBudgetMB = baseUsedMB > 0 ? heapLimitMB * 0.80 - baseUsedMB : heapLimitMB * 0.5;
        const geometryBudgetMB = Math.min(3200, Math.max(384, usableBudgetMB));

        const fitsAll = totalDecodedMB <= geometryBudgetMB;
        this.fitsAllChunks = fitsAll;
        this.maxLoadedChunks = fitsAll
            ? chunkCount
            : Math.max(48, Math.min(chunkCount, Math.floor(geometryBudgetMB / perChunkFootprintMB)));
        this.shadedMaxLoadedChunks = this.maxLoadedChunks;
        this.maxCachedChunks = Math.max(8, Math.min(128, Math.floor(this.maxLoadedChunks / 4)));
        this.chunkResidentBudgetMB = geometryBudgetMB;
        this.allowFullChunkLoad = true;
    }

    async removeModel(uuid: string) {
        return this.removeObject(uuid);
    }

    // --- NBIM 导入/导出功能 ---
    private generateChunkBinaryV8(items: any[], bimIdToIndex: Map<string, number>): ArrayBuffer {
        const uniqueGeos: THREE.BufferGeometry[] = [];
        const geoMap = new Map<THREE.BufferGeometry, number>();

        items.forEach(item => {
            if (item.geometry && !geoMap.has(item.geometry)) {
                geoMap.set(item.geometry, uniqueGeos.length);
                uniqueGeos.push(item.geometry);
            }
        });

        let size = 4;
        for (const geo of uniqueGeos) {
            const vertCount = geo.attributes.position.count;
            const index = geo.index;
            const indexCount = index ? index.count : 0;
            size += 4 + 4 + (vertCount * 12) + (vertCount * 12);
            if (indexCount > 0) size += indexCount * 4;
        }

        size += 4;
        size += items.length * (4 + 4 + 4 + 64 + 4);

        const buffer = new ArrayBuffer(size);
        const dv = new DataView(buffer);
        let offset = 0;

        dv.setUint32(offset, uniqueGeos.length, true); offset += 4;
        for (const geo of uniqueGeos) {
            const pos = geo.getAttribute('position');
            const norm = geo.getAttribute('normal');
            const count = pos.count;
            const index = geo.index;
            const indexCount = index ? index.count : 0;

            dv.setUint32(offset, count, true); offset += 4;
            dv.setUint32(offset, indexCount, true); offset += 4;

            for (let i = 0; i < count; i++) {
                dv.setFloat32(offset, pos.getX(i), true); offset += 4;
                dv.setFloat32(offset, pos.getY(i), true); offset += 4;
                dv.setFloat32(offset, pos.getZ(i), true); offset += 4;
            }
            for (let i = 0; i < count; i++) {
                dv.setFloat32(offset, norm.getX(i), true); offset += 4;
                dv.setFloat32(offset, norm.getY(i), true); offset += 4;
                dv.setFloat32(offset, norm.getZ(i), true); offset += 4;
            }
            if (index && indexCount > 0) {
                for (let i = 0; i < indexCount; i++) {
                    dv.setUint32(offset, index.getX(i), true); offset += 4;
                }
            }
        }

        dv.setUint32(offset, items.length, true); offset += 4;
        for (const item of items) {
            const treeNodes = this.nodeMap.get(item.uuid);
            const firstNode = treeNodes?.[0];
            const bimId = item.bimId || firstNode?.bimId || firstNode?.id || item.uuid;
            const bimIdIndex = bimIdToIndex.get(bimId) ?? 0;
            dv.setUint32(offset, bimIdIndex, true); offset += 4;
            const typeIndex = typeof item.typeIndex === "number" ? item.typeIndex : 0;
            dv.setUint32(offset, typeIndex, true); offset += 4;
            dv.setUint32(offset, item.color, true); offset += 4;

            const elements = item.matrix.elements;
            for (let k = 0; k < 16; k++) {
                dv.setFloat32(offset, elements[k], true); offset += 4;
            }

            const geoId = geoMap.get(item.geometry) || 0;
            dv.setUint32(offset, geoId, true); offset += 4;
        }

        return buffer;
    }

    private registerPropertyDocuments(options: {
        docs: Record<string, NbimPropertyDocument>;
        propertyNameIndex?: NbimPropertyNameIndexItem[];
        rootId?: string;
        preferNodeMapping?: boolean;
    }) {
        const docs = options.docs;
        const changedDocs = this.applyPropertyDocumentEntries(Object.keys(docs || {}), docs, options);
        const changedIndex = this.applyPropertyNameIndex(options.propertyNameIndex);
        if (changedDocs || changedIndex) this.nbimPropertyNameIndexVersion++;
    }

    private applyPropertyDocumentEntries(
        keys: string[],
        docs: Record<string, NbimPropertyDocument>,
        options: { rootId?: string; preferNodeMapping?: boolean }
    ) {
        const { rootId, preferNodeMapping = false } = options;

        for (const key of keys) {
            const doc = docs[key];
            if (!doc || !Array.isArray(doc.rows)) continue;
            const separatorIndex = key.indexOf("::");
            const owner = doc.owner || (separatorIndex > 0 ? key.slice(0, separatorIndex) : rootId || "");
            const bimId = doc.bimId || (separatorIndex > 0 ? key.slice(separatorIndex + 2) : "");
            // NBIM 导出的文档 uuid 本身就是结构节点 id；只有缺失时才查一次 bimId → 节点映射，
            // 避免对 20 万+ 文档逐个拼接并查找 `${owner}::${bimId}`。
            let uuid = doc.uuid || "";
            if (!uuid && preferNodeMapping && owner && bimId) {
                const nodeIds = this.bimIdToNodeIds.get(`${owner}::${bimId}`) || [];
                if (nodeIds.length > 0) uuid = nodeIds[0];
            }

            // 直接就地规范化，避免为每个文档再复制一份对象（大模型可达 20 万+ 文档）。
            doc.owner = owner;
            doc.bimId = String(bimId || "");
            doc.uuid = String(uuid || bimId || key);
            doc.name = String(doc.name || "");

            // 只保留 uuid 与 bimId 两种查找键，且每个文档只进入 all 数组一次。
            const existingIndex = this.nbimDocIndexByUuid.get(doc.uuid);
            if (existingIndex === undefined) {
                this.nbimDocIndexByUuid.set(doc.uuid, this.nbimAllSearchDocs.length);
                this.nbimAllSearchDocs.push(doc);
            } else {
                this.nbimAllSearchDocs[existingIndex] = doc;
            }
            this.nbimSearchDocsByUuid.set(doc.uuid, doc);
            if (doc.bimId && doc.bimId !== doc.uuid) {
                this.nbimSearchDocsByBimId.set(doc.bimId, doc);
            }
        }

        return keys.length > 0;
    }

    private applyPropertyNameIndex(items?: NbimPropertyNameIndexItem[]) {
        let changed = false;
        (items || []).forEach((item) => {
            if (!item?.path) return;
            const old = this.nbimPropertyNameIndex.get(item.path);
            this.nbimPropertyNameIndex.set(item.path, {
                ...item,
                count: (old?.count || 0) + (item.count || 0)
            });
            changed = true;
        });
        return changed;
    }

    /** 真正需要全量属性（搜索第一页/导出）时，取挂起文档的数组视图，不建立额外索引。 */
    private getPendingPropertyDocuments(): NbimPropertyDocument[] {
        if (!this.nbimPendingDocs) return this.nbimAllSearchDocs;
        if (!this.nbimPendingDocsList) {
            this.nbimPendingDocsList = Object.values(this.nbimPendingDocs);
        }
        return this.nbimPendingDocsList;
    }

    private async rebuildSearchPropertyIndexForObject(object: THREE.Object3D, onProgress?: (p: number, msg: string) => void) {
        if (!object?.userData?.isIFC) return;

        const quickIndex = collectIfcObjectBasicPropertyIndex(object);
        if (Object.keys(quickIndex.bimPropertyDocs).length > 0) {
            this.registerPropertyDocuments({
                docs: quickIndex.bimPropertyDocs,
                propertyNameIndex: quickIndex.propertyNameIndex,
                rootId: object.uuid
            });
        }

        const metadataReady = object.userData?.ifcMetadataReady;
        if (metadataReady && typeof metadataReady.then === "function") {
            if (onProgress) onProgress(95, "正在完成 IFC 属性资源解析...");
            await metadataReady;
        }

        const refs = collectIfcModelReferences(this.contentGroup);
        if (!refs.ifcManagerByModel.has(object.uuid) && !refs.ifcApiByModel.has(object.uuid)) return;

        if (onProgress) onProgress(96, "正在建立属性索引...");
        const { bimProperties, bimPropertyDocs, propertyNameIndex } = await collectIfcObjectPropertyIndex({
            object,
            ifcApiByModel: refs.ifcApiByModel,
            ifcManagerByModel: refs.ifcManagerByModel,
            onProgress: (processed, total) => {
                if (!onProgress || total <= 0) return;
                const p = 96 + Math.floor((processed / total) * 3);
                onProgress(Math.min(99, p), `正在建立属性索引... (${processed}/${total})`);
            }
        });

        this.nbimPropsByOriginalUuid.set(object.uuid, bimProperties);
        this.registerPropertyDocuments({
            docs: bimPropertyDocs,
            propertyNameIndex,
            rootId: object.uuid
        });
    }


    private scheduleSearchPropertyIndexRebuild(object: THREE.Object3D, onProgress?: (p: number, msg: string) => void) {
        if (!object?.userData?.isIFC) return;
        const generation = this.loadGeneration;
        window.setTimeout(() => {
            void this.rebuildSearchPropertyIndexForObject(object, undefined).then(() => {
                if (generation !== this.loadGeneration) return;
                this.markSceneDirty({ invalidateInteractables: false, needsBoundsUpdate: false, needsCulling: false });
            }).catch((error) => {
                console.warn("IFC 属性索引后台构建失败:", error);
            });
        }, 0);
        if (onProgress) onProgress(100, "模型已加载，属性索引将在后台构建...");
    }

    private buildExportPropertyDocsFromCache() {
        const docs: Record<string, NbimPropertyDocument> = {};
        const sourceDocs = this.nbimPendingDocs
            ? this.getPendingPropertyDocuments()
            : this.nbimAllSearchDocs;
        for (const doc of sourceDocs) {
            if (!doc || !Array.isArray(doc.rows)) continue;
            const owner = String(doc.owner || "");
            const bimId = String(doc.bimId || "");
            if (!owner || !bimId) continue;
            const key = `${owner}::${bimId}`;
            if (docs[key]) continue;
            docs[key] = doc;
        }
        return {
            bimPropertyDocs: docs,
            propertyNameIndex: buildPropertyNameIndex(docs)
        };
    }

    async exportNbim(fileName?: string) {
        if (this.chunks.length === 0) throw new Error("无模型数据可导出");

        const bimIdTable: string[] = [""];
        const bimIdToIndex = new Map<string, number>();
        const addBimId = (bimId?: string) => {
            if (!bimId) return;
            if (bimIdToIndex.has(bimId)) return;
            const idx = bimIdTable.length;
            bimIdTable.push(bimId);
            bimIdToIndex.set(bimId, idx);
        };
        const traverseBimIds = (node: StructureTreeNode) => {
            addBimId(node.bimId);
            if (node.children) node.children.forEach(traverseBimIds);
        };
        traverseBimIds(this.structureRoot);

        let { bimPropertyDocs, propertyNameIndex } = this.buildExportPropertyDocsFromCache();
        if (Object.keys(bimPropertyDocs).length === 0) {
            const { ifcApiByModel, ifcManagerByModel } = collectIfcModelReferences(this.contentGroup);
            const collected = await collectNbimBimProperties({
                structureRoot: this.structureRoot,
                ifcApiByModel,
                ifcManagerByModel
            });
            bimPropertyDocs = collected.bimPropertyDocs;
            propertyNameIndex = collected.propertyNameIndex;
        }
        const { chunkBlobs, exportChunks, currentOffset } = await prepareNbimExportChunks({
            chunks: this.chunks,
            nbimFiles: this.nbimFiles,
            nbimMeta: this.nbimMeta,
            bimIdToIndex,
            hasValidChunkBinaryRange: (chunk) => this.hasValidChunkBinaryRange(chunk),
            generateChunkBinaryV8: (items, indexMap) => this.generateChunkBinaryV8(items, indexMap)
        });

        const manifest = {
            globalBounds: {
                min: { x: this.sceneBounds.min.x, y: this.sceneBounds.min.y, z: this.sceneBounds.min.z },
                max: { x: this.sceneBounds.max.x, y: this.sceneBounds.max.y, z: this.sceneBounds.max.z }
            },
            chunks: exportChunks,
            stats: this.originalStats,
            structureTree: buildExportStructureTree(this.structureRoot),
            bimIdTable,
            bimPropertyDocs,
            propertyNameIndex
        };

        const manifestBytes = encodeNbimManifest(manifest, this.structureRoot);

        const header = new ArrayBuffer(1024);
        const dv = new DataView(header);
        dv.setUint32(0, 0x4D49424E, true); // 文件标识 'NBIM'
        dv.setUint32(4, 8, true);          // 版本 8
        dv.setUint32(8, currentOffset, true);
        dv.setUint32(12, manifestBytes.byteLength, true);

        const blobParts: any[] = [header, ...chunkBlobs, manifestBytes];
        const finalBlob = new Blob(blobParts, { type: 'application/octet-stream' });

        const url = URL.createObjectURL(finalBlob);
        const a = document.createElement('a');
        a.href = url;
        const defaultStem = deriveDefaultNbimStem(this.contentGroup);
        const resolvedName = sanitizeFileStem(stripFileExtension((fileName || "").trim()) || defaultStem);
        a.download = `${resolvedName}.nbim`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async loadNbim(file: File, onProgress?: (p: number, msg: string) => void) {
        // 不再自动清空场景，支持多模型
        const fileId = `nbim_${file.name}_${new Date().getTime()}`;

        if (onProgress) onProgress(10, "正在解析 NBIM 文件头...");
        const header = await readNbimHeader(file);
        const magic = header.magic;
        if (magic !== 0x4D49424E) throw new Error("不是有效的 NBIM 文件");

        const version = header.version;
        if (version !== 8 && version !== 9) {
            throw new Error(`不支持的 NBIM 版本: ${version}，当前支持 V8 / V9`);
        }

        if (onProgress) onProgress(20, "正在读取元数据...");
        const manifest = await readNbimManifest(file, header) as NbimManifest;

        const manifestDocs = (manifest?.bimPropertyDocs && typeof manifest.bimPropertyDocs === "object")
            ? manifest.bimPropertyDocs as Record<string, NbimPropertyDocument>
            : null;
        const manifestPropertyNameIndex = Array.isArray(manifest.propertyNameIndex)
            ? manifest.propertyNameIndex as NbimPropertyNameIndexItem[]
            : null;

        this.nbimFiles.set(fileId, file);
        this.nbimMeta.set(fileId, { version, bimIdTable: manifest.bimIdTable });

        const boundsState = applyNbimGlobalBounds({
            globalBounds: manifest.globalBounds,
            precomputedBounds: this.precomputedBounds,
            sceneBounds: this.sceneBounds,
            globalOffset: this.globalOffset
        });
        this.precomputedBounds.copy(boundsState.precomputedBounds);
        this.sceneBounds.copy(boundsState.sceneBounds);
        this.globalOffset.copy(boundsState.globalOffset);
        if (boundsState.initializedOffset) {
            debugLog("SceneManager/NBIM", "初始化全局偏移", this.globalOffset);
        }

        const modelRoot = this.cloneStructureTreeWithUniqueIds(manifest.structureTree, fileId);
        appendNbimStructure({
            structureRoot: this.structureRoot,
            modelRoot
        });

        const rootId = modelRoot?.id || fileId;
        const manifestBimProperties = (manifest?.bimProperties && typeof manifest.bimProperties === "object")
            ? manifest.bimProperties as Record<string, any>
            : {};

        // 新版 NBIM 只带 bimPropertyDocs，旧版只带 bimProperties。defaultOwner 优先从属性键中提取，
        // 确保属性文档能映射到结构节点；两者都缺失时再回退到结构树基础信息。
        const docOwners = collectNbimPropertyOwners(manifestDocs, manifestBimProperties);
        const { defaultOwner: legacyDefaultOwner, grouped } = groupNbimPropertiesByOwner(manifestBimProperties, rootId);
        const defaultOwner = docOwners.size === 1 ? Array.from(docOwners)[0] : legacyDefaultOwner;
        grouped.forEach((props, owner) => this.nbimPropsByOriginalUuid.set(owner, props));

        const {
            docs: propertyDocs,
            propertyNameIndex,
            source: propertySource
        } = resolveNbimPropertyDocuments({
            manifestDocs,
            manifestPropertyNameIndex,
            manifestBimProperties,
            structureTree: modelRoot,
            fallbackOwner: defaultOwner
        });
        if (propertySource !== "manifest") {
            debugLog("SceneManager/NBIM", `属性结构来源: ${propertySource}（已自动兼容旧版 NBIM）`);
        }
        const quickStats = buildNbimQuickStats({
            manifestStats: manifest.stats,
            modelRoot,
            chunks: manifest.chunks
        });
        // 统计按本次加载的 fileId 记账（不再用结构树 rootId）：
        // 同一个 NBIM 打开两次时 rootId 会不同，但删除时需要按 loadId 精确扣减。
        this.registerOriginalStats(fileId, quickStats);

        // 为 NBIM 创建一个容器组
        const fileGroup = createNbimContainerGroup({
            fileName: file.name,
            modelRootName: typeof modelRoot?.name === "string" ? modelRoot.name : "",
            rootId
        });
        fileGroup.userData.loadId = fileId;
        this.contentGroup.add(fileGroup);
        // 新载入的模型立即套用当前显示样式（真实/着色/线框）
        applyDisplayMode(fileGroup, this.displayMode);
        this.buildDisplayEdgesFor(fileGroup);
        this.interactableListValid = false;
        this.markSceneDirty({
            invalidateInteractables: true,
            needsBoundsUpdate: true,
            needsCulling: true
        });

        populateNbimNodeMappings({
            modelRoot,
            defaultOwner,
            nodeMap: this.nodeMap,
            bimIdToNodeIds: this.bimIdToNodeIds
        });

        const propertyDocCount = Object.keys(propertyDocs).length;
        if (propertyDocCount > 20000) {
            // 超大模型：先把属性文档挂起（只应用轻量的属性名索引），避免加载阶段同步索引 20 万+ 文档。
            // 选中构件时按 owner::bimId 取单条；第一次属性搜索/导出时再一次性建索引。
            this.nbimPendingDocs = propertyDocs;
            this.nbimPendingDocsList = null;
            this.nbimPendingRootId = rootId;
            if (this.applyPropertyNameIndex(propertyNameIndex)) {
                this.nbimPropertyNameIndexVersion++;
            }
            debugLog("SceneManager/NBIM", "属性索引延迟建立", { docs: propertyDocCount });
        } else {
            this.registerPropertyDocuments({
                docs: propertyDocs,
                propertyNameIndex,
                rootId,
                preferNodeMapping: true
            });
        }

        // 注册分块
        if (onProgress) onProgress(30, "正在初始化分块...");

        const chunkEntries = Array.isArray(manifest.chunks) ? manifest.chunks : [];
        this.applyNbimScaleTuning(chunkEntries, manifest.stats);
        const immediateGhostLimit = this.resolvedChunkOptions.ghostMode === "all"
            ? Number.MAX_SAFE_INTEGER
            : GHOST_VISIBLE_FIRST_BATCH;
        const { deferredGhostSpecs } = await registerNbimChunks({
            chunkEntries,
            globalOffset: this.globalOffset,
            chunkPadding: this.chunkPadding,
            rootId,
            fileId,
            immediateGhostLimit,
            registrationBatchSize: NBIM_CHUNK_REGISTRATION_BATCH,
            onProgress,
            estimateDecodedMB: (entry: any) => Math.max(
                0.35,
                ((Number(entry?.decodedLength) || Number(entry?.byteLength) || 0) / 1048576) * this.nbimDecodedMBPerRawByte * CHUNK_FOOTPRINT_MULTIPLIER
            ),
            registerChunk: (chunk) => this.registerChunk(chunk),
            createGhostLine: (name, bounds) => this.createGhostLine(name, bounds),
            addGhostLine: (line) => this.ghostGroup.add(line),
            yieldToMainThread: () => this.yieldToMainThread()
        });
        if (deferredGhostSpecs.length > 0) {
            void this.createChunkGhostsProgressively(deferredGhostSpecs);
        }

        this.reportChunkProgress();

        this.fitViewToChunks(true);
        this.markSceneDirty({
            invalidateInteractables: true,
            needsBoundsUpdate: true,
            needsCulling: true
        });
        const loadFinalize = finalizeNbimLoad({
            chunkCount: this.chunks.length,
            hasManifestStats: Boolean(manifest.stats),
            hasManifestChunks: Boolean(manifest.chunks?.length)
        });
        this.chunkWarmupActive = loadFinalize.chunkWarmupActive;
        this.initialChunkLoadTarget = loadFinalize.initialChunkLoadTarget;
        if (onProgress) onProgress(100, "NBIM 已就绪，正在按需加载...");
        this.checkCullingAndLoad();
        this.markSceneDirty({
            invalidateInteractables: true,
            needsBoundsUpdate: true,
            needsCulling: true
        });
        if (loadFinalize.shouldEstimateStats) {
            void this.estimateNbimStats(file, manifest.chunks, version).then((stats) => {
                this.unregisterOriginalStats(fileId);
                this.registerOriginalStats(fileId, stats);
            }).catch((error) => {
                console.warn("NBIM 统计估算失败:", error);
            });
        }
    }

    async clear() {
        this.beginLoadGeneration();
        debugLog("SceneManager", "开始清空场景...");
        this.cancelDeferredStructureBuild();
        this.resetExplode();
        this.clearLocateFocus();
        this.locateIsolationRestoreChanges = [];
        this.locateIsolationActive = false;

        try {
            // 1. 深度清理 contentGroup
            const disposeObject = (obj: THREE.Object3D) => {
                if ((obj as any).isMesh) {
                    const mesh = obj as THREE.Mesh;
                    if (mesh.geometry) mesh.geometry.dispose();
                    if (mesh.material) {
                        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                        materials.forEach(m => m.dispose());
                    }
                } else if ((obj as any).isBatchedMesh) {
                    const bm = obj as THREE.BatchedMesh;
                    if (bm.geometry) bm.geometry.dispose();
                    if (bm.material) {
                        const materials = Array.isArray(bm.material) ? bm.material : [bm.material];
                        materials.forEach(m => m.dispose());
                    }
                }
            };

            this.contentGroup.traverse(disposeObject);

            // 移除所有子节点
            while (this.contentGroup.children.length > 0) {
                this.contentGroup.remove(this.contentGroup.children[0]);
            }
            this.displayEdges.dispose();
            this.displayEdgesBuilt = false;

            // 2. 清理辅助组
            while (this.ghostGroup.children.length > 0) {
                const ghost = this.ghostGroup.children[0];
                this.ghostGroup.remove(ghost);
                this.releaseGhostLine(ghost as THREE.LineSegments);
            }
            this.ghostMeshPool.length = 0;

            this.selectionBox.visible = false;
            this.highlightMesh.visible = false;
            if (this.highlightGlowMesh) this.highlightGlowMesh.visible = false;
            this.highlightedInstance = null;
            this.highlightGlowUntil = 0;

            // 3. 清理测量记录
            this.clearAllMeasurements();

            // 4. 清理状态数据
            this.optimizedMapping.clear();
            this.sceneBounds.makeEmpty();
            this.precomputedBounds.makeEmpty();
            this.nbimFiles.clear();
            this.nbimMeta.clear();
            this.nbimPropsByOriginalUuid.clear();
            this.nbimSearchDocsByUuid.clear();
            this.nbimSearchDocsByBimId.clear();
            this.nbimAllSearchDocs = [];
            this.nbimDocIndexByUuid.clear();
            this.nbimPendingDocs = null;
            this.nbimPendingDocsList = null;
            this.nbimPendingRootId = "";
            this.nbimPropertyNameIndex.clear();
            this.nbimPropertyNameIndexVersion++;
            this.structureRoot = { id: 'root', name: 'Root', type: 'Group', children: [] };
            this.nodeMap.clear();
            this.bimIdToNodeIds.clear();
            this.chunks = [];
            this.chunkIdSet.clear();
            this.chunkById.clear();
            this.chunkIndexById.clear();
            this.lastReportedProgress = { loaded: -1, total: -1, pending: -1 };
            this.processingChunks.clear();
            this.cancelledChunkIds.clear();
            this.prefetchQueue = [];
            this.prefetchQueueSet.clear();
            this.prefetchInFlight.clear();
            this.chunkLoadedCount = 0;
            this.reportChunkProgress(); // 通知前端分片进度已重置
            this.componentMap.clear();
            this.clearChunkCache();
            this.chunkReadCache.clear();
            this.chunkReadCacheOrder = [];
            this.originalStats = { meshes: 0, faces: 0, memory: 0 };
            this.originalStatsByModel.clear();
            this.fastPreviewModels.clear();
            this.chunkLoadingEnabled = true;
            this.contentGroup.visible = true;
            this.ghostGroup.visible = true;
            this.chunkWarmupActive = false;
            this.allowFullChunkLoad = false;
            this.chunkLoadPlanPending = false;
            this.nbimDecodedMBPerRawByte = 1;

            // 6. 重置全局偏移
            this.globalOffset.set(0, 0, 0);

            debugLog("SceneManager", "场景已清空");
            this.markSceneDirty();
        } catch (error) {
            console.error("清空场景失败:", error);
            throw error;
        }
    }

    getStructureNodes(id: string): StructureTreeNode[] | undefined {
        return this.nodeMap.get(id);
    }

    getBimIdByUuid(uuid: string): string | null {
        return resolveBimIdByUuid({
            uuid,
            nodeMap: this.nodeMap,
            bimIdToNodeIds: this.bimIdToNodeIds
        });
    }


    resolveNodeUuidByBimId(bimId: string): string | null {
        return resolveSceneNodeUuidByBimId(bimId, this.bimIdToNodeIds);
    }

    resolveSelectionUuid(rawUuid: string): string {
        return resolveSceneSelectionUuid(rawUuid, this.nodeMap, this.bimIdToNodeIds);
    }

    private resolveNbimNode(id: string): StructureTreeNode | null {
        return resolveNbimNode(id, this.nodeMap);
    }

    getNbimProperties(id: string): any | null {
        return resolveNbimFlatProperties({
            id,
            nodeMap: this.nodeMap,
            nbimPropsByOriginalUuid: this.nbimPropsByOriginalUuid
        });
    }

    getNbimIfcPropertyGroups(id: string, mode: "raw" | "normalized" = "raw"): Record<string, PropertyGroupInput> | null {
        return resolveNbimIfcPropertyGroups({
            id,
            nodeMap: this.nodeMap,
            nbimPropsByOriginalUuid: this.nbimPropsByOriginalUuid
        }, mode);
    }

    getNbimPropertyNameIndex(): NbimPropertyNameIndexItem[] {
        return Array.from(this.nbimPropertyNameIndex.values()).sort((a, b) => a.path.localeCompare(b.path, "zh-Hans-CN"));
    }

    getNbimPropertyNameIndexVersion(): number {
        return this.nbimPropertyNameIndexVersion;
    }

    private structureLabelCache = new Map<string, string>();

    /**
     * 结构树显示名：优先使用有语义的名称（名称/型号/类型），
     * 避免整棵树都显示 “Node_1234” 这种导出器生成的占位序号；
     * 占位名回退到 BIM_ID / ExpressID（`#126`），再不行用短 uuid。
     */
    resolveStructureNodeLabel(node: any): string {
        const cacheKey = String(node?.id ?? node?.uuid ?? "");
        if (cacheKey) {
            const cached = this.structureLabelCache.get(cacheKey);
            if (cached) return cached;
        }

        const isPlaceholder = (value: unknown) => {
            const text = String(value ?? "").trim();
            if (!text) return true;
            if (/^(node|mesh|group|object|instance|element|part|solid|component)[-_ ]?\d*$/i.test(text)) return true;
            return /^(mesh|group|object|instance|element|component)$/i.test(text);
        };

        let label = String(node?.name ?? "").trim();
        if (isPlaceholder(label)) {
            label = "";
            const uuid = String(node?.uuid ?? node?.id ?? "");
            const doc = uuid ? this.getNbimPropertySearchDocument(uuid) : null;
            if (doc && !isPlaceholder(doc.name)) {
                label = String(doc.name).trim();
            }
            if (!label && Array.isArray(doc?.rows)) {
                const preferred = ["名称", "型号", "类型", "类别", "Name", "Type", "Category"];
                for (const key of preferred) {
                    const row = doc.rows.find((item: any) => item?.key === key
                        || (typeof item?.path === "string" && item.path.endsWith(`.${key}`)));
                    if (row && !isPlaceholder(row.value)) {
                        label = String(row.value).trim();
                        break;
                    }
                }
            }
        }

        if (!label) {
            const bimId = node?.bimId ?? node?.userData?.expressID ?? node?.userData?.bimId;
            if (bimId !== undefined && bimId !== null && String(bimId).trim() !== "") {
                label = `#${bimId}`;
            } else if (node?.uuid) {
                label = `#${String(node.uuid).slice(0, 8)}`;
            } else {
                label = "未命名";
            }
        }

        if (cacheKey) {
            if (this.structureLabelCache.size > 20000) this.structureLabelCache.clear();
            this.structureLabelCache.set(cacheKey, label);
        }
        return label;
    }

    getNbimPropertySearchDocument(uuid: string): NbimPropertyDocument | null {
        if (!uuid) return null;
        const direct = this.nbimSearchDocsByUuid.get(uuid);
        if (direct) return direct;
        const resolved = this.resolveSelectionUuid(uuid);
        if (resolved && resolved !== uuid) {
            const byResolved = this.nbimSearchDocsByUuid.get(resolved);
            if (byResolved) return byResolved;
        }
        const bimId = this.getBimIdByUuid(uuid);
        if (bimId) {
            const byId = this.nbimSearchDocsByUuid.get(bimId) || this.nbimSearchDocsByBimId.get(bimId);
            if (byId) return byId;
        }

        // 大模型属性索引可能尚未建立：按结构节点的 owner::bimId 直接取挂起的文档，只索引当前这一条。
        if (this.nbimPendingDocs) {
            const node = this.nodeMap.get(uuid)?.[0] || (bimId ? this.nodeMap.get(String(bimId))?.[0] : undefined);
            if (node?.bimId) {
                const owner = node.userData?.originalUuid ? String(node.userData.originalUuid) : this.nbimPendingRootId;
                const key = `${owner}::${node.bimId}`;
                const doc = this.nbimPendingDocs[key];
                if (doc) {
                    this.applyPropertyDocumentEntries([key], this.nbimPendingDocs, {
                        rootId: this.nbimPendingRootId,
                        preferNodeMapping: true
                    });
                    return doc;
                }
            }
        }
        return null;
    }

    getAllNbimPropertySearchDocuments(): NbimPropertyDocument[] {
        return this.getPendingPropertyDocuments();
    }

    hasRenderableTarget(uuid: string): boolean {
        if (!uuid) return false;
        return this.collectRenderableTargets([uuid]).length > 0;
    }

    private getVisibilityContext() {
        return {
            scene: this.scene,
            contentGroup: this.contentGroup,
            structureRoot: this.structureRoot,
            nodeMap: this.nodeMap,
            optimizedMapping: this.optimizedMapping,
            highlightedUuids: this.highlightedUuids
        };
    }

    private getHighlightContext() {
        return {
            contentGroup: this.contentGroup,
            selectionBox: this.selectionBox,
            highlightMesh: this.highlightMesh,
            optimizedMapping: this.optimizedMapping,
            settings: this.settings,
            state: {
                highlightedUuids: this.highlightedUuids,
                locateResultSet: this.locateResultSet,
                locateFocusUuid: this.locateFocusUuid,
                lastSelectedUuid: this.lastSelectedUuid,
                highlightedInstance: this.highlightedInstance
            },
            totalMeshCount: this.originalStats.meshes,
            locateMaterialCache: this.locateMaterialCache,
            locateObjectMaterialCache: this.locateObjectMaterialCache,
            locateDimmedInstances: this.locateDimmedInstances,
            clearClashPairHighlight: () => this.clearClashPairHighlight(),
            nodeMap: this.nodeMap
        };
    }

    private cancelCameraFlight() {
        this.cameraFlightToken += 1;
        if (this.cameraFlightFrameId !== null) {
            cancelAnimationFrame(this.cameraFlightFrameId);
            this.cameraFlightFrameId = null;
        }
    }

    private isWorldVisible(object: THREE.Object3D) {
        let current: THREE.Object3D | null = object;
        while (current) {
            if (!current.visible) return false;
            current = current.parent;
        }
        return true;
    }

    private getPickingContext() {
        return {
            canvas: this.canvas,
            camera: this.camera,
            raycaster: this.raycaster,
            mouse: this.mouse,
            contentGroup: this.contentGroup,
            chunks: this.chunks,
            nodeMap: this.nodeMap,
            interactableList: this.interactableList,
            interactableListValid: this.interactableListValid
        };
    }

    private syncHighlightState(state: {
        highlightedUuids: Set<string>;
        locateResultSet: Set<string>;
        locateFocusUuid: string | null;
        lastSelectedUuid: string | null;
        highlightedInstance?: HighlightInstanceRef | null;
    }) {
        this.highlightedUuids = state.highlightedUuids;
        this.locateResultSet = state.locateResultSet;
        this.locateFocusUuid = state.locateFocusUuid;
        this.lastSelectedUuid = state.lastSelectedUuid;
        this.highlightedInstance = state.highlightedInstance ?? null;
        if (!this.highlightedInstance && this.highlightGlowMesh) {
            this.highlightGlowMesh.visible = false;
        }
    }

    private syncPickingState(state: { interactableList: THREE.Object3D[]; interactableListValid: boolean; }) {
        this.interactableList = state.interactableList;
        this.interactableListValid = state.interactableListValid;
    }

    private getMeasurementContext() {
        return {
            canvas: this.canvas,
            camera: this.camera,
            raycaster: this.raycaster,
            mouse: this.mouse,
            measureGroup: this.measureGroup,
            tempMarker: this.tempMarker,
            dotTexture: this.dotTexture,
            measureRecords: this.measureRecords,
            state: {
                measureType: this.measureType,
                currentMeasurePoints: this.currentMeasurePoints,
                currentMeasureModelUuid: this.currentMeasureModelUuid,
                previewLine: this.previewLine,
                previewPolygon: this.previewPolygon
            },
            getRayIntersects: (clientX: number, clientY: number) => this.getRayIntersects(clientX, clientY),
            onMeasureUpdate: this.onMeasureUpdate
        };
    }

    private syncMeasurementState(state: {
        measureType: MeasureType;
        currentMeasurePoints: THREE.Vector3[];
        currentMeasureModelUuid: string | null;
        previewLine: THREE.Line | null;
        previewPolygon: THREE.LineLoop | null;
    }) {
        this.measureType = state.measureType;
        this.currentMeasurePoints = state.currentMeasurePoints;
        this.currentMeasureModelUuid = state.currentMeasureModelUuid;
        this.previewLine = state.previewLine;
        this.previewPolygon = state.previewPolygon;
    }

    private syncBoxSelectState(state: typeof this.boxSelectState) {
        this.boxSelectState = state;
    }

    private getClippingContext() {
        return {
            renderer: this.renderer,
            clipHelpersGroup: this.clipHelpersGroup,
            state: {
                clippingPlanes: this.clippingPlanes,
                clipPlaneHelpers: this.clipPlaneHelpers,
                clipHelperVisible: this.clipHelperVisible,
                clipHelperOpacity: this.clipHelperOpacity
            }
        };
    }

    private syncClippingState(state: {
        clippingPlanes: THREE.Plane[];
        clipPlaneHelpers: THREE.Mesh[];
        clipHelperVisible: boolean;
        clipHelperOpacity: number;
    }) {
        this.clippingPlanes = state.clippingPlanes;
        this.clipPlaneHelpers = state.clipPlaneHelpers;
        this.clipHelperVisible = state.clipHelperVisible;
        this.clipHelperOpacity = state.clipHelperOpacity;
    }

    setAllVisibility(visible: boolean) {
        this.locateIsolationRestoreChanges = [];
        this.locateIsolationActive = false;
        const result = applySetAllVisibility(this.getVisibilityContext(), visible);
        if (result.needsBoundsUpdate) this.updateSceneBounds();
        if (result.needsExplodeRefresh) this.refreshExplodeState();
        if (result.needsRender) this.markSceneDirty();
    }

    hideObjects(uuids: string[]) {
        this.setObjectsVisibility(uuids, false);
    }

    applyVisibilityBatch(changes: SceneVisibilityChange[], options: SceneVisibilityBatchOptions = {}) {
        const result = applyVisibilityBatch(this.getVisibilityContext(), changes, options);
        if (result.nextHighlightedUuids) {
            this.highlightObjects(result.nextHighlightedUuids);
        }
        if (options.invalidateInteractables ?? true) {
            this.markSceneDirty({
                invalidateInteractables: true,
                needsRender: false
            });
        }
        if (result.needsBoundsUpdate) this.updateSceneBounds();
        if (result.needsExplodeRefresh) this.refreshExplodeState();
        if (result.needsRender) this.markSceneDirty();
    }

    setObjectsVisibility(
        uuids: string[],
        visible: boolean,
        options: { showParents?: boolean; deferRefresh?: boolean; refreshExplode?: boolean } = {}
    ) {
        if (uuids.length === 0) return;
        const changes = uuids.map((uuid) => ({
            uuid,
            visible,
            showParents: options.showParents
        }));
        const recomputeBounds = !options.deferRefresh;
        this.applyVisibilityBatch(changes, {
            recomputeBounds,
            refreshExplode: options.refreshExplode ?? false,
            invalidateInteractables: !options.deferRefresh
        });
    }

    isolateObjects(uuids: string[]) {
        this.restoreLocateIsolation({ clearFocus: false, invalidate: false });
        const result = applyIsolateObjects(
            this.getVisibilityContext(),
            uuids,
            (uuid, visible, showParents) => {
                const inner = applySetObjectVisibility(this.getVisibilityContext(), uuid, visible, showParents);
                if (inner.nextHighlightedUuids) {
                    const highlightContext = this.getHighlightContext();
                    const highlightResult = applyHighlightObjects(highlightContext, inner.nextHighlightedUuids);
                    this.syncHighlightState(highlightContext.state);
                    if (highlightResult.needsRender) this.markSceneDirty();
                }
            }
        );
        this.markSceneDirty({
            invalidateInteractables: true,
            needsRender: false
        });
        if (result.needsBoundsUpdate) this.updateSceneBounds();
        if (result.needsExplodeRefresh) this.refreshExplodeState();
        if (result.needsRender) this.markSceneDirty();
    }

    isolateObjectsForLocate(uuids: string[]) {
        const normalized = Array.from(new Set((uuids || []).map((uuid) => String(uuid || "").trim()).filter(Boolean)));
        if (normalized.length === 0) return;

        this.restoreLocateIsolation({ clearFocus: false, invalidate: false });

        const targetIds = new Set<string>(normalized);
        this.collectRenderableTargets(normalized).forEach((target) => {
            targetIds.add(target.uuid);
            if (target.ownerUuid) targetIds.add(target.ownerUuid);
        });

        const addDescendants = (node: StructureTreeNode | undefined) => {
            if (!node) return;
            targetIds.add(node.id);
            node.children?.forEach(addDescendants);
        };

        Array.from(targetIds).forEach((id) => {
            const nodes = this.nodeMap.get(id);
            nodes?.forEach(addDescendants);
        });

        const keepIds = new Set<string>();
        const walkKeep = (node: StructureTreeNode, ancestors: string[]): boolean => {
            const isTarget = targetIds.has(node.id);
            let childMatched = false;
            node.children?.forEach((child) => {
                if (walkKeep(child, [...ancestors, node.id])) {
                    childMatched = true;
                }
            });

            if (isTarget || childMatched) {
                keepIds.add(node.id);
                ancestors.forEach((id) => keepIds.add(id));
            }

            return isTarget || childMatched;
        };

        this.structureRoot.children?.forEach((child) => walkKeep(child, []));
        targetIds.forEach((id) => keepIds.add(id));

        const hiddenIds = new Set<string>();
        const collectHiddenRoots = (node: StructureTreeNode) => {
            if (!node.id || keepIds.has(node.id)) {
                node.children?.forEach(collectHiddenRoots);
                return;
            }

            const mirrored = this.nodeMap.get(node.id);
            const currentlyVisible = mirrored
                ? mirrored.some((item) => item.visible !== false)
                : node.visible !== false;
            if (currentlyVisible) {
                hiddenIds.add(node.id);
            }
        };

        this.structureRoot.children?.forEach(collectHiddenRoots);

        // 兜底：如果结构树映射不完整，至少隐藏当前已加载的非目标可渲染对象。
        this.collectRenderableTargets().forEach((target) => {
            const id = target.ownerUuid || target.uuid;
            if (!id || keepIds.has(id) || keepIds.has(target.uuid)) return;
            const nodes = this.nodeMap.get(id);
            const currentlyVisible = nodes
                ? nodes.some((node) => node.visible !== false)
                : target.object.visible !== false;
            if (currentlyVisible) hiddenIds.add(id);
        });

        if (hiddenIds.size === 0) {
            this.locateIsolationRestoreChanges = [];
            this.locateIsolationActive = false;
            return;
        }

        const hideChanges: SceneVisibilityChange[] = Array.from(hiddenIds).map((uuid) => ({
            uuid,
            visible: false,
            showParents: false
        }));

        this.locateIsolationRestoreChanges = Array.from(hiddenIds).map((uuid) => ({
            uuid,
            visible: true,
            showParents: true
        }));
        this.locateIsolationActive = true;

        this.applyVisibilityBatch(hideChanges, {
            recomputeBounds: false,
            refreshExplode: false,
            invalidateInteractables: true
        });
    }

    restoreLocateIsolation(options: { clearFocus?: boolean; invalidate?: boolean } = {}) {
        if (!this.locateIsolationActive || this.locateIsolationRestoreChanges.length === 0) {
            this.locateIsolationActive = false;
            this.locateIsolationRestoreChanges = [];
            return false;
        }

        const restoreChanges = this.locateIsolationRestoreChanges;
        this.locateIsolationRestoreChanges = [];
        this.locateIsolationActive = false;

        this.applyVisibilityBatch(restoreChanges, {
            recomputeBounds: false,
            refreshExplode: false,
            invalidateInteractables: options.invalidate ?? true
        });

        if (options.clearFocus ?? true) {
            this.clearLocateFocus();
        }

        return true;
    }

    setObjectVisibility(uuid: string, visible: boolean, showParents: boolean = true) {
        const result = applySetObjectVisibility(this.getVisibilityContext(), uuid, visible, showParents);
        if (result.nextHighlightedUuids) {
            this.highlightObjects(result.nextHighlightedUuids);
        }
        this.markSceneDirty({
            invalidateInteractables: true,
            needsRender: false
        });
        if (result.needsBoundsUpdate) this.updateSceneBounds();
        if (result.needsRender) this.markSceneDirty();
    }

    highlightObject(uuid: string | null) {
        this.highlightObjects(uuid ? [uuid] : []);
    }

    private toLocalDirection(directionWorld: THREE.Vector3, matrixWorld: THREE.Matrix4) {
        return directionWorld.clone().transformDirection(matrixWorld.clone().invert()).normalize();
    }

    private getExplodeWorldDirection(vectorFromCenter: THREE.Vector3) {
        const direction = vectorFromCenter.clone();
        if (this.explodeMode === 'horizontal') {
            direction.z = 0;
        } else if (this.explodeMode === 'vertical') {
            direction.x = 0;
            direction.y = 0;
            direction.z = direction.z >= 0 ? 1 : -1;
        }
        if (direction.lengthSq() < 1e-8) {
            if (this.explodeMode === 'vertical') return new THREE.Vector3(0, 0, 1);
            if (this.explodeMode === 'horizontal') return new THREE.Vector3(1, 0, 0);
            return new THREE.Vector3(0, 0, 1);
        }
        return direction.normalize();
    }

    /** 由 UUID 导出的稳定单位向量，近似均匀分布于球面（与径向方向混合后爆炸更散、更匀） */
    private explodeStableUnitDirection(seed: string, target: THREE.Vector3) {
        stableExplodeDirection(seed, target);
    }

    private captureExplodeSnapshot() {
        this.explodeObjectStates.clear();
        this.explodeInstanceStates.clear();

        let bounds = this.computeTotalBounds(true, true);
        if (bounds.isEmpty()) bounds = this.computeTotalBounds(false, true);
        if (bounds.isEmpty()) {
            this.explodeCenter.set(0, 0, 0);
            return;
        }

        this.explodeCenter.copy(bounds.getCenter(new THREE.Vector3()));
        const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.5, 1);
        const objectBox = new THREE.Box3();
        const objectCenter = new THREE.Vector3();

        this.contentGroup.updateMatrixWorld(true);
        this.contentGroup.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh || !obj.visible || obj.userData?.isIfcGridHelper) return;
            objectBox.setFromObject(obj);
            if (objectBox.isEmpty()) return;
            objectCenter.copy(objectBox.getCenter(new THREE.Vector3()));
            const offset = objectCenter.sub(this.explodeCenter);
            const distN = offset.length() / radius;
            const weight = 0.14 + 0.86 * Math.pow(THREE.MathUtils.clamp(distN, 0, 2.5) / 2.5, 0.38);

            let directionWorld: THREE.Vector3;
            if (this.explodeMode === 'radial') {
                const radial = this.getExplodeWorldDirection(offset);
                this.explodeStableUnitDirection(obj.uuid, this.explodeScratchUniform);
                const mix = Math.pow(1 - Math.min(distN / 1.08, 1), 1.15);
                directionWorld = this.explodeScratchMix.copy(radial).multiplyScalar(1 - mix).addScaledVector(this.explodeScratchUniform, mix).normalize();
            } else {
                directionWorld = this.getExplodeWorldDirection(offset);
            }
            const directionLocal = this.toLocalDirection(directionWorld, obj.parent?.matrixWorld || new THREE.Matrix4());
            this.explodeObjectStates.set(obj.uuid, {
                object: obj,
                basePosition: obj.position.clone(),
                directionLocal,
                weight
            });
        });

        const instanceBox = new THREE.Box3();
        const localBox = new THREE.Box3();
        const instanceMatrix = new THREE.Matrix4();
        const worldMatrix = new THREE.Matrix4();
        this.optimizedMapping.forEach((mappings, originalUuid) => {
            const isVisible = this.nodeMap.get(originalUuid)?.some((node) => node.visible !== false) ?? true;
            if (!isVisible) return;
            mappings.forEach((mapping) => {
                const key = `${mapping.mesh.uuid}:${mapping.instanceId}`;
                if (this.explodeInstanceStates.has(key)) return;
                mapping.mesh.getMatrixAt(mapping.instanceId, instanceMatrix);
                worldMatrix.copy(mapping.mesh.matrixWorld).multiply(instanceMatrix);
                const localGeometryBox = mapping.geometry
                    ? (mapping.geometry.boundingBox || (mapping.geometry.computeBoundingBox(), mapping.geometry.boundingBox))
                    : getBatchedInstanceLocalBox(mapping.mesh, mapping.instanceId, localBox);
                if (!localGeometryBox) return;
                instanceBox.copy(localGeometryBox).applyMatrix4(worldMatrix);
                if (instanceBox.isEmpty()) return;
                objectCenter.copy(instanceBox.getCenter(new THREE.Vector3()));
                const offset = objectCenter.sub(this.explodeCenter);
                const distN = offset.length() / radius;
                const weight = 0.14 + 0.86 * Math.pow(THREE.MathUtils.clamp(distN, 0, 2.5) / 2.5, 0.38);

                let directionWorld: THREE.Vector3;
                if (this.explodeMode === 'radial') {
                    const radial = this.getExplodeWorldDirection(offset);
                    this.explodeStableUnitDirection(key, this.explodeScratchUniform);
                    const mix = Math.pow(1 - Math.min(distN / 1.08, 1), 1.15);
                    directionWorld = this.explodeScratchMix.copy(radial).multiplyScalar(1 - mix).addScaledVector(this.explodeScratchUniform, mix).normalize();
                } else {
                    directionWorld = this.getExplodeWorldDirection(offset);
                }
                this.explodeInstanceStates.set(key, {
                    mesh: mapping.mesh,
                    instanceId: mapping.instanceId,
                    baseMatrix: instanceMatrix.clone(),
                    directionLocal: this.toLocalDirection(directionWorld, mapping.mesh.matrixWorld),
                    weight
                });
            });
        });
    }

    private applyExplodeState() {
        const bounds = this.computeTotalBounds(true, true);
        const size = bounds.isEmpty() ? new THREE.Vector3(100, 100, 100) : bounds.getSize(new THREE.Vector3());
        const magnitude = Math.max(size.length() * 0.125 * (this.explodeStrength / 100), 0);

        this.explodeObjectStates.forEach((state) => {
            state.object.position.copy(state.basePosition).addScaledVector(state.directionLocal, magnitude * state.weight);
            state.object.updateMatrixWorld();
        });

        const translation = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const matrixWork = new THREE.Matrix4();
        this.explodeInstanceStates.forEach((state) => {
            matrixWork.copy(state.baseMatrix);
            matrixWork.decompose(translation, quaternion, scale);
            translation.addScaledVector(state.directionLocal, magnitude * state.weight);
            matrixWork.compose(translation, quaternion, scale);
            state.mesh.setMatrixAt(state.instanceId, matrixWork);
            if ((state.mesh as any).instanceMatrix) (state.mesh as any).instanceMatrix.needsUpdate = true;
        });

        this.interactableListValid = false;
        this.updateSceneBounds();
        // 爆炸后批量网格实例矩阵变化，合并边线不再准确，暂时隐藏
        this.displayEdges.setBatchedVisible(magnitude === 0);
        this.markSceneDirty({
            needsBoundsUpdate: true,
            needsCulling: true,
            invalidateInteractables: true
        });
    }

    private restoreExplodeSnapshot() {
        this.explodeObjectStates.forEach((state) => {
            state.object.position.copy(state.basePosition);
            state.object.updateMatrixWorld();
        });
        this.explodeInstanceStates.forEach((state) => {
            state.mesh.setMatrixAt(state.instanceId, state.baseMatrix);
            if ((state.mesh as any).instanceMatrix) (state.mesh as any).instanceMatrix.needsUpdate = true;
        });
        this.interactableListValid = false;
        this.updateSceneBounds();
        this.displayEdges.setBatchedVisible(true);
        this.markSceneDirty({
            needsBoundsUpdate: true,
            needsCulling: true,
            invalidateInteractables: true
        });
    }

    private refreshExplodeState() {
        if (!this.explodeEnabled) return;
        this.restoreExplodeSnapshot();
        this.captureExplodeSnapshot();
        this.applyExplodeState();
    }

    setExplodeEnabled(enabled: boolean) {
        if (enabled === this.explodeEnabled) return;
        this.explodeEnabled = enabled;
        if (!enabled) {
            this.restoreExplodeSnapshot();
            this.explodeObjectStates.clear();
            this.explodeInstanceStates.clear();
            return;
        }
        this.captureExplodeSnapshot();
        this.applyExplodeState();
    }

    setExplodeStrength(value: number) {
        this.explodeStrength = THREE.MathUtils.clamp(value, 0, 100);
        if (!this.explodeEnabled) return;
        if (this.explodeObjectStates.size === 0 && this.explodeInstanceStates.size === 0) {
            this.captureExplodeSnapshot();
        }
        this.applyExplodeState();
    }

    setExplodeMode(mode: ExplodeMode) {
        this.explodeMode = mode;
        if (!this.explodeEnabled) return;
        this.restoreExplodeSnapshot();
        this.captureExplodeSnapshot();
        this.applyExplodeState();
    }

    resetExplode() {
        this.explodeStrength = 0;
        if (this.explodeEnabled) {
            this.restoreExplodeSnapshot();
        }
        this.explodeEnabled = false;
        this.explodeObjectStates.clear();
        this.explodeInstanceStates.clear();
        this.markSceneDirty({
            needsBoundsUpdate: true,
            needsCulling: true,
            invalidateInteractables: true
        });
    }

    clearClashPairHighlight() {
        this.clashPairObjectMaterialCache.forEach((material, uuid) => {
            const obj = this.contentGroup.getObjectByProperty("uuid", uuid) as (THREE.Mesh & { isBatchedMesh?: boolean }) | null;
            if (!obj || (!obj.isMesh && !(obj as any).isBatchedMesh)) return;
            (obj as any).material = material;
        });
        this.clashPairObjectMaterialCache.clear();
        this.clashPairInstanceColorCache.forEach(({ mesh, instanceId, originalColor }) => {
            mesh.setColorAt(instanceId, new THREE.Color(originalColor));
            if ((mesh as any).instanceColor) (mesh as any).instanceColor.needsUpdate = true;
        });
        this.clashPairInstanceColorCache.clear();
        this.clashPairUuids.clear();
    }

    setClashPairHighlight(
        aUuid: string,
        bUuid: string,
        colorAHex: string = "#ff4d4f",
        colorBHex: string = "#1890ff"
    ) {
        const normalizedA = String(aUuid || "").trim();
        const normalizedB = String(bUuid || "").trim();
        if (!normalizedA || !normalizedB) {
            this.clearClashPairHighlight();
            this.markSceneDirty();
            return;
        }

        this.clearLocateFocus();
        this.clearClashPairHighlight();

        const aTargets = this.expandLocateTargets([normalizedA]);
        const bTargets = this.expandLocateTargets([normalizedB]);
        const colorA = new THREE.Color(colorAHex);
        const colorB = new THREE.Color(colorBHex);

        this.contentGroup.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (!mesh.isMesh || (mesh as any).isBatchedMesh || mesh.userData?.isOptimized || !mesh.material) return;
            const side = aTargets.has(child.uuid) ? "A" : bTargets.has(child.uuid) ? "B" : null;
            if (!side) return;
            if (!this.clashPairObjectMaterialCache.has(child.uuid)) {
                this.clashPairObjectMaterialCache.set(child.uuid, mesh.material);
            }
            const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const tintColor = side === "A" ? colorA : colorB;
            const nextMaterials = sourceMaterials.map((material) => {
                if (!material) return material;
                const cloned = material.clone() as THREE.Material & {
                    color?: THREE.Color;
                    emissive?: THREE.Color;
                    transparent?: boolean;
                    opacity?: number;
                    depthWrite?: boolean;
                };
                if ("transparent" in cloned) cloned.transparent = false;
                if ("opacity" in cloned) cloned.opacity = 1;
                if ("depthWrite" in cloned) cloned.depthWrite = true;
                if ("color" in cloned && cloned.color) {
                    cloned.color.copy(cloned.color.clone().lerp(tintColor, 0.86));
                }
                if ("emissive" in cloned && cloned.emissive) {
                    cloned.emissive.copy(tintColor.clone().multiplyScalar(0.36));
                }
                cloned.needsUpdate = true;
                return cloned;
            });
            mesh.material = Array.isArray(mesh.material) ? nextMaterials : nextMaterials[0];
        });

        const originalColorByInstance = new Map<string, number>();
        this.optimizedMapping.forEach((mappings) => {
            mappings.forEach((mapping) => {
                originalColorByInstance.set(`${mapping.mesh.uuid}:${mapping.instanceId}`, mapping.originalColor);
            });
        });

        this.contentGroup.traverse((child) => {
            const batched = child as THREE.BatchedMesh & { userData?: any };
            if (!(child as any).isBatchedMesh) return;
            const batchIdToUuid = batched.userData?.batchIdToUuid as Map<number, string> | undefined;
            if (!batchIdToUuid || batchIdToUuid.size === 0) return;
            let touched = false;
            batchIdToUuid.forEach((instanceUuid, instanceId) => {
                const side = aTargets.has(instanceUuid) ? "A" : bTargets.has(instanceUuid) ? "B" : null;
                if (!side) return;
                const key = `${batched.uuid}:${instanceId}`;
                if (!this.clashPairInstanceColorCache.has(key)) {
                    const mappedOriginalColor = originalColorByInstance.get(key);
                    if (typeof mappedOriginalColor === "number") {
                        this.clashPairInstanceColorCache.set(key, {
                            mesh: batched,
                            instanceId,
                            originalColor: mappedOriginalColor
                        });
                    } else {
                        const currentColor = new THREE.Color();
                        batched.getColorAt(instanceId, currentColor);
                        this.clashPairInstanceColorCache.set(key, {
                            mesh: batched,
                            instanceId,
                            originalColor: currentColor.getHex()
                        });
                    }
                }
                const origin = this.clashPairInstanceColorCache.get(key)?.originalColor;
                if (typeof origin !== "number") return;
                const tintColor = side === "A" ? colorA : colorB;
                batched.setColorAt(instanceId, new THREE.Color(origin).lerp(tintColor, 0.88));
                touched = true;
            });
            if (touched && (batched as any).instanceColor) (batched as any).instanceColor.needsUpdate = true;
        });

        this.clashPairUuids = new Set([normalizedA, normalizedB]);
        this.markSceneDirty();
    }

    clearLocateFocus() {
        if (
            this.locateResultSet.size === 0 &&
            this.locateObjectMaterialCache.size === 0 &&
            this.locateDimmedInstances.size === 0 &&
            !this.locateFocusUuid &&
            this.highlightedUuids.size === 0
        ) {
            return;
        }
        const context = this.getHighlightContext();
        const result = applyClearLocateFocus(context);
        this.syncHighlightState(context.state);
        if (result.needsRender) this.markSceneDirty();
    }

    restoreView(keepOrientation = true) {
        this.cancelCameraFlight();
        if (this.locateResultSet.size > 0 || this.locateObjectMaterialCache.size > 0 || this.locateDimmedInstances.size > 0) {
            this.clearLocateFocus();
            requestAnimationFrame(() => {
                if (this.disposed) return;
                this.fitView(keepOrientation);
            });
            return;
        }
        this.fitView(keepOrientation);
    }

    private expandLocateTargets(ids: string[]) {
        const expanded = new Set<string>();
        const queue = [...ids];
        const visited = new Set<string>();

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (!current || visited.has(current)) continue;
            visited.add(current);
            expanded.add(current);

            const nodes = this.nodeMap.get(current);
            if (!nodes || nodes.length === 0) continue;
            for (const node of nodes) {
                if (!node.children || node.children.length === 0) continue;
                for (const child of node.children) {
                    if (!visited.has(child.id)) queue.push(child.id);
                }
            }
        }

        return expanded;
    }

    setLocateResultSet(uuids: string[], focusUuid: string | null = null) {
        const context = this.getHighlightContext();
        const result = applySetLocateResultSet(context, uuids, focusUuid);
        this.syncHighlightState(context.state);
        if (result.needsRender) this.markSceneDirty();
    }

    setLocateFocusContext(uuids: string[], focusUuid: string | null = null, highlightColors?: Record<string, string>) {
        const context = this.getHighlightContext();
        const result = applySetLocateResultSet(context, uuids, focusUuid, { highlightColors });
        this.syncHighlightState(context.state);
        if (result.needsRender) this.markSceneDirty();
    }

    setLocateFocus(uuid: string | null) {
        if (!uuid) {
            this.clearLocateFocus();
            return;
        }
        this.setLocateResultSet([uuid], uuid);
    }

    highlightObjects(uuids: string[], instanceRef?: HighlightInstanceRef | null) {
        const context = this.getHighlightContext();
        const result = applyHighlightObjects(context, uuids, instanceRef ?? null);
        this.syncHighlightState(context.state);
        if (result.needsRender) this.markSceneDirty();

        // 命中具体实例时播放一段短促的发光脉冲，之后停在“提亮”状态。
        if (instanceRef && this.highlightedInstance) {
            this.highlightGlowUntil = performance.now() + 1500;
            this.lastHighlightGlowAt = 0;
            this.highlightGlowSettled = false;
            this.updateHighlightGlowMesh(0.62);
            this.requestRender();
        } else {
            this.highlightGlowUntil = 0;
            this.highlightGlowSettled = true;
            if (this.highlightGlowMesh) this.highlightGlowMesh.visible = false;
        }
    }

    /** 选中实例的发光脉冲（约 1.5 秒），结束后停在 1.35 倍提亮色上。 */
    private updateHighlightGlow(now: number) {
        const focus = this.highlightedInstance;
        if (!focus || !focus.mesh) {
            this.updateHighlightGlowMesh(0);
            return;
        }

        const maxInstances = (focus.mesh as any).instanceCount ?? 0;
        if (maxInstances > 20000) {
            this.updateHighlightGlowMesh(0.5);
            return; // 超大分块不做逐帧重上传，避免卡顿
        }

        if (now > this.highlightGlowUntil) {
            this.updateHighlightGlowMesh(0.62);
            if (this.highlightGlowSettled) return;
            this.highlightGlowSettled = true;
            const context = this.getHighlightContext();
            const result = applyHighlightGlow(context, 1.35);
            this.syncHighlightState(context.state);
            if (result.needsRender) this.markSceneDirty();
            return;
        }

        const remaining = Math.max(0, this.highlightGlowUntil - now) / 1500;
        const wave = 0.5 + 0.5 * Math.sin(now / 90);
        const pulse = 1.35 + 0.95 * remaining * wave;
        this.updateHighlightGlowMesh(0.35 + 0.5 * remaining * wave);

        if (now - this.lastHighlightGlowAt < 66) return;
        this.lastHighlightGlowAt = now;

        const context = this.getHighlightContext();
        const result = applyHighlightGlow(context, pulse);
        this.syncHighlightState(context.state);
        if (result.needsRender) this.markSceneDirty();
    }

    /**
     * 单选实例的发光描边：用加法混合 + BackSide 的放大副本勾勒出光晕，
     * 与实例本体的提亮色叠加后呈现“发光”效果。
     */
    private updateHighlightGlowMesh(opacity: number) {
        const focus = this.highlightedInstance;
        if (!focus || !focus.mesh || opacity <= 0) {
            if (this.highlightGlowMesh) this.highlightGlowMesh.visible = false;
            return;
        }

        const mapping = this.optimizedMapping
            .get(focus.uuid)
            ?.find((item) => item.mesh === focus.mesh && item.instanceId === focus.instanceId);
        const geometry = mapping?.geometry || getBatchedInstanceGeometry(focus.mesh, focus.instanceId);
        if (!geometry) {
            if (this.highlightGlowMesh) this.highlightGlowMesh.visible = false;
            return;
        }

        let mesh = this.highlightGlowMesh;
        if (!mesh) {
            const material = new THREE.MeshBasicMaterial({
                color: new THREE.Color(this.settings.highlightColor || "#0b5fa5"),
                transparent: true,
                opacity,
                depthWrite: false,
                depthTest: true,
                blending: THREE.AdditiveBlending,
                side: THREE.BackSide,
                toneMapped: false
            });
            mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
            mesh.name = "__highlightGlow";
            mesh.matrixAutoUpdate = false;
            mesh.frustumCulled = false;
            mesh.renderOrder = 6;
            mesh.raycast = () => {};
            this.helpersGroup.add(mesh);
            this.highlightGlowMesh = mesh;
        }

        if (mesh.geometry !== geometry) mesh.geometry = geometry;

        const material = mesh.material as THREE.MeshBasicMaterial;
        material.color.set(this.settings.highlightColor || "#0b5fa5");
        material.opacity = THREE.MathUtils.clamp(opacity, 0, 1);

        if (!geometry.boundingBox) geometry.computeBoundingBox();
        const center = geometry.boundingBox
            ? geometry.boundingBox.getCenter(new THREE.Vector3())
            : new THREE.Vector3();
        const localScale = new THREE.Matrix4()
            .makeTranslation(center.x, center.y, center.z)
            .multiply(new THREE.Matrix4().makeScale(1.02, 1.02, 1.02))
            .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
        const instanceMatrix = new THREE.Matrix4();
        focus.mesh.getMatrixAt(focus.instanceId, instanceMatrix);
        mesh.matrix.multiplyMatrices(focus.mesh.matrixWorld, instanceMatrix).multiply(localScale);
        mesh.matrixWorldNeedsUpdate = true;
        mesh.visible = true;
    }

    /**
     * 通用多构件聚焦高亮入口：
     * - 高亮 uuids 中的所有物体
     * - 可选 fitView 将镜头飞到这批物体
     * - 可选 highlightColors 支持按 UUID 指定不同颜色（碰撞场景 A/B 色对）
     * - 传空数组等同于 clearLocateFocus()
     */
    focusHighlightObjects(
        uuids: string[],
        options: {
            fitView?: boolean;
            focusUuid?: string | null;
            highlightColors?: Record<string, string>;
        } = {}
    ) {
        const { fitView = true, focusUuid = null, highlightColors } = options;
        const normalized = Array.from(new Set(uuids.filter(Boolean)));

        if (normalized.length === 0) {
            this.clearLocateFocus();
            return;
        }

        this.setLocateFocusContext(normalized, focusUuid ?? normalized[0], highlightColors);

        if (fitView) {
            this.fitViewToObjects(normalized);
        }
    }

    collectRenderableTargets(uuids?: string[]): RenderTarget[] {
        const context = this.getHighlightContext();
        return uuids && uuids.length > 0
            ? collectRenderableTargetsForIds(context, uuids)
            : collectAllRenderableTargets(context);
    }

    pick(clientX: number, clientY: number): { object: THREE.Object3D, intersect: THREE.Intersection } | null {
        const intersect = this.getRayIntersects(clientX, clientY);
        if (!intersect) return null;

        return { object: intersect.object, intersect };
    }

    getRayIntersects(clientX: number, clientY: number): THREE.Intersection | null {
        const result = applyGetRayIntersects(this.getPickingContext(), clientX, clientY);
        this.syncPickingState(result.state);
        return result.intersect;
    }

    computeTotalBounds(onlyVisible: boolean = false, forceRecompute: boolean = false): THREE.Box3 {
        // 优先使用缓存
        if (!onlyVisible && !forceRecompute && !this.precomputedBounds.isEmpty()) {
            const box = this.precomputedBounds.clone();
            if (this.globalOffset.length() > 0) {
                box.translate(this.globalOffset.clone().negate());
            }
            return box;
        }

        const totalBox = new THREE.Box3();

        // 确保矩阵最新
        this.contentGroup.updateMatrixWorld(true);

        // 遍历 contentGroup 下的所有模型节点
        this.contentGroup.traverse(obj => {
            // 如果只计算可见物，跳过隐藏节点
            if (onlyVisible && !obj.visible) return;

            // 1. 处理普通 Mesh
            if ((obj as THREE.Mesh).isMesh && !(obj as any)._skipTraverse) {
                const mesh = obj as THREE.Mesh;
                if (mesh.geometry) {
                    const box = new THREE.Box3().setFromObject(mesh);
                    if (!box.isEmpty()) totalBox.union(box);
                }
            }
            // 2. 处理 BatchedMesh
            else if ((obj as any).isBatchedMesh && !(obj as any)._skipTraverse) {
                const bm = obj as any;
                if (bm.computeBoundingBox) {
                    bm.computeBoundingBox();
                    if (bm.boundingBox) {
                        const box = bm.boundingBox.clone().applyMatrix4(bm.matrixWorld);
                        totalBox.union(box);
                    }
                } else {
                    const box = new THREE.Box3().setFromObject(bm);
                    if (!box.isEmpty()) totalBox.union(box);
                }
            }
        });

        // 清理标记
        this.contentGroup.traverse(obj => { delete (obj as any)._skipTraverse; });

        // 4. NBIM 分块补偿 (用于极大型模型在未完全加载时的范围占位)
        if (this.chunks.length > 0) {
            this.chunks.forEach(c => {
                if (!onlyVisible || c.loaded) {
                    totalBox.union(c.bounds);
                }
            });
        }

        // 最终兜底
        if (totalBox.isEmpty() && !this.precomputedBounds.isEmpty()) {
            const fallback = this.precomputedBounds.clone();
            if (this.globalOffset.length() > 0) {
                fallback.translate(this.globalOffset.clone().negate());
            }
            return fallback;
        }

        return totalBox;
    }

    updateSceneBounds() {
        // 更新场景包围盒时，如果是为了计算渲染裁剪面，必须使用完整范围
        // 否则当部分物体被剔除时，包围盒缩小，会导致裁剪面缩小，进而剔除更多物体的恶性循环
        const fullBox = this.computeTotalBounds(false, true);
        this.precomputedBounds = fullBox.clone();
        if (this.globalOffset.length() > 0) {
            this.precomputedBounds.translate(this.globalOffset);
        }

        // sceneBounds 用于计算相机裁剪平面，应始终使用全场景范围
        this.sceneBounds.copy(fullBox);
        this.sceneSphereValid = false;
    }

    /**
     * 用已注册分块的包围盒做初始视角适配。
     * 不再依赖 manifest.globalBounds —— 某些批量导出的 globalBounds 明显偏大，
     * 会导致刚打开模型时缩成一个极小的点（必须手动点“充满”才正常）。
     */
    private fitViewToChunks(keepOrientation = true) {
        const box = new THREE.Box3();
        for (const chunk of this.chunks) {
            if (chunk?.bounds) box.union(chunk.bounds);
        }
        if (box.isEmpty()) {
            this.fitView(keepOrientation, false);
            return;
        }
        this.sceneBounds = box.clone();
        this.fitBox(box, !keepOrientation);
    }

    fitView(keepOrientation = true, visibleOnly = true) {
        this.contentGroup.updateMatrixWorld(true);
        let box = this.computeTotalBounds(visibleOnly);

        // 如果可见部分为空，尝试使用完整包围盒
        if (box.isEmpty()) {
            box = this.computeTotalBounds(false);
        }

        this.sceneBounds = box.clone();
        this.fitBox(box, !keepOrientation);
    }

    private unionObjectBounds(obj: THREE.Object3D, targetBox: THREE.Box3, visibleOnly = false) {
        if (visibleOnly && !this.isWorldVisible(obj)) return;
        const box = new THREE.Box3();
        if (obj.userData?.boundingBox) {
            box.copy(obj.userData.boundingBox).applyMatrix4(obj.matrixWorld);
        } else {
            box.setFromObject(obj);
        }
        if (!box.isEmpty()) targetBox.union(box);
    }

    private unionTilesNodeBounds(node: any, targetBox: THREE.Box3, visibleOnly = false) {
        if (visibleOnly && node?.visible === false) return;
        const encodedBox = node?.userData?.tilesBoundingVolumeBox;
        if (!Array.isArray(encodedBox) || encodedBox.length < 12) return;

        const center = new THREE.Vector3(encodedBox[0], encodedBox[1], encodedBox[2]);
        const axisX = new THREE.Vector3(encodedBox[3], encodedBox[4], encodedBox[5]);
        const axisY = new THREE.Vector3(encodedBox[6], encodedBox[7], encodedBox[8]);
        const axisZ = new THREE.Vector3(encodedBox[9], encodedBox[10], encodedBox[11]);
        const extent = new THREE.Vector3(axisX.length(), axisY.length(), axisZ.length());
        const box = new THREE.Box3(center.clone().sub(extent), center.clone().add(extent));
        if (!box.isEmpty()) targetBox.union(box);
    }

    private unionOptimizedBounds(uuid: string, targetBox: THREE.Box3, visibleOnly = false) {
        const mappings = this.optimizedMapping.get(uuid);
        if (!mappings || mappings.length === 0) return;

        const instanceMatrix = new THREE.Matrix4();
        const tempWorldBox = new THREE.Box3();
        for (const mapping of mappings) {
            if (visibleOnly && !this.isWorldVisible(mapping.mesh)) continue;
            let worldBox: THREE.Box3 | null;
            if (mapping.geometry) {
                if (!mapping.geometry.boundingBox) mapping.geometry.computeBoundingBox();
                if (!mapping.geometry.boundingBox) continue;
                mapping.mesh.getMatrixAt(mapping.instanceId, instanceMatrix);
                instanceMatrix.premultiply(mapping.mesh.matrixWorld);
                worldBox = tempWorldBox.copy(mapping.geometry.boundingBox).applyMatrix4(instanceMatrix);
            } else {
                worldBox = getBatchedInstanceWorldBox(mapping.mesh, mapping.instanceId, tempWorldBox, instanceMatrix);
            }
            if (worldBox && !worldBox.isEmpty()) targetBox.union(worldBox);
        }
    }

    private unionNodeBounds(uuid: string, targetBox: THREE.Box3, visited = new Set<string>(), visibleOnly = false) {
        if (!uuid || visited.has(uuid)) return;
        visited.add(uuid);

        const obj = this.contentGroup.getObjectByProperty("uuid", uuid);
        if (obj) {
            this.unionObjectBounds(obj, targetBox, visibleOnly);
        }

        this.unionOptimizedBounds(uuid, targetBox, visibleOnly);

        const nodes = this.nodeMap.get(uuid) || [];
        for (const node of nodes) {
            this.unionTilesNodeBounds(node, targetBox, visibleOnly);
            const children = Array.isArray(node.children) ? node.children : [];
            for (const child of children) {
                this.unionNodeBounds(child.id, targetBox, visited, visibleOnly);
            }
        }
    }

    fitViewToObject(uuid: string) {
        let box = collectRenderableBoundsForIds(this.getHighlightContext(), [uuid]);
        if (box.isEmpty()) {
            box = new THREE.Box3();
            this.unionNodeBounds(uuid, box, new Set<string>(), true);
        }
        if (!box.isEmpty()) this.fitBox(box, false, 1.14, false);
    }

    getBoundsForObject(uuid: string) {
        if (!uuid) return null;
        let box = collectRenderableBoundsForIds(this.getHighlightContext(), [uuid]);
        if (box.isEmpty()) {
            box = new THREE.Box3();
            this.unionNodeBounds(uuid, box, new Set<string>(), true);
        }
        return box.isEmpty() ? null : box;
    }

    collectBoundsForUuids(uuids: string[]) {
        const renderableBox = collectRenderableBoundsForIds(this.getHighlightContext(), uuids);
        if (!renderableBox.isEmpty()) return renderableBox;

        const box = new THREE.Box3();
        const unique = Array.from(new Set((uuids || []).filter(Boolean)));
        unique.forEach((uuid) => this.unionNodeBounds(uuid, box, new Set<string>(), true));
        return box;
    }

    fitViewToObjects(uuids: string[]) {
        const box = this.collectBoundsForUuids(uuids);
        if (!box.isEmpty()) this.fitBox(box, false, 1.14, false);
    }

    fitBox(box: THREE.Box3, updateCameraPosition: boolean = true, paddingOverride?: number, needsCullingOnCameraMove: boolean = true) {
        this.cancelCameraFlight();

        if (box.isEmpty()) {
            this.camera.zoom = 1;
            this.camera.position.set(1000, 1000, 1000);
            this.camera.lookAt(0, 0, 0);
            this.controls.target.set(0, 0, 0);
            this.camera.updateProjectionMatrix();
            this.controls.update();
            this.markSceneDirty({ needsCulling: needsCullingOnCameraMove });
            return;
        }

        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const extent = maxDim > 0 ? maxDim : 100;
        const padding = paddingOverride ?? 1.02;

        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        const aspect = w / h;
        let fH, fW;
        if (aspect >= 1) { fH = extent * padding; fW = fH * aspect; }
        else { fW = extent * padding; fH = fW / aspect; }

        const zBuffer = Math.max(extent * 5, 200);
        this.camera.near = -zBuffer;
        this.camera.far = zBuffer;

        let targetZoom = 1;
        let targetLeft = -fW / 2;
        let targetRight = fW / 2;
        let targetTop = fH / 2;
        let targetBottom = -fH / 2;
        const flightToken = this.cameraFlightToken;

        if (updateCameraPosition) {
            const offset = new THREE.Vector3(1, -1, 1).normalize();
            const dist = Math.max(extent * 2.2, 5);
            const targetPosition = center.clone().add(offset.multiplyScalar(dist));
            const targetLookAt = center.clone();
            const startLeft = this.camera.left;
            const startRight = this.camera.right;
            const startTop = this.camera.top;
            const startBottom = this.camera.bottom;

            const positionDelta = this.camera.position.distanceTo(targetPosition);
            const targetDelta = this.controls.target.distanceTo(targetLookAt);
            if (positionDelta < 1e-3 && targetDelta < 1e-3) {
                this.controls.target.copy(targetLookAt);
                this.camera.position.copy(targetPosition);
                this.camera.left = targetLeft;
                this.camera.right = targetRight;
                this.camera.top = targetTop;
                this.camera.bottom = targetBottom;
                this.camera.zoom = targetZoom;
                this.camera.lookAt(this.controls.target);
                this.camera.updateProjectionMatrix();
                this.controls.update();
                this.markSceneDirty({ needsCulling: needsCullingOnCameraMove });
                return;
            }

            const startPosition = this.camera.position.clone();
            const startTarget = this.controls.target.clone();
            const startTime = performance.now();
            const duration = 420;

            const animate = () => {
                if (flightToken !== this.cameraFlightToken) return;
                const elapsed = performance.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);

                this.camera.position.lerpVectors(startPosition, targetPosition, eased);
                this.controls.target.lerpVectors(startTarget, targetLookAt, eased);
                this.camera.lookAt(this.controls.target);
                this.camera.zoom = targetZoom;
                this.camera.left = startLeft + (targetLeft - startLeft) * eased;
                this.camera.right = startRight + (targetRight - startRight) * eased;
                this.camera.top = startTop + (targetTop - startTop) * eased;
                this.camera.bottom = startBottom + (targetBottom - startBottom) * eased;
                this.camera.updateProjectionMatrix();
                this.controls.update();
                this.markSceneDirty({ needsCulling: needsCullingOnCameraMove });

                if (progress < 1) {
                    this.cameraFlightFrameId = requestAnimationFrame(animate);
                } else {
                    this.cameraFlightFrameId = null;
                    this.markSceneDirty({ needsCulling: needsCullingOnCameraMove });
                }
            };
            animate();
        } else {
            const direction = new THREE.Vector3();
            this.camera.getWorldDirection(direction);
            const dist = this.camera.position.distanceTo(this.controls.target);
            const targetPosition = center.clone().add(direction.multiplyScalar(-dist));
            const targetLookAt = center.clone();

            const paddingForOrientationFit = 1.01;
            const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
            const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
            const halfBaseWidth = Math.max(1e-6, (this.camera.right - this.camera.left) * 0.5);
            const halfBaseHeight = Math.max(1e-6, (this.camera.top - this.camera.bottom) * 0.5);

            const corners = [
                new THREE.Vector3(box.min.x, box.min.y, box.min.z),
                new THREE.Vector3(box.min.x, box.min.y, box.max.z),
                new THREE.Vector3(box.min.x, box.max.y, box.min.z),
                new THREE.Vector3(box.min.x, box.max.y, box.max.z),
                new THREE.Vector3(box.max.x, box.min.y, box.min.z),
                new THREE.Vector3(box.max.x, box.min.y, box.max.z),
                new THREE.Vector3(box.max.x, box.max.y, box.min.z),
                new THREE.Vector3(box.max.x, box.max.y, box.max.z),
            ];

            let maxProjX = 0;
            let maxProjY = 0;
            for (let i = 0; i < corners.length; i++) {
                const delta = corners[i].clone().sub(center);
                maxProjX = Math.max(maxProjX, Math.abs(delta.dot(camRight)));
                maxProjY = Math.max(maxProjY, Math.abs(delta.dot(camUp)));
            }

            const safeHalfX = Math.max(1e-3, maxProjX * paddingForOrientationFit);
            const safeHalfY = Math.max(1e-3, maxProjY * paddingForOrientationFit);
            targetZoom = Math.max(
                1e-4,
                Math.min(1e6, Math.min(halfBaseWidth / safeHalfX, halfBaseHeight / safeHalfY))
            );

            const startPosition = this.camera.position.clone();
            const startTarget = this.controls.target.clone();
            const startZoom = this.camera.zoom;
            const startTime = performance.now();
            const positionDelta = this.camera.position.distanceTo(targetPosition);
            const targetDelta = this.controls.target.distanceTo(targetLookAt);
            const zoomDelta = Math.abs(this.camera.zoom - targetZoom);
            if (positionDelta < 1e-3 && targetDelta < 1e-3 && zoomDelta < 1e-4) {
                this.camera.position.copy(targetPosition);
                this.controls.target.copy(targetLookAt);
                this.camera.lookAt(this.controls.target);
                this.camera.zoom = targetZoom;
                this.camera.updateProjectionMatrix();
                this.controls.update();
                this.markSceneDirty({ needsCulling: needsCullingOnCameraMove });
                return;
            }

            const duration = 420;

            const animate = () => {
                if (flightToken !== this.cameraFlightToken) return;
                const elapsed = performance.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);

                this.camera.position.lerpVectors(startPosition, targetPosition, eased);
                this.controls.target.lerpVectors(startTarget, targetLookAt, eased);
                this.camera.lookAt(this.controls.target);
                this.camera.zoom = startZoom + (targetZoom - startZoom) * eased;
                this.camera.updateProjectionMatrix();
                this.controls.update();
                this.markSceneDirty({ needsCulling: needsCullingOnCameraMove });

                if (progress < 1) {
                    this.cameraFlightFrameId = requestAnimationFrame(animate);
                } else {
                    this.cameraFlightFrameId = null;
                    this.markSceneDirty({ needsCulling: needsCullingOnCameraMove });
                }
            };
            animate();
        }
    }

    setView(view: string) {
        let box = this.computeTotalBounds(true);
        if (box.isEmpty()) box = this.computeTotalBounds(false);
        this.sceneBounds = box.clone();

        const center = box.isEmpty() ? new THREE.Vector3(0, 0, 0) : box.getCenter(new THREE.Vector3());
        const size = box.isEmpty() ? new THREE.Vector3(100, 100, 100) : box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const dist = Math.max(maxDim * 2, 10);

        let pos = new THREE.Vector3();
        switch (view) {
            case 'top': pos.set(0, 0, dist); break;
            case 'bottom': pos.set(0, 0, -dist); break;
            case 'front': pos.set(0, -dist, 0); break;
            case 'back': pos.set(0, dist, 0); break;
            case 'left': pos.set(-dist, 0, 0); break;
            case 'right': pos.set(dist, 0, 0); break;
            case 'se': case 'top-front-right': pos.set(dist, -dist, dist); break;
            case 'sw': case 'top-front-left': pos.set(-dist, -dist, dist); break;
            case 'ne': case 'top-back-right': pos.set(dist, dist, dist); break;
            case 'nw': case 'top-back-left': pos.set(-dist, dist, dist); break;
            case 'bottom-front-right': pos.set(dist, -dist, -dist); break;
            case 'bottom-front-left': pos.set(-dist, -dist, -dist); break;
            case 'bottom-back-right': pos.set(dist, dist, -dist); break;
            case 'bottom-back-left': pos.set(-dist, dist, -dist); break;
            case 'top-front': pos.set(0, -dist, dist); break;
            case 'top-back': pos.set(0, dist, dist); break;
            case 'top-left': pos.set(-dist, 0, dist); break;
            case 'top-right': pos.set(dist, 0, dist); break;
            case 'bottom-front': pos.set(0, -dist, -dist); break;
            case 'bottom-back': pos.set(0, dist, -dist); break;
            case 'bottom-left': pos.set(-dist, 0, -dist); break;
            case 'bottom-right': pos.set(dist, 0, -dist); break;
            case 'front-left': pos.set(-dist, -dist, 0); break;
            case 'front-right': pos.set(dist, -dist, 0); break;
            case 'back-left': pos.set(-dist, dist, 0); break;
            case 'back-right': pos.set(dist, dist, 0); break;
        }

        if (pos.lengthSq() > 0) {
            pos.normalize().multiplyScalar(dist);
            this.camera.position.copy(center).add(pos);
            this.camera.lookAt(center);
            this.controls.target.copy(center);
            this.controls.update();
            this.fitBox(box, false);
        }
    }

    getCameraState() {
        return {
            position: this.camera.position.toArray(),
            target: this.controls.target.toArray(),
            zoom: this.camera.zoom,
            left: this.camera.left,
            right: this.camera.right,
            top: this.camera.top,
            bottom: this.camera.bottom
        };
    }

    setCameraState(state: any) {
        if (!state) return;
        this.camera.position.fromArray(state.position);
        this.controls.target.fromArray(state.target);
        if (state.zoom !== undefined) this.camera.zoom = state.zoom;
        if (state.left !== undefined) this.camera.left = state.left;
        if (state.right !== undefined) this.camera.right = state.right;
        if (state.top !== undefined) this.camera.top = state.top;
        if (state.bottom !== undefined) this.camera.bottom = state.bottom;

        this.camera.updateProjectionMatrix();
        this.controls.update();
        this.markSceneDirty();
    }

    // --- 测量定位逻辑 ---
    locateMeasurement(id: string) {
        const record = this.measureRecords.get(id);
        if (!record) return;

        // 计算测量记录的中心点
        const box = new THREE.Box3();
        record.group.traverse((obj) => {
            if ((obj as any).isMesh || (obj as any).isLine || (obj as any).isSprite) {
                obj.updateMatrixWorld();
                if ((obj as any).geometry) {
                    if (!(obj as any).geometry.boundingBox) (obj as any).geometry.computeBoundingBox();
                    const b = (obj as any).geometry.boundingBox!.clone();
                    b.applyMatrix4(obj.matrixWorld);
                    box.union(b);
                }
            }
        });

        if (box.isEmpty()) return;

        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1.0;

        // 平滑移动相机
        this.controls.target.copy(center);

        // 调整缩放级别以适应测量结果
        const targetZoom = (this.camera.top - this.camera.bottom) / (maxDim * 0.5); // 进一步减小系数，靠得更近

        this.camera.zoom = Math.min(targetZoom, 100.0); // 允许更大缩放
        this.camera.updateProjectionMatrix();
        this.controls.update();
        this.markSceneDirty();
    }

    // --- 测量逻辑 ---
    startMeasurement(type: MeasureType) {
        this.measureType = type;
        this.currentMeasurePoints = [];
        this.currentMeasureModelUuid = null;
        this.clearMeasurementPreview();
    }

    addMeasurePoint(point: THREE.Vector3, modelUuid?: string): { id: string, type: string, val: string } | null {
        const context = this.getMeasurementContext();
        const result = applyAddMeasurePoint(context, point, modelUuid);
        this.syncMeasurementState(result.state);
        if (result.needsRender) this.markSceneDirty();
        return result.completed ?? null;
    }

    private updateMeasurePreview(hoverPoint?: THREE.Vector3) {
        const context = this.getMeasurementContext();
        const result = applyUpdateMeasurePreview(context, hoverPoint);
        this.syncMeasurementState(result.state);
        if (result.needsRender) this.markSceneDirty();
    }

    updateMeasureHover(clientX: number, clientY: number) {
        const context = this.getMeasurementContext();
        const result = applyUpdateMeasureHover(context, clientX, clientY);
        this.syncMeasurementState(result.state);
        if (result.needsRender) this.markSceneDirty();
    }

    finalizeMeasurement() {
        const context = this.getMeasurementContext();
        const result = applyFinalizeMeasurement(context);
        this.syncMeasurementState(result.state);
        if (result.needsRender) this.markSceneDirty();
        return result.completed ?? null;
    }

    highlightMeasurement(id: string | null) {
        const result = applyHighlightMeasurement(this.getMeasurementContext(), id);
        this.syncMeasurementState(result.state);
        if (result.needsRender) this.markSceneDirty();
    }

    pickMeasurement(clientX: number, clientY: number): string | null {
        return applyPickMeasurement(this.getMeasurementContext(), clientX, clientY);
    }

    /**
     * 获取对象的面积和体积
     */
    getObjectGeometryData(uuid: string): { area: number, volume: number } {
        return getObjectGeometryDataFromScene({
            uuid,
            optimizedMapping: this.optimizedMapping,
            contentGroup: this.contentGroup
        });
    }

    // ========== 框选方法 ==========

    /**
     * 开始框选
     */
    startBoxSelect(clientX: number, clientY: number) {
        const result = applyStartBoxSelect(this.boxSelectState, clientX, clientY);
        this.syncBoxSelectState(result.state);
        if (result.needsRender) this.markSceneDirty();
    }

    /**
     * 更新框选范围
     */
    updateBoxSelect(clientX: number, clientY: number) {
        const result = applyUpdateBoxSelect(this.boxSelectState, clientX, clientY);
        this.syncBoxSelectState(result.state);
        if (result.needsRender) this.markSceneDirty();
    }

    /**
     * 完成框选，返回选中的对象 UUID 列表
     */
    endBoxSelect(): string[] {
        const result = applyEndBoxSelect(this.boxSelectState, this.canvas, (x1, y1, x2, y2) =>
            this.selectByScreenRect(x1, y1, x2, y2)
        );
        this.syncBoxSelectState(result.state);
        if (result.needsRender) this.markSceneDirty();
        return result.selected;
    }

    /**
     * 取消框选
     */
    cancelBoxSelect() {
        const result = applyCancelBoxSelect(this.boxSelectState);
        this.syncBoxSelectState(result.state);
        if (result.needsRender) this.markSceneDirty();
    }

    /**
     * 通过屏幕矩形选择对象
     */
    private selectByScreenRect(x1: number, y1: number, x2: number, y2: number): string[] {
        const pickingState = ensureInteractableList(this.getPickingContext());
        this.syncPickingState(pickingState);
        return selectInteractablesByScreenRect(
            {
                camera: this.camera,
                interactableList: this.interactableList
            },
            x1,
            y1,
            x2,
            y2
        );
    }

    removeMeasurement(id: string) {
        if (this.measureRecords.has(id)) {
            const record = this.measureRecords.get(id);
            if (record) {
                this.measureGroup.remove(record.group);
                this.measureRecords.delete(id);
                if (this.onMeasureUpdate) {
                    this.onMeasureUpdate(Array.from(this.measureRecords.values()));
                }
                this.markSceneDirty();
            }
        }
    }

    clearAllMeasurements() {
        this.measureRecords.forEach(record => {
            this.measureGroup.remove(record.group);
        });
        this.measureRecords.clear();
        this.clearMeasurementPreview();
        if (this.onMeasureUpdate) {
            this.onMeasureUpdate([]);
        }
        this.markSceneDirty();
    }

    clearMeasurementPreview() {
        const context = this.getMeasurementContext();
        const result = applyClearMeasurementPreview(context);
        this.syncMeasurementState(result.state);
        if (result.needsRender) this.markSceneDirty();
    }

    // --- 剖切逻辑 ---

    setupClipping() {
        const result = applySetupClipping(this.getClippingContext());
        this.syncClippingState(result.state);
        this.markSceneDirty();
    }

    setClipHelperOptions(options: { visible?: boolean; opacity?: number }) {
        const result = applySetClipHelperOptions(this.getClippingContext(), options);
        this.syncClippingState(result.state);
        if (result.needsRender) this.markSceneDirty();
    }

    setClippingEnabled(enabled: boolean) {
        this.renderer.clippingPlanes = enabled ? this.clippingPlanes : [];
        if (!enabled) {
            this.clipPlaneHelpers.forEach(h => h.visible = false);
        }
        this.markSceneDirty();
    }

    updateClippingPlanes(bounds: THREE.Box3, values: { x: number[], y: number[], z: number[] }, active: { x: boolean, y: boolean, z: boolean }) {
        const result = applyUpdateClippingPlanes(this.getClippingContext(), bounds, values, active);
        this.syncClippingState(result.state);
        if (result.needsRender) this.markSceneDirty();
    }

    /**
     * 检查包围盒是否完全被当前剖切面裁剪掉
     * 如果包围盒完全在任意一个激活的剖切面的“背面”，则认为被裁剪
     */
    private isBoxClipped(box: THREE.Box3): boolean {
        return isBoxClippedByPlanes(this.clippingPlanes, box);
    }

    /** 调试/评估用：统计实例世界尺寸分布，判断“远景剔除小构件”这类 LOD 的收益。 */
    getInstanceSizeStats(thresholds: number[] = [0.02, 0.05, 0.1, 0.2, 0.5, 1]) {
        const meshes: THREE.BatchedMesh[] = [];
        for (const chunk of this.chunks) {
            if (chunk?.mesh) meshes.push(chunk.mesh as THREE.BatchedMesh);
        }
        let totalVerts = 0;
        let totalInstances = 0;
        const instanceSizes: number[] = [];
        const geos: Array<{ diag: number; verts: number; maxWorldDiag: number }> = [];
        const box = new THREE.Box3();
        const size = new THREE.Vector3();
        const matrix = new THREE.Matrix4();

        for (const mesh of meshes) {
            const count = Number((mesh as any).instanceCount) || 0;
            const geoMap = new Map<number, { diag: number; verts: number; maxWorldDiag: number }>();
            for (let i = 0; i < count; i++) {
                const gid = getBatchedGeometryId(mesh, i);
                if (gid === null) continue;
                let geo = geoMap.get(gid);
                if (!geo) {
                    const geometryBox = (mesh as any).getBoundingBoxAt?.(gid, box);
                    const range = (mesh as any).getGeometryRangeAt?.(gid, {});
                    const diag = geometryBox ? geometryBox.getSize(size).length() : 0;
                    geo = { diag, verts: Number(range?.vertexCount) || 0, maxWorldDiag: 0 };
                    geoMap.set(gid, geo);
                    geos.push(geo);
                    totalVerts += geo.verts;
                }
                mesh.getMatrixAt(i, matrix);
                const e = matrix.elements;
                const scale = (Math.abs(e[0]) + Math.abs(e[5]) + Math.abs(e[10])) / 3;
                const worldDiag = geo.diag * scale;
                if (worldDiag > geo.maxWorldDiag) geo.maxWorldDiag = worldDiag;
                instanceSizes.push(worldDiag);
                totalInstances++;
            }
        }

        const sorted = instanceSizes.slice().sort((a, b) => a - b);
        const percentile = (p: number) => sorted.length
            ? Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(3))
            : 0;
        const distribution = thresholds.map((threshold) => {
            const keptInstances = sorted.filter((value) => value >= threshold).length;
            let keptVerts = 0;
            for (const geo of geos) {
                if (geo.maxWorldDiag >= threshold) keptVerts += geo.verts;
            }
            return {
                threshold,
                instanceKeepPercent: totalInstances ? Number((keptInstances / totalInstances * 100).toFixed(1)) : 0,
                vertexKeepPercent: totalVerts ? Number((keptVerts / totalVerts * 100).toFixed(1)) : 0
            };
        });

        return {
            meshes: meshes.length,
            totalInstances,
            totalVerts,
            percentiles: { p10: percentile(0.1), p25: percentile(0.25), p50: percentile(0.5), p75: percentile(0.75), p90: percentile(0.9) },
            distribution
        };
    }

    getStats(): SceneManagerStats {
        return collectSceneManagerStats({
            renderer: this.renderer,
            contentGroup: this.contentGroup,
            originalStats: this.originalStats,
            chunkLoadedCount: this.chunkLoadedCount,
            chunksLength: this.chunks.length,
            processingChunkCount: this.processingChunks.size,
            activePixelRatio: this.activePixelRatio
        });
    }

    /**
     * 调试用：按类别估算当前内存占用（MB）。
     * 只读，不改变状态；用于定位“每块 6.5MB”到底花在哪（合并缓冲 / CPU 源数组 / 边线 / 属性 / 结构树）。
     */
    getMemoryReport() {
        const perf = (performance as any)?.memory;
        const bytesOf = (geometry?: THREE.BufferGeometry | null) => {
            if (!geometry) return 0;
            let total = 0;
            const attributes = geometry.attributes || {};
            for (const name in attributes) {
                const array = (attributes as any)[name]?.array;
                if (array?.byteLength) total += array.byteLength;
            }
            const index = (geometry as any).index;
            if (index?.array?.byteLength) total += index.array.byteLength;
            return total;
        };

        let batchedBytes = 0;
        let sourceBytes = 0;
        let instanceCount = 0;
        let batchedMeshCount = 0;
        let sourceGeometryCount = 0;
        let estimatedResidentMB = 0;

        for (const chunk of this.chunks) {
            if (chunk?.loaded) estimatedResidentMB += this.getChunkCostMB(chunk);
            const mesh = chunk?.mesh as THREE.BatchedMesh | undefined;
            if (!mesh) continue;
            batchedMeshCount++;
            batchedBytes += bytesOf(mesh.geometry);
            instanceCount += Number((mesh as any).instanceCount) || 0;
            // 逐实例几何视图现在按需创建，只统计真正存在的视图（position/normal 共享合并缓冲，
            // 仅索引副本占额外内存）。
            const viewStats = getBatchedGeometryViewStats(mesh);
            sourceGeometryCount += viewStats.count;
            sourceBytes += viewStats.bytes;
        }

        let readCacheBytes = 0;
        for (const buffer of this.chunkReadCache.values()) readCacheBytes += buffer.byteLength;

        const edgeStats = this.displayEdges.getStats();
        const pendingDocs = this.nbimPendingDocs ? Object.keys(this.nbimPendingDocs).length : 0;
        let propertyRows = 0;
        if (this.nbimPendingDocs) {
            for (const key in this.nbimPendingDocs) {
                const doc = this.nbimPendingDocs[key];
                if (Array.isArray(doc?.rows)) propertyRows += doc.rows.length;
            }
        } else {
            for (const doc of this.nbimAllSearchDocs) {
                if (Array.isArray(doc?.rows)) propertyRows += doc.rows.length;
            }
        }

        let structureNodes = 0;
        if (this.structureRoot) {
            const stack: any[] = [this.structureRoot];
            while (stack.length > 0) {
                const node = stack.pop();
                structureNodes++;
                if (Array.isArray(node?.children)) stack.push(...node.children);
            }
        }

        const toMB = (bytes: number) => Number((bytes / 1048576).toFixed(2));
        return {
            heap: {
                usedMB: perf ? Number((perf.usedJSHeapSize / 1048576).toFixed(1)) : null,
                limitMB: perf ? Number((perf.jsHeapSizeLimit / 1048576).toFixed(0)) : null
            },
            chunks: {
                total: this.chunks.length,
                loaded: this.chunkLoadedCount,
                processing: this.processingChunks.size,
                residentBudgetMB: Number(this.chunkResidentBudgetMB.toFixed(1)),
                estimatedResidentMB: Number(estimatedResidentMB.toFixed(1)),
                maxLoadedChunks: this.maxLoadedChunks,
                cachedMeshes: this.chunkMeshCache.size,
                coarseLod: this.chunks.reduce((sum, chunk) => sum + (chunk?.lodLevel === 1 ? 1 : 0), 0)
            },
            geometry: {
                batchedMeshCount,
                batchedBytesMB: toMB(batchedBytes),
                sourceGeometryCount,
                sourceBytesMB: toMB(sourceBytes),
                instanceCount,
                instanceMetaMB: Number(((instanceCount * 88) / 1048576).toFixed(1))
            },
            edges: { objects: edgeStats.count, bytesMB: toMB(edgeStats.bytes) },
            properties: {
                pendingDocs,
                indexedDocs: this.nbimAllSearchDocs.length,
                searchDocsByUuid: this.nbimSearchDocsByUuid.size,
                searchDocsByBimId: this.nbimSearchDocsByBimId.size,
                propertyNameIndex: this.nbimPropertyNameIndex.size,
                rows: propertyRows
            },
            structure: {
                nodes: structureNodes,
                nodeMap: this.nodeMap.size,
                bimIdToNodeIds: this.bimIdToNodeIds.size
            },
            caches: {
                readCacheEntries: this.chunkReadCache.size,
                readCacheMB: toMB(readCacheBytes),
                readCacheBudgetMB: this.resolvedChunkOptions.chunkReadCacheMB
            },
            render: {
                drawCalls: this.renderer.info.render.calls,
                triangles: this.renderer.info.render.triangles
            }
        };
    }

    dispose() {
        this.disposed = true;
        this.renderProxy?.dispose();
        this.renderProxy = null;
        this.animateFramePending = false;
        this.cancelCameraFlight();
        this.cancelBoxSelect();
        disposeSceneManagerResources({
            cancelDeferredStructureBuild: () => this.cancelDeferredStructureBuild(),
            clearLocateFocus: () => this.clearLocateFocus(),
            releaseGhostLine: (line) => this.releaseGhostLine(line),
            clearChunkCache: () => this.clearChunkCache(),
            controls: this.controls,
            selectionBox: this.selectionBox,
            highlightMesh: this.highlightMesh,
            tempMarker: this.tempMarker,
            dotTexture: this.dotTexture,
            sharedMaterial: this.sharedMaterial,
            ghostEdgesGeometry: this.ghostEdgesGeometry,
            ghostMaterial: this.ghostMaterial,
            renderer: this.renderer,
            ghostGroup: this.ghostGroup,
            workers: this.workers,
            workerQueue: this.workerQueue,
            logicTimer: this.logicTimer,
            animationFrameId: this.animationFrameId,
            onAnimationFrameDisposed: () => {
                this.animationFrameId = null;
            },
            onWorkersDisposed: () => {
                this.workers = [];
                this.activeWorkerCount = 0;
            },
            onQueuesReset: () => {
                this.processingChunks.clear();
                this.cancelledChunkIds.clear();
                this.prefetchQueue = [];
                this.prefetchQueueSet.clear();
                this.prefetchInFlight.clear();
                this.chunkReadCache.clear();
                this.chunkReadCacheOrder = [];
            },
            onStateCachesReset: () => {
                this.highlightedUuids.clear();
                this.locateResultSet.clear();
                this.fastPreviewModels.clear();
                this.ghostMeshPool.length = 0;
            }
        });
    }
}

export type { PerformancePreset, SceneChunkOptions, SceneManagerOptions };
export type { MeasurementRecord, MeasureType, SceneManagerStats, SceneSettings, StructureTreeNode };



