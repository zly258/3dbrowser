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
import { readNbimHeader, readNbimManifest, type NbimManifest } from "../scene-core/nbimIO";
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
    hasValidChunkBinaryRange as hasValidChunkBinaryRangeValue,
    readChunkBuffer as readChunkBufferValue
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
    collectIfcModelReferences,
    collectNbimBimProperties,
    countStructureRenderableNodes,
    createNbimContainerGroup,
    deriveDefaultNbimStem,
    encodeNbimManifest,
    groupNbimPropertiesByOwner,
    prepareNbimExportChunks,
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
    applyHighlightObjects,
    applySetLocateResultSet
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
    dirLight: THREE.DirectionalLight;
    backLight: THREE.DirectionalLight;

    // 结构树
    structureRoot: StructureTreeNode = { id: 'root', name: 'Root', type: 'Group', children: [] };
    private nodeMap = new Map<string, StructureTreeNode[]>();
    private bimIdToNodeIds = new Map<string, string[]>();

    selectionBox: THREE.Box3Helper;
    highlightMesh: THREE.Mesh;
    private lastSelectedUuid: string | null = null; // 优化高亮，记录上次选中的 UUID
    private highlightedUuids: Set<string> = new Set();
    private locateFocusUuid: string | null = null;
    private locateResultSet = new Set<string>();
    private locateMaterialCache = new Map<string, { transparent: boolean; opacity: number; depthWrite: boolean }>();
    private locateObjectMaterialCache = new Map<string, THREE.Material | THREE.Material[]>();
    private locateDimmedInstances = new Map<string, { mesh: THREE.BatchedMesh; instanceId: number; originalColor: number; originalVisible: boolean }>();
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
        ambientInt: 2.0,
        dirInt: 1.0,
        bgColor: "#edf0f3",
        viewCubeSize: 100,
        colorSpace: 'srgb',
        toneMapping: 'aces',
        exposure: 1,
        shadowQuality: 'medium',
        adaptiveQuality: true,
        minPixelRatio: 0.8,
        maxPixelRatio: 2,
        targetFps: 50,
        performanceMode: 'balanced',
        highlightColor: "#ff9f1c",
        highlightShowBox: false,
        backLightInt: 0.5,
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
    private sharedMaterial = new THREE.MeshStandardMaterial({
        color: 0xd9dce1,
        roughness: 0.82,
        metalness: 0.03,
        side: THREE.DoubleSide
    });

    // 拾取优化
    private interactableList: THREE.Object3D[] = [];
    private interactableListValid: boolean = false;
    private _needsBoundsUpdate: boolean = false;

    // 回调
    onStructureUpdate?: () => void;
    onMeasureUpdate?: (records: MeasurementRecord[]) => void;
    onChunkProgress?: (loaded: number, total: number) => void;

    private lastReportedProgress = { loaded: -1, total: -1 };
    private lastChunkProgressReportAt = 0;
    private chunkLoadedCount: number = 0;
    private chunkPadding = 0.2;
    private maxConcurrentChunkLoads = 128; // 提高并发
    private maxChunkLoadsPerFrame = 64;   // 提高并发
    private maxLoadedChunks = 512;        // 最大已加载分块数，超过则卸载最远的
    private maxCachedChunks = 48;
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
    private isCameraMoving = false;
    private activePixelRatio = 1;
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
        if (options.performancePreset) {
            this.settings.performanceMode = options.performancePreset;
        }
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        // 为点生成简单的圆形精灵纹理
        this.dotTexture = this.createCircleTexture();
        this.clock = new THREE.Clock();
        this.initHardwareProfile();

        this.ghostEdgesGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
        this.ghostMaterial = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.3 });

        // 渲染器
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            logarithmicDepthBuffer: false, // 正交相机不建议开启对数深度缓冲区，会导致 negative near 裁剪问题
            precision: "highp",
            powerPreference: "high-performance"
        });
        // 重要：设置初始大小
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 限制最大像素比为2，平衡性能与清晰度
        this.renderer.setSize(width, height, false);
        this.renderer.setClearColor(this.settings.bgColor);
        this.renderer.localClippingEnabled = true;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.04;
        this.activePixelRatio = this.renderer.getPixelRatio();

        // 场景
        this.scene = new THREE.Scene();

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
        });
        this.controls.addEventListener('end', () => {
            const now = performance.now();
            const profile = this.getChunkRuntimeProfile();
            this.isCameraMoving = false;
            this.prefetchPaused = false;
            this.chunkLoadResumeAt = now + Math.max(24, Math.floor(profile.resumeAfterMoveMs * 0.75));
            this.postMoveRecoveryUntil = now + profile.postMoveRecoveryMs;
            this.interactionShadowRestoreAt = now + this.interactionShadowRestoreDelayMs;
            this.movingPeripheralLastRefreshAt = 0;
            this.movingPeripheralCursor = 0;
            this.markSceneDirty({ needsCulling: true });
        });

        // 灯光
        this.ambientLight = new THREE.AmbientLight(0xf7f8fb, this.settings.ambientInt);
        this.scene.add(this.ambientLight);
        this.dirLight = new THREE.DirectionalLight(0xfffcf6, this.settings.dirInt);
        this.dirLight.position.set(60, 45, 110);
        this.scene.add(this.dirLight);
        this.backLight = new THREE.DirectionalLight(0xe9eef6, this.settings.backLightInt ?? 0.5);
        this.backLight.position.set(-40, -35, 30);
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
        this.markSceneDirty();
    }

    /** 按需调度一帧：合并多次调用，在相机静止且无后台任务时不常驻 requestAnimationFrame */
    requestRender() {
        if (this.disposed) return;
        if (this.animateFramePending) return;
        this.animateFramePending = true;
        this.animationFrameId = requestAnimationFrame(this.animate);
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
        this.settings = { ...this.settings, ...newSettings };
        this.applyHighlightSettings();
        if (newSettings.clip) {
            this.setClipHelperOptions({
                visible: newSettings.clip.helperVisible,
                opacity: newSettings.clip.helperOpacity
            });
        }

        // 应用光照
        this.ambientLight.intensity = this.settings.ambientInt;
        this.dirLight.intensity = this.settings.dirInt;
        this.backLight.intensity = this.settings.backLightInt ?? 0.5;

        // 应用渲染色彩链路
        this.renderer.outputColorSpace = this.settings.colorSpace === 'linear'
            ? THREE.LinearSRGBColorSpace
            : THREE.SRGBColorSpace;
        this.renderer.toneMapping = this.settings.toneMapping === 'none'
            ? THREE.NoToneMapping
            : this.settings.toneMapping === 'neutral'
                ? THREE.NeutralToneMapping
                : THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = this.settings.exposure ?? 1;

        // 应用背景
        this.renderer.setClearColor(this.settings.bgColor);

        // 应用视锥体剔除
        if (newSettings.frustumCulling !== undefined) {
            this.contentGroup.traverse(obj => {
                if ((obj as THREE.Mesh).isMesh) {
                    obj.frustumCulled = newSettings.frustumCulling!;
                } else if ((obj as any).isBatchedMesh) {
                    // BatchedMesh 由 SceneManager 的分块逻辑控制可见性，
                    // 禁用其内部剔除以防止靠近消失的问题
                    obj.frustumCulled = false;
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

        this.renderer.render(this.scene, this.camera);

        const chunksIncomplete = this.chunkLoadingEnabled && this.chunks.length > 0 && this.chunkLoadedCount < this.chunks.length;
        const locatingPulse = !!(this.locateFocusUuid && (this.highlightMesh.visible || this.selectionBox.visible));
        const keepLoop =
            this.isCameraMoving ||
            this.isInPostMoveRecovery(now) ||
            this.processingChunks.size > 0 ||
            this.chunkWarmupActive ||
            chunksIncomplete ||
            locatingPulse;

        if (keepLoop) {
            this.requestRender();
        }
    }

    private updateAdaptiveQuality() {
        if (!this.settings.adaptiveQuality) return;

        const deviceRatio = window.devicePixelRatio || 1;
        const minRatio = Math.min(deviceRatio, this.settings.minPixelRatio ?? 0.8);
        const maxRatio = Math.min(deviceRatio, this.settings.maxPixelRatio ?? 2);
        const chunkCount = this.chunks.length;
        const meshCount = this.originalStats.meshes;
        const mode = this.settings.performanceMode ?? 'balanced';

        let desiredRatio = maxRatio;
        if (this.isCameraMoving) {
            const movingScale = mode === 'quality'
                ? (chunkCount > 3500 || meshCount > 250000
                    ? 0.68
                    : chunkCount > 1600 || meshCount > 120000
                        ? 0.76
                        : 0.84)
                : mode === 'smooth'
                    ? (chunkCount > 3500 || meshCount > 250000
                        ? 0.44
                        : chunkCount > 1600 || meshCount > 120000
                            ? 0.52
                            : 0.6)
                    : (chunkCount > 3500 || meshCount > 250000
                        ? 0.48
                        : chunkCount > 1600 || meshCount > 120000
                            ? 0.56
                            : 0.65);
            desiredRatio = Math.max(minRatio, maxRatio * movingScale);
        }

        desiredRatio = Math.max(minRatio, Math.min(maxRatio, desiredRatio));
        if (Math.abs(desiredRatio - this.activePixelRatio) < 0.05) return;

        this.activePixelRatio = desiredRatio;
        this.renderer.setPixelRatio(desiredRatio);
        const rect = this.canvas.getBoundingClientRect();
        this.renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
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
            this.maxWorkers = Math.max(4, Math.min(12, cpuCount - 1));
            this.maxConcurrentChunkLoads = Math.max(128, Math.min(192, this.maxWorkers * 24));
            this.maxChunkLoadsPerFrame = Math.max(64, Math.min(128, this.maxWorkers * 14));
            this.cullingTimeBudgetMovingMs = 7.5;
            this.cullingTimeBudgetRecoveryMs = 10.5;
            this.cullingTimeBudgetIdleMs = 14.0;
            this.chunkRegistrationBatchSize = 28;
            this.chunkGhostBatchSize = 40;
        } else {
            this.maxWorkers = 4;
            this.maxConcurrentChunkLoads = runtime.maxConcurrentChunkLoads;
            this.maxChunkLoadsPerFrame = runtime.maxChunkLoadsPerFrame;
        }
        this.maxLoadedChunks = memoryGb <= 4 ? 160 : memoryGb <= 8 ? 320 : 640;
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
            chunkReadCacheOrder: this.chunkReadCacheOrder,
            chunkReadCacheSize: this.resolvedChunkOptions.chunkReadCacheSize
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
                this.registerChunk({
                    id: chunkId,
                    bounds: chunkBounds,
                    paddedBounds,
                    _padding: this.chunkPadding,
                    center: chunkBounds.getCenter(new THREE.Vector3()),
                    loaded: false,
                    node,
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
        if (!this.canvas) return;

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

        cam.left = -halfWidth;
        cam.right = halfWidth;
        cam.top = halfHeight;
        cam.bottom = -halfHeight;

        cam.updateProjectionMatrix();

        const maxRatio = this.settings.adaptiveQuality
            ? Math.min(window.devicePixelRatio, this.settings.maxPixelRatio ?? 2)
            : Math.min(window.devicePixelRatio, 2);
        this.activePixelRatio = maxRatio;
        this.renderer.setPixelRatio(maxRatio);
        this.renderer.setSize(w, h, false);

        // 如果使用了 OrbitControls，需要更新它
        if (this.controls) {
            this.controls.update();
        }

        this.markSceneDirty({ needsCulling: true });
    }

    private reportChunkProgress() {
        const result = reportChunkProgressIfNeeded({
            now: performance.now(),
            total: this.chunks.length,
            loaded: this.chunkLoadedCount,
            lastReportedProgress: this.lastReportedProgress,
            lastChunkProgressReportAt: this.lastChunkProgressReportAt
        });
        if (this.onChunkProgress && result.shouldNotify) {
            this.lastReportedProgress = result.nextProgress;
            this.lastChunkProgressReportAt = result.nextReportedAt;
            this.onChunkProgress(result.nextProgress.loaded, result.nextProgress.total);
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

        const toLoad: any[] = [];
        const loadedChunks: any[] = [];
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
                chunkMeshCached: this.chunkMeshCache.has(c.id)
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
            } else if (!this.processingChunks.has(c.id) && evaluation.shouldBeVisible && evaluation.priority !== null) {
                c.priority = evaluation.priority;
                toLoad.push(c);
            }
        }
        if (!abortedByBudget) {
            this.cullingScanCursor = (startIndex + totalChunks) % Math.max(totalChunks, 1);
        }

        const unloadTargets = selectChunksToUnload({
            isCameraMoving: this.isCameraMoving,
            loadedChunks,
            maxLoadedChunks: this.maxLoadedChunks,
            cameraPos,
            now,
            chunkResidencyMs: this.chunkResidencyMs
        });
        for (const chunk of unloadTargets) {
            this.unloadChunk(chunk);
        }
        if (unloadTargets.length > 0) {
            sceneMutated = true;
        }

        const loadPlan = planChunkLoads({
            toLoad,
            now: performance.now(),
            chunkLoadResumeAt: this.chunkLoadResumeAt,
            maxConcurrentChunkLoads: this.maxConcurrentChunkLoads,
            processingChunkCount: this.processingChunks.size,
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
        }

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
            unregisterOptimizedMeshMapping: (mesh) => this.unregisterOptimizedMeshMapping(mesh),
            cacheChunkMesh: (nextChunk, mesh) => this.cacheChunkMesh(nextChunk, mesh),
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
            const { mesh: bm, prefetchCandidates } = await resolveChunkMeshForLoad({
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
                    registerOptimizedMeshMapping: (mesh) => this.registerOptimizedMeshMapping(mesh)
                });
                loadedNow = attached.attached;
                if (loadedNow) {
                    invalidateInteractables = true;
                    needsBoundsUpdate = true;
                    needsRender = true;
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

    private applyNbimScaleTuning(chunkCount: number) {
        const userChunkOptions = this.options.chunkOptions || {};
        const autoTuned = chunkCount >= 2000
            ? { chunkPrefetchWindow: 0, chunkReadCacheSize: 128, targetMinFps: 20 }
            : chunkCount <= 1000
                ? { chunkPrefetchWindow: 0, chunkReadCacheSize: 128, targetMinFps: 20 }
                : { chunkPrefetchWindow: 0, chunkReadCacheSize: 128, targetMinFps: 20 };

        this.setChunkOptions({
            chunkPrefetchWindow: userChunkOptions.chunkPrefetchWindow ?? autoTuned.chunkPrefetchWindow,
            chunkReadCacheSize: userChunkOptions.chunkReadCacheSize ?? autoTuned.chunkReadCacheSize,
            targetMinFps: userChunkOptions.targetMinFps ?? autoTuned.targetMinFps,
            ghostMode: userChunkOptions.ghostMode ?? this.resolvedChunkOptions.ghostMode,
            loadProfile: userChunkOptions.loadProfile ?? this.resolvedChunkOptions.loadProfile,
            deferIfcProperties: userChunkOptions.deferIfcProperties ?? this.resolvedChunkOptions.deferIfcProperties,
            preferWorkerOctree: userChunkOptions.preferWorkerOctree ?? this.resolvedChunkOptions.preferWorkerOctree,
            fastGeometrySanitize: userChunkOptions.fastGeometrySanitize ?? this.resolvedChunkOptions.fastGeometrySanitize
        });
    }

    setChunkOptions(options: SceneChunkOptions = {}) {
        const resolved = resolveSceneChunkOptions(options);
        this.resolvedChunkOptions.chunkReadCacheSize = resolved.chunkReadCacheSize;
        this.resolvedChunkOptions.chunkPrefetchWindow = resolved.chunkPrefetchWindow;
        this.resolvedChunkOptions.ghostMode = resolved.ghostMode;
        this.resolvedChunkOptions.targetMinFps = resolved.targetMinFps;
        this.resolvedChunkOptions.loadProfile = resolved.loadProfile;
        this.resolvedChunkOptions.deferIfcProperties = resolved.deferIfcProperties;
        this.resolvedChunkOptions.preferWorkerOctree = resolved.preferWorkerOctree;
        this.resolvedChunkOptions.fastGeometrySanitize = resolved.fastGeometrySanitize;
        this.settings.targetFps = resolved.targetMinFps;

        while (this.chunkReadCacheOrder.length > this.resolvedChunkOptions.chunkReadCacheSize) {
            const evict = this.chunkReadCacheOrder.shift();
            if (!evict) continue;
            this.chunkReadCache.delete(evict);
        }
    }

    getChunkOptions() {
        return {
            chunkReadCacheSize: this.resolvedChunkOptions.chunkReadCacheSize,
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

        // 1. 彻底移除相关的优化组 (针对 NBIM / 实例化分块)
        // 注意：可能有多个优化组（对应不同的分块）
        const optimizedGroupsToRemove: THREE.Object3D[] = [];
        this.contentGroup.traverse(child => {
            // 匹配逻辑：名字匹配，或者 userData 里的原始 UUID 匹配
            const isMatch = (child.name === `optimized_${uuid}`) ||
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
        this.unregisterOriginalStats(originalUuid);
        this.fastPreviewModels.delete(uuid);
        this.fastPreviewModels.delete(originalUuid);
        this.clearChunkCache((chunkId, mesh) => {
            const owner = (mesh.userData.originalUuid || "") as string;
            return owner === uuid || owner === originalUuid || chunkId.startsWith(uuid) || chunkId.startsWith(originalUuid);
        });

        if (this.currentMeasureModelUuid === uuid || this.currentMeasureModelUuid === originalUuid) {
            this.currentMeasureModelUuid = null;
        }

        // 3. 移除关联的分块和鬼影
        this.chunks = this.chunks.filter(c => {
            const isMatch = c.originalUuid === uuid || c.originalUuid === originalUuid || c.id.startsWith(uuid);
            if (isMatch) {
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
        this.precomputedBounds = this.computeTotalBounds();
        if (this.precomputedBounds.isEmpty()) {
            this.contentGroup.traverse(child => {
                if ((child as any).isMesh && child.visible) {
                    const box = new THREE.Box3().setFromObject(child);
                    if (!box.isEmpty()) this.precomputedBounds.union(box);
                }
            });
        }

        this.updateSceneBounds();
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

        const { ifcApiByModel, ifcManagerByModel } = collectIfcModelReferences(this.contentGroup);
        const bimProperties = await collectNbimBimProperties({
            structureRoot: this.structureRoot,
            ifcApiByModel,
            ifcManagerByModel
        });
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
            bimProperties
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
        this.nbimFiles.set(fileId, file);

        if (onProgress) onProgress(10, "正在解析 NBIM 文件头...");
        const header = await readNbimHeader(file);
        const magic = header.magic;
        if (magic !== 0x4D49424E) throw new Error("不是有效的 NBIM 文件");

        const version = header.version;
        if (version !== 8) {
            throw new Error(`不支持的 NBIM 版本: ${version}，当前仅支持 V8`);
        }

        if (onProgress) onProgress(20, "正在读取元数据...");
        const manifest = await readNbimManifest(file, header) as NbimManifest;

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

        const modelRoot = manifest.structureTree;
        appendNbimStructure({
            structureRoot: this.structureRoot,
            modelRoot
        });

        const rootId = modelRoot?.id || fileId;
        const manifestBimProperties = (manifest?.bimProperties && typeof manifest.bimProperties === "object")
            ? manifest.bimProperties as Record<string, any>
            : {};

        // 从属性键中提取实际 owner（格式 "<owner>::<bimId>"）
        const { defaultOwner, grouped } = groupNbimPropertiesByOwner(manifestBimProperties, rootId);
        grouped.forEach((props, owner) => this.nbimPropsByOriginalUuid.set(owner, props));
        const quickStats = buildNbimQuickStats({
            manifestStats: manifest.stats,
            modelRoot,
            chunks: manifest.chunks
        });
        this.registerOriginalStats(rootId, quickStats);

        // 为 NBIM 创建一个容器组
        const fileGroup = createNbimContainerGroup({
            fileName: file.name,
            modelRootName: typeof modelRoot?.name === "string" ? modelRoot.name : "",
            rootId
        });
        this.contentGroup.add(fileGroup);
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

        // 注册分块
        if (onProgress) onProgress(30, "正在初始化分块...");

        const chunkEntries = Array.isArray(manifest.chunks) ? manifest.chunks : [];
        this.applyNbimScaleTuning(chunkEntries.length);
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
            registerChunk: (chunk) => this.registerChunk(chunk),
            createGhostLine: (name, bounds) => this.createGhostLine(name, bounds),
            addGhostLine: (line) => this.ghostGroup.add(line),
            yieldToMainThread: () => this.yieldToMainThread()
        });
        if (deferredGhostSpecs.length > 0) {
            void this.createChunkGhostsProgressively(deferredGhostSpecs);
        }

        this.reportChunkProgress();

        this.fitView(true);
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
                this.unregisterOriginalStats(rootId);
                this.registerOriginalStats(rootId, stats);
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

            // 2. 清理辅助组
            while (this.ghostGroup.children.length > 0) {
                const ghost = this.ghostGroup.children[0];
                this.ghostGroup.remove(ghost);
                this.releaseGhostLine(ghost as THREE.LineSegments);
            }
            this.ghostMeshPool.length = 0;

            this.selectionBox.visible = false;
            this.highlightMesh.visible = false;

            // 3. 清理测量记录
            this.clearAllMeasurements();

            // 4. 清理状态数据
            this.optimizedMapping.clear();
            this.sceneBounds.makeEmpty();
            this.precomputedBounds.makeEmpty();
            this.nbimFiles.clear();
            this.nbimMeta.clear();
            this.nbimPropsByOriginalUuid.clear();
            this.structureRoot = { id: 'root', name: 'Root', type: 'Group', children: [] };
            this.nodeMap.clear();
            this.bimIdToNodeIds.clear();
            this.chunks = [];
            this.chunkIdSet.clear();
            this.chunkById.clear();
            this.chunkIndexById.clear();
            this.lastReportedProgress = { loaded: -1, total: -1 };
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
                lastSelectedUuid: this.lastSelectedUuid
            },
            locateMaterialCache: this.locateMaterialCache,
            locateObjectMaterialCache: this.locateObjectMaterialCache,
            locateDimmedInstances: this.locateDimmedInstances,
            clearClashPairHighlight: () => this.clearClashPairHighlight(),
            nodeMap: this.nodeMap
        };
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

    private syncHighlightState(state: { highlightedUuids: Set<string>; locateResultSet: Set<string>; locateFocusUuid: string | null; lastSelectedUuid: string | null; }) {
        this.highlightedUuids = state.highlightedUuids;
        this.locateResultSet = state.locateResultSet;
        this.locateFocusUuid = state.locateFocusUuid;
        this.lastSelectedUuid = state.lastSelectedUuid;
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
        const instanceMatrix = new THREE.Matrix4();
        const worldMatrix = new THREE.Matrix4();
        this.optimizedMapping.forEach((mappings, originalUuid) => {
            const isVisible = this.nodeMap.get(originalUuid)?.some((node) => node.visible !== false) ?? true;
            if (!isVisible) return;
            mappings.forEach((mapping) => {
                const key = `${mapping.mesh.uuid}:${mapping.instanceId}`;
                if (this.explodeInstanceStates.has(key)) return;
                mapping.mesh.getMatrixAt(mapping.instanceId, instanceMatrix);
                const geometry = mapping.geometry || mapping.mesh.geometry;
                if (!geometry?.boundingBox) geometry?.computeBoundingBox?.();
                if (!geometry?.boundingBox) return;
                worldMatrix.copy(mapping.mesh.matrixWorld).multiply(instanceMatrix);
                instanceBox.copy(geometry.boundingBox).applyMatrix4(worldMatrix);
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
            if (state.mesh.instanceMatrix) state.mesh.instanceMatrix.needsUpdate = true;
        });

        this.interactableListValid = false;
        this.updateSceneBounds();
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
            if (state.mesh.instanceMatrix) state.mesh.instanceMatrix.needsUpdate = true;
        });
        this.interactableListValid = false;
        this.updateSceneBounds();
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
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
            if (touched && batched.instanceColor) batched.instanceColor.needsUpdate = true;
        });

        this.clashPairUuids = new Set([normalizedA, normalizedB]);
        this.markSceneDirty();
    }

    clearLocateFocus() {
        const context = this.getHighlightContext();
        const result = applyClearLocateFocus(context);
        this.syncHighlightState(context.state);
        if (result.needsRender) this.markSceneDirty();
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

    highlightObjects(uuids: string[]) {
        const context = this.getHighlightContext();
        const result = applyHighlightObjects(context, uuids);
        this.syncHighlightState(context.state);
        if (result.needsRender) this.markSceneDirty();
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

    fitView(keepOrientation = true) {
        this.contentGroup.updateMatrixWorld(true);
        let box = this.computeTotalBounds(true);

        // 如果可见部分为空，尝试使用完整包围盒
        if (box.isEmpty()) {
            box = this.computeTotalBounds(false);
        }

        this.sceneBounds = box.clone();
        this.fitBox(box, !keepOrientation);
    }

    private unionObjectBounds(obj: THREE.Object3D, targetBox: THREE.Box3) {
        const box = new THREE.Box3();
        if (obj.userData?.boundingBox) {
            box.copy(obj.userData.boundingBox).applyMatrix4(obj.matrixWorld);
        } else {
            box.setFromObject(obj);
        }
        if (!box.isEmpty()) targetBox.union(box);
    }

    private unionTilesNodeBounds(node: any, targetBox: THREE.Box3) {
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

    private unionOptimizedBounds(uuid: string, targetBox: THREE.Box3) {
        const mappings = this.optimizedMapping.get(uuid);
        if (!mappings || mappings.length === 0) return;

        const instanceMatrix = new THREE.Matrix4();
        for (const mapping of mappings) {
            const geometry = mapping.geometry || mapping.mesh.geometry;
            if (!geometry.boundingBox) geometry.computeBoundingBox();
            if (!geometry.boundingBox) continue;
            mapping.mesh.getMatrixAt(mapping.instanceId, instanceMatrix);
            instanceMatrix.premultiply(mapping.mesh.matrixWorld);
            const box = geometry.boundingBox.clone().applyMatrix4(instanceMatrix);
            if (!box.isEmpty()) targetBox.union(box);
        }
    }

    private unionNodeBounds(uuid: string, targetBox: THREE.Box3, visited = new Set<string>()) {
        if (!uuid || visited.has(uuid)) return;
        visited.add(uuid);

        const obj = this.contentGroup.getObjectByProperty("uuid", uuid);
        if (obj) {
            this.unionObjectBounds(obj, targetBox);
        }

        this.unionOptimizedBounds(uuid, targetBox);

        const nodes = this.nodeMap.get(uuid) || [];
        for (const node of nodes) {
            this.unionTilesNodeBounds(node, targetBox);
            const children = Array.isArray(node.children) ? node.children : [];
            for (const child of children) {
                this.unionNodeBounds(child.id, targetBox, visited);
            }
        }
    }

    fitViewToObject(uuid: string) {
        let box = collectRenderableBoundsForIds(this.getHighlightContext(), [uuid]);
        if (box.isEmpty()) {
            box = new THREE.Box3();
            this.unionNodeBounds(uuid, box);
        }
        if (!box.isEmpty()) this.fitBox(box, false, 1.14);
    }

    getBoundsForObject(uuid: string) {
        if (!uuid) return null;
        let box = collectRenderableBoundsForIds(this.getHighlightContext(), [uuid]);
        if (box.isEmpty()) {
            box = new THREE.Box3();
            this.unionNodeBounds(uuid, box);
        }
        return box.isEmpty() ? null : box;
    }

    collectBoundsForUuids(uuids: string[]) {
        const renderableBox = collectRenderableBoundsForIds(this.getHighlightContext(), uuids);
        if (!renderableBox.isEmpty()) return renderableBox;

        const box = new THREE.Box3();
        const unique = Array.from(new Set((uuids || []).filter(Boolean)));
        unique.forEach((uuid) => this.unionNodeBounds(uuid, box));
        return box;
    }

    fitViewToObjects(uuids: string[]) {
        const box = this.collectBoundsForUuids(uuids);
        if (!box.isEmpty()) this.fitBox(box, false, 1.14);
    }

    fitBox(box: THREE.Box3, updateCameraPosition: boolean = true, paddingOverride?: number) {
        if (box.isEmpty()) {
            this.camera.zoom = 1;
            this.camera.position.set(1000, 1000, 1000);
            this.camera.lookAt(0, 0, 0);
            this.controls.target.set(0, 0, 0);
            this.camera.updateProjectionMatrix();
            this.controls.update();
            this.markSceneDirty({ needsCulling: true });
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

        if (updateCameraPosition) {
            const offset = new THREE.Vector3(1, -1, 1).normalize();
            const dist = Math.max(extent * 2.2, 5);
            const targetPosition = center.clone().add(offset.multiplyScalar(dist));
            const targetLookAt = center.clone();

            // 动画过渡
            const startPosition = this.camera.position.clone();
            const startTarget = this.controls.target.clone();
            const startTime = performance.now();
            const duration = 600; // 600ms 动画

            const animate = () => {
                const elapsed = performance.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic

                // 插值位置
                this.camera.position.lerpVectors(startPosition, targetPosition, eased);
                this.controls.target.lerpVectors(startTarget, targetLookAt, eased);
                this.camera.lookAt(this.controls.target);

                // 插值 zoom 和边界
                this.camera.zoom = 1 + (targetZoom - 1) * eased;
                this.camera.left = this.camera.left + (targetLeft - this.camera.left) * eased;
                this.camera.right = this.camera.right + (targetRight - this.camera.right) * eased;
                this.camera.top = this.camera.top + (targetTop - this.camera.top) * eased;
                this.camera.bottom = this.camera.bottom + (targetBottom - this.camera.bottom) * eased;
                this.camera.updateProjectionMatrix();
                this.controls.update();
                this.markSceneDirty({ needsCulling: true });

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    this.markSceneDirty({ needsCulling: true });
                }
            };
            animate();
        } else {
            const direction = new THREE.Vector3();
            this.camera.getWorldDirection(direction);
            const dist = this.camera.position.distanceTo(this.controls.target);
            const targetPosition = center.clone().add(direction.multiplyScalar(-dist));
            const targetLookAt = center.clone();

            // 在保持当前视角方向的前提下，按相机朝向投影模型范围并计算充满视口所需 zoom
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
            const targetZoom = Math.max(
                1e-4,
                Math.min(1e6, Math.min(halfBaseWidth / safeHalfX, halfBaseHeight / safeHalfY))
            );

            // 动画过渡
            const startPosition = this.camera.position.clone();
            const startTarget = this.controls.target.clone();
            const startZoom = this.camera.zoom;
            const startTime = performance.now();
            const duration = 600;

            const animate = () => {
                const elapsed = performance.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);

                this.camera.position.lerpVectors(startPosition, targetPosition, eased);
                this.controls.target.lerpVectors(startTarget, targetLookAt, eased);
                this.camera.lookAt(this.controls.target);
                this.camera.zoom = startZoom + (targetZoom - startZoom) * eased;
                this.camera.updateProjectionMatrix();
                this.controls.update();
                this.markSceneDirty({ needsCulling: true });

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    this.markSceneDirty({ needsCulling: true });
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
                if (obj.geometry) {
                    if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
                    const b = obj.geometry.boundingBox!.clone();
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

    dispose() {
        this.disposed = true;
        this.animateFramePending = false;
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


