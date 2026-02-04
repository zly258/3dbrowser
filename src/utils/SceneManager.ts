import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TilesRenderer } from "3d-tiles-renderer";
import { 
    calculateGeometryMemory, 
    collectItems, 
    buildOctree, 
    collectLeafNodes,
    createBatchedMeshFromItems
} from "./octree";

export type MeasureType = 'dist' | 'angle' | 'coord' | 'none';

export interface MeasurementRecord {
    id: string;
    type: string;
    val: string;
    group: THREE.Group;
    modelUuid?: string; // 关联的模型 UUID
}

export interface SceneSettings {
    ambientInt: number;
    dirInt: number;
    bgColor: string;
    viewCubeSize?: number;
    frustumCulling?: boolean;
    maxRenderDistance?: number;
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

    // 引用
    tilesRenderer: TilesRenderer | null = null;
    selectionBox: THREE.Box3Helper;
    highlightMesh: THREE.Mesh; 
    private lastSelectedUuid: string | null = null; // 优化高亮，记录上次选中的 UUID
    private highlightedUuids: Set<string> = new Set();
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;

    // 测量状态
    measureType: MeasureType = 'none';
    currentMeasurePoints: THREE.Vector3[] = [];
    currentMeasureModelUuid: string | null = null;
    previewLine: THREE.Line | null = null;
    tempMarker: THREE.Points; 
    measureRecords: Map<string, MeasurementRecord> = new Map();
    
    // 裁剪状态
    clippingPlanes: THREE.Plane[] = [];
    clipPlaneHelpers: THREE.Mesh[] = [];
    
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
        bgColor: "#1e1e1e",
        viewCubeSize: 100,
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
    private processingChunks = new Set<string>();
    private cancelledChunkIds = new Set<string>();
    private frustum = new THREE.Frustum();
    private projScreenMatrix = new THREE.Matrix4();
    private logicTimer: any = null;
    private nbimFiles: Map<string, File> = new Map(); // 支持多文件引用
    private nbimMeta: Map<string, { version: number; bimIdTable?: string[] }> = new Map();
    private nbimPropsByOriginalUuid: Map<string, Record<string, any>> = new Map();
    private sharedMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        roughness: 0.6,
        metalness: 0.1,
        side: THREE.DoubleSide
    });

    // 拾取优化
    private interactableList: THREE.Object3D[] = [];
    private interactableListValid: boolean = false;
    private _needsBoundsUpdate: boolean = false;

    // 回调
    onTilesUpdate?: () => void;
    onStructureUpdate?: () => void;
    onMeasureUpdate?: (records: MeasurementRecord[]) => void;
    onChunkProgress?: (loaded: number, total: number) => void;

    private lastReportedProgress = { loaded: -1, total: -1 };
    private chunkLoadedCount: number = 0;
    private chunkPadding = 0.2;
    private maxConcurrentChunkLoads = 128; // 提高并发
    private maxChunkLoadsPerFrame = 64;   // 提高并发
    private maxLoadedChunks = 512;        // 最大已加载分块数，超过则卸载最远的
    private chunkLoadingEnabled = true;
    private maxRenderDistance = 1000000; // 最大渲染距离
    private _lastCullingTime: number = 0;

    // Worker 池
    private workers: Worker[] = [];
    private workerQueue: { resolve: Function, reject: Function, data: any, transferables: any[] }[] = [];
    private activeWorkerCount = 0;
    private maxWorkers = 4; // 限制固定为 4 个，平衡性能与系统开销

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        // 为点生成简单的圆形精灵纹理
        this.dotTexture = this.createCircleTexture();
        this.clock = new THREE.Clock();

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
            0.1, 200000 
        );
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(1000, 1000, 1000);
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
        
        // 灯光
        this.ambientLight = new THREE.AmbientLight(0xffffff, this.settings.ambientInt); 
        this.scene.add(this.ambientLight);
        this.dirLight = new THREE.DirectionalLight(0xffffff, this.settings.dirInt);
        this.dirLight.position.set(50, 50, 100);
        this.scene.add(this.dirLight);
        this.backLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.backLight.position.set(-50, -50, -10);
        this.scene.add(this.backLight);

        // 选择辅助器
        const box = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
        this.selectionBox = new THREE.Box3Helper(box, new THREE.Color(0xffff00));
        this.selectionBox.visible = false;
        this.helpersGroup.add(this.selectionBox);

        const highlightMat = new THREE.MeshBasicMaterial({ 
            color: 0xffaa00, 
            transparent: true, 
            opacity: 0.4, 
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide
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
        requestAnimationFrame(this.animate);
    }
    
    updateSettings(newSettings: Partial<SceneSettings>) {
        this.settings = { ...this.settings, ...newSettings };

        // 应用光照
        this.ambientLight.intensity = this.settings.ambientInt;
        this.dirLight.intensity = this.settings.dirInt;

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

        // 如果不忙则强制渲染
        this.renderer.render(this.scene, this.camera);
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

    animate() {
        requestAnimationFrame(this.animate);
        
        if (this.controls) {
            this.controls.update();
        }

        // 如果需要更新边界 (例如分块加载/卸载后)
        if (this._needsBoundsUpdate) {
            this.updateSceneBounds();
            this._needsBoundsUpdate = false;
        }

        // 先更新相机裁剪面，确保后续的视锥剔除和渲染使用正确的参数
        this.updateCameraClipping();

        // 限制 checkCullingAndLoad 的频率，避免在大场景下每帧执行昂贵的计算
        const now = performance.now();
        if (!this._lastCullingTime || now - this._lastCullingTime > 100) {
            this.checkCullingAndLoad();
            this._lastCullingTime = now;
        }

        if (this.tilesRenderer) {
            this.camera.updateMatrixWorld();
            this.tilesRenderer.update();
        }

        this.renderer.render(this.scene, this.camera);
    }
    
    updateCameraClipping() {
        if (!this.sceneBounds || this.sceneBounds.isEmpty()) return;

        if (!this.sceneSphereValid) {
            this.sceneBounds.getBoundingSphere(this.cachedSceneSphere);
            this.sceneSphereValid = true;
        }
        
        const dist = this.camera.position.distanceTo(this.cachedSceneSphere.center);
        
        // 增加更宽的裁剪范围，确保即便相机在模型内部或非常靠近时，也不会因为精度或计算误差导致裁剪
        // 使用半径的 5 倍作为基础，加上到中心的距离，确保范围足够覆盖整个可能的视锥空间
        const range = Math.max(this.cachedSceneSphere.radius * 5.0, dist + this.cachedSceneSphere.radius * 2.0);
        
        // 只有当变化显著时才更新，避免每帧都触发投影矩阵更新
        const threshold = 0.05; // 5% 的变化阈值
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
        
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(w, h, false);
        
        // 如果使用了 OrbitControls，需要更新它
        if (this.controls) {
            this.controls.update();
        }

        this.renderer.render(this.scene, this.camera);
    }

    private reportChunkProgress() {
        const total = this.chunks.length;
        const loaded = this.chunkLoadedCount;
        if (this.onChunkProgress && (loaded !== this.lastReportedProgress.loaded || total !== this.lastReportedProgress.total)) {
            this.lastReportedProgress = { loaded, total };
            this.onChunkProgress(loaded, total);
        }
    }

    private checkCullingAndLoad() {
        if (!this.chunkLoadingEnabled) return;
        if (this.chunks.length === 0) return;
        this.reportChunkProgress();

        if (this.processingChunks.size >= this.maxConcurrentChunkLoads) return;

        this.camera.updateMatrixWorld();
        this.projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

        const padding = this.chunkPadding;
        const cameraPos = this.camera.position;
        const viewHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
        const canvasHeight = this.renderer.domElement.clientHeight;

        const toLoad: any[] = [];
        const loadedChunks: any[] = [];
        const isClippingActive = this.renderer.clippingPlanes.length > 0;

        let anyNewLoaded = false;

        this.chunks.forEach(c => {
            if (!c.paddedBounds || c._padding !== padding) {
                const size = c.bounds.getSize(new THREE.Vector3());
                const pb = c.bounds.clone();
                pb.expandByVector(size.multiplyScalar(padding));
                c.paddedBounds = pb;
                c._padding = padding;
            }
            if (!c.center) c.center = c.bounds.getCenter(new THREE.Vector3());

            const inFrustum = this.frustum.intersectsBox(c.paddedBounds);
            const isClipped = isClippingActive && this.isBoxClipped(c.bounds);
            
            const dist = c.center.distanceTo(cameraPos);
            const inRange = dist < this.maxRenderDistance;
            
            // 计算屏幕空间占用大小 (SSE 优化)
            // 对于正交相机，大小与距离无关，只与 zoom 和 frustumSize 有关
            const boxSize = c.bounds.getSize(new THREE.Vector3()).length();
            const pixelSize = (boxSize / viewHeight) * canvasHeight;
            
            // 如果屏幕占比太小（例如小于 4 像素），则视为不可见 (LOD 优化)
            const isTooSmall = pixelSize < 4;

            const shouldBeVisible = inFrustum && !isClipped && inRange && !isTooSmall;

            if (c.loaded) {
                loadedChunks.push(c);
                if (c.mesh) {
                    if (c.mesh.visible !== shouldBeVisible) {
                        c.mesh.visible = shouldBeVisible;
                    }
                } else {
                    const optimizedGroup = this.contentGroup.getObjectByName(c.groupName);
                    const bm = optimizedGroup?.getObjectByName(c.id);
                    if (bm) {
                        c.mesh = bm;
                        bm.visible = shouldBeVisible;
                    }
                }
            } else if (!this.processingChunks.has(c.id) && shouldBeVisible) {
                // 计算优先级：距离越近、体积越大、越靠近屏幕中心，优先级越高
                const centerNDC = c.center.clone().applyMatrix4(this.projScreenMatrix);
                const centrality = 1.0 - Math.min(1.0, Math.sqrt(centerNDC.x * centerNDC.x + centerNDC.y * centerNDC.y));
                
                // 优先级公式：(1/距离) * 体积 * 中心度
                c.priority = (1000 / (dist + 1)) * (boxSize / 10) * (1 + centrality);
                toLoad.push(c);
            }
        });
        
        // 卸载策略
        if (loadedChunks.length > this.maxLoadedChunks) {
            loadedChunks.sort((a, b) => b.center.distanceToSquared(cameraPos) - a.center.distanceToSquared(cameraPos));
            
            let unloadedCount = 0;
            const targetUnload = loadedChunks.length - this.maxLoadedChunks;
            
            for (const c of loadedChunks) {
                if (unloadedCount >= targetUnload) break;
                if (!c.mesh || !c.mesh.visible) {
                    this.unloadChunk(c);
                    unloadedCount++;
                }
            }
        }
        
        if (toLoad.length > 0) {
            // 按优先级排序
            toLoad.sort((a, b) => b.priority - a.priority);

            const available = this.maxConcurrentChunkLoads - this.processingChunks.size;
            const count = Math.min(available, this.maxChunkLoadsPerFrame, toLoad.length);
            for (let i = 0; i < count; i++) {
                this.loadChunk(toLoad[i]);
                anyNewLoaded = true;
            }
        }
    }

    private async runWorkerTask(data: any, transferables: any[]): Promise<any> {
        return new Promise((resolve, reject) => {
            this.workerQueue.push({ resolve, reject, data, transferables });
            this.processWorkerQueue();
        });
    }

    private processWorkerQueue() {
        if (this.activeWorkerCount >= this.maxWorkers || this.workerQueue.length === 0) return;

        const task = this.workerQueue.shift()!;
        this.activeWorkerCount++;

        let worker = this.workers.pop();
        if (!worker) {
            // @ts-ignore
            worker = new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' });
        }

        const onMessage = (e: MessageEvent) => {
            worker!.removeEventListener('message', onMessage);
            worker!.removeEventListener('error', onError);
            this.workers.push(worker!);
            this.activeWorkerCount--;
            
            if (e.data.type === 'success') {
                task.resolve(e.data.result);
            } else {
                task.reject(new Error(e.data.error));
            }
            this.processWorkerQueue();
        };

        const onError = (e: ErrorEvent) => {
            worker!.removeEventListener('message', onMessage);
            worker!.removeEventListener('error', onError);
            // 发生错误时不重用该 worker
            this.activeWorkerCount--;
            task.reject(new Error(e.message));
            this.processWorkerQueue();
        };

        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.postMessage(task.data, task.transferables);
    }

    private unloadChunk(chunk: any) {
        if (!chunk.loaded || !chunk.mesh) return;

        const bm = chunk.mesh as THREE.BatchedMesh;
        
        // 1. 从优化映射中移除
        const batchIdToUuid = bm.userData.batchIdToUuid as Map<number, string>;
        if (batchIdToUuid) {
            for (const [batchId, originalUuid] of batchIdToUuid.entries()) {
                const mapping = this.optimizedMapping.get(originalUuid);
                if (mapping) {
                    const index = mapping.findIndex(m => m.mesh === bm && m.instanceId === batchId);
                    if (index !== -1) {
                        mapping.splice(index, 1);
                        if (mapping.length === 0) this.optimizedMapping.delete(originalUuid);
                    }
                }
            }
        }

        // 2. 释放资源
        if (bm.geometry) bm.geometry.dispose();
        // 材质通常是共享的 (this.sharedMaterial)，不在这里释放
        
        // 3. 从场景中移除
        if (bm.parent) bm.parent.remove(bm);
        
        // 4. 重置状态
        chunk.mesh = null;
        chunk.loaded = false;
        this.chunkLoadedCount = Math.max(0, this.chunkLoadedCount - 1);
        this.interactableListValid = false;
        this._needsBoundsUpdate = true;
    }

    private async loadChunk(chunk: any) {
        this.processingChunks.add(chunk.id);
        try {
            let bm: THREE.BatchedMesh | null = null;
            let loadedNow = false;
            
            if (chunk.node) {
                // 来自 addModel 的本地分块
                bm = createBatchedMeshFromItems(chunk.node.items, this.sharedMaterial);
            } else if (chunk.nbimFileId && this.nbimFiles.has(chunk.nbimFileId) && chunk.byteOffset) {
                // 来自 loadNbim 的远程分块
                const file = this.nbimFiles.get(chunk.nbimFileId)!;
                const buffer = await file.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength).arrayBuffer();
                const meta = this.nbimMeta.get(chunk.nbimFileId);
                const version = meta?.version ?? 7;
                
                // 使用 Worker 进行解析
                const workerResult = await this.runWorkerTask({
                    buffer,
                    version,
                    originalUuid: chunk.originalUuid,
                    bimIdTable: meta?.bimIdTable
                }, [buffer]);
                
                bm = this.reconstructBatchedMesh(workerResult, this.sharedMaterial);
            }

            if (bm) {
                if (this.cancelledChunkIds.has(chunk.id) || !this.chunks.some(c => c.id === chunk.id)) {
                    if ((bm as any).geometry) (bm as any).geometry.dispose();
                    if ((bm as any).material) {
                        const materials = Array.isArray((bm as any).material) ? (bm as any).material : [(bm as any).material];
                        materials.forEach((m: any) => m.dispose && m.dispose());
                    }
                    return;
                }
                bm.name = chunk.id;
                bm.userData.chunkId = chunk.id;
                
                // 抵消全局偏移 (解决大坐标导致的精度问题)
                // 只有远程 NBIM 分块需要手动抵消，因为其二进制数据是大坐标
                // 本地分块在 addModel 时已经随 object 整体偏移过了，生成的 BatchedMesh 坐标是正确的
                if (chunk.nbimFileId) {
                    bm.position.sub(this.globalOffset);
                    bm.updateMatrixWorld(true);
                }
                
                // 查找或创建优化组
                let optimizedGroup = this.contentGroup.getObjectByName(chunk.groupName) as THREE.Group;
                if (!optimizedGroup) {
                    optimizedGroup = new THREE.Group();
                    optimizedGroup.name = chunk.groupName;
                    optimizedGroup.userData.isOptimizedGroup = true;
                    optimizedGroup.userData.originalUuid = chunk.originalUuid;
                    this.contentGroup.add(optimizedGroup);
                }
                
                optimizedGroup.add(bm);
                chunk.mesh = bm;
                loadedNow = true;
                this.interactableListValid = false;
                this._needsBoundsUpdate = true; // 标记需要更新场景范围

                // 建立映射 (对齐 refs，记录原始颜色以便高亮恢复)
                const batchIdToUuid = bm.userData.batchIdToUuid as Map<number, string>;
                const batchIdToColor = bm.userData.batchIdToColor as Map<number, number>; // 记录颜色
                const batchIdToGeometry = bm.userData.batchIdToGeometry as Map<number, THREE.BufferGeometry>; // 记录几何体
                
                if (batchIdToUuid) {
                    for (const [batchId, originalUuid] of batchIdToUuid.entries()) {
                        if (!this.optimizedMapping.has(originalUuid)) {
                            this.optimizedMapping.set(originalUuid, []);
                        }
                        const originalColor = batchIdToColor?.get(batchId) ?? 0xffffff;
                        const geometry = batchIdToGeometry?.get(batchId);
                        this.optimizedMapping.get(originalUuid)!.push({ 
                            mesh: bm, 
                            instanceId: batchId,
                            originalColor: originalColor,
                            geometry: geometry
                        });
                    }
                }
            }

            if (loadedNow && !chunk.loaded) {
                chunk.loaded = true;
                this.chunkLoadedCount++; // 增加计数
                this.reportChunkProgress();
            }
            this.cancelledChunkIds.delete(chunk.id);

            // 移除鬼影
            const ghost = this.ghostGroup.getObjectByName(`ghost_${chunk.id}`);
            if (ghost) {
                this.ghostGroup.remove(ghost);
                if ((ghost as any).geometry) (ghost as any).geometry.dispose();
            }
        } catch (err) {
            console.error(`加载分块 ${chunk.id} 失败:`, err);
        } finally {
            this.processingChunks.delete(chunk.id);
        }
    }

    setChunkLoadingEnabled(enabled: boolean) {
        this.chunkLoadingEnabled = enabled;
        if (enabled) this.checkCullingAndLoad();
    }

    setContentVisible(visible: boolean) {
        this.contentGroup.visible = visible;
        this.ghostGroup.visible = visible;
        this.renderer.render(this.scene, this.camera);
    }

    private buildSceneGraph(object: THREE.Object3D): StructureTreeNode {
        const node: StructureTreeNode = {
            id: object.uuid,
            name: object.name || `Object_${object.id}`,
            type: (object as any).isMesh ? 'Mesh' : 'Group',
            children: [],
            bimId: object.userData?.bimId ? String(object.userData.bimId) : (object.userData?.expressID !== undefined ? String(object.userData.expressID) : undefined),
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
    /**
     * 构建基于 IFC 图层和空间结构的复合树
     */
    private buildIFCStructure(object: THREE.Object3D): StructureTreeNode {
        // 递归构建原始空间结构
        const buildSpatialRecursive = (obj: THREE.Object3D): StructureTreeNode => {
            const node: StructureTreeNode = {
                id: obj.uuid,
                name: obj.name || `Object_${obj.id}`,
                type: (obj as any).isMesh ? 'Mesh' : 'Group',
                children: [],
                bimId: obj.userData?.expressID !== undefined ? String(obj.userData.expressID) : undefined,
                userData: { ...obj.userData }
            };
            
            if (!this.nodeMap.has(obj.uuid)) this.nodeMap.set(obj.uuid, []);
            this.nodeMap.get(obj.uuid)!.push(node);

            for (const child of obj.children) {
                node.children!.push(buildSpatialRecursive(child));
            }
            return node;
        };
        
        const spatialRoot = buildSpatialRecursive(object);

        // 2. 图层结构分支
        const layerMap = object.userData.layerMap as Map<number, string> | undefined;
        if (layerMap && layerMap.size > 0) {
            const layerRoot: StructureTreeNode = {
                id: `layers_${object.uuid}`,
                name: '图层结构 (Layers)',
                type: 'Group',
                children: [],
                userData: { originalUuid: object.uuid }
            };
            
            if (!this.nodeMap.has(layerRoot.id)) this.nodeMap.set(layerRoot.id, []);
            this.nodeMap.get(layerRoot.id)!.push(layerRoot);

            const layers = new Map<string, StructureTreeNode>();
            
            // 遍历所有网格并按图层分组
            object.traverse((child) => {
                if ((child as THREE.Mesh).isMesh && child.userData.expressID !== undefined) {
                    const expressID = child.userData.expressID;
                    const layerName = layerMap.get(expressID) || '未分类图层';
                    
                    if (!layers.has(layerName)) {
                        const lNode: StructureTreeNode = {
                            id: `layer_${layerName}_${object.uuid}`,
                            name: layerName,
                            type: 'Group',
                            children: [],
                            userData: { originalUuid: object.uuid }
                        };
                        layers.set(layerName, lNode);
                        
                        if (!this.nodeMap.has(lNode.id)) this.nodeMap.set(lNode.id, []);
                        this.nodeMap.get(lNode.id)!.push(lNode);
                    }
                    
                    const layerNode = layers.get(layerName)!;
                    const node: StructureTreeNode = {
                        id: child.uuid,
                        name: child.name,
                        type: 'Mesh',
                        bimId: String(expressID),
                        userData: { ...child.userData }
                    };
                    layerNode.children!.push(node);
                    
                    if (!this.nodeMap.has(child.uuid)) this.nodeMap.set(child.uuid, []);
                    this.nodeMap.get(child.uuid)!.push(node);
                }
            });

            layerRoot.children = Array.from(layers.values());
            if (layerRoot.children.length > 0) {
                // 如果有图层结构，则返回包含空间和图层的根节点
                const compositeRoot: StructureTreeNode = {
                    id: `composite_${object.uuid}`,
                    name: object.name || 'IFC Model',
                    type: 'Group',
                    children: [spatialRoot, layerRoot],
                    userData: { originalUuid: object.uuid }
                };
                if (!this.nodeMap.has(compositeRoot.id)) this.nodeMap.set(compositeRoot.id, []);
                this.nodeMap.get(compositeRoot.id)!.push(compositeRoot);
                return compositeRoot;
            }
        }

        return spatialRoot;
    }

    async addModel(object: THREE.Object3D, onProgress?: (p: number, msg: string) => void) {
        object.updateMatrixWorld(true);

        // 1. 处理大坐标偏移
        const modelBox = new THREE.Box3().setFromObject(object);
        if (!modelBox.isEmpty()) {
            if (this.globalOffset.length() === 0) {
                modelBox.getCenter(this.globalOffset);
                console.log("初始化全局偏移以解决大坐标问题:", this.globalOffset);
            }
            // 抵消大坐标
            object.position.sub(this.globalOffset);
            object.updateMatrixWorld(true);
        }

        // 1. 构建场景树结构
        if (onProgress) onProgress(5, "正在构建场景树...");
        
        let modelRoot: StructureTreeNode;
        if (object.userData.isIFC) {
            modelRoot = this.buildIFCStructure(object);
        } else {
            modelRoot = this.buildSceneGraph(object);
        }
        
        // 记录原始模型 UUID，用于后续删除和分块匹配
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
        
        // 如果根节点名字是 Root 且有子节点，则打平（防止嵌套 Root）
        if (modelRoot.name === 'Root' && modelRoot.children && modelRoot.children.length > 0) {
            if (!this.structureRoot.children) this.structureRoot.children = [];
            this.structureRoot.children.push(...modelRoot.children);
        } else {
            if (!this.structureRoot.children) this.structureRoot.children = [];
            this.structureRoot.children.push(modelRoot);
        }

        // 预计算包围盒
        modelBox.setFromObject(object);
        if (!modelBox.isEmpty()) {
            this.precomputedBounds.union(modelBox);
            this.sceneBounds.copy(this.precomputedBounds);
        }

        // 2. 纹理优化 & 组件映射
        const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
        object.traverse(child => {
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
                        if ((mat as THREE.MeshStandardMaterial).map) (mat as THREE.MeshStandardMaterial).map!.anisotropy = maxAnisotropy;
                    });
                }
            }
        });

        // 2. 将原始模型加入场景
        // 为每个加载的文件创建一个容器组，方便统一管理
        const fileGroup = new THREE.Group();
        fileGroup.name = `file_${object.uuid}`;
        fileGroup.userData.originalUuid = object.uuid;
        object.userData.originalUuid = object.uuid;
        fileGroup.add(object);

        object.visible = false;
        this.contentGroup.add(fileGroup);
        this.interactableListValid = false;

        if (onProgress) onProgress(10, "正在收集构件...");
        
        const items = collectItems(object);
        if (items.length > 0) {
            if (onProgress) onProgress(20, `已收集 ${items.length} 个构件，正在计算八叉树...`);
            const bounds = new THREE.Box3();
            const tmpMin = new THREE.Vector3();
            const tmpMax = new THREE.Vector3();
            const tmpScale = new THREE.Vector3();

            for (const item of items) {
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

            bounds.min.subScalar(0.1);
            bounds.max.addScalar(0.1);

            if (onProgress) onProgress(35, "正在计算八叉树...");

            const maxItemsPerNode = 3000;
            const maxDepth = 6;
            const octree = buildOctree(items, bounds, { maxItemsPerNode, maxDepth });
            const leafNodes = collectLeafNodes(octree);
            
            // 4. 注册分块并显示鬼影
            const boxGeo = new THREE.BoxGeometry(1, 1, 1);
            const edgesGeo = new THREE.EdgesGeometry(boxGeo);
            const boxMat = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.3 });

            leafNodes.forEach((node, index) => {
                if (onProgress && leafNodes.length > 0) {
                    const step = Math.max(1, Math.floor(leafNodes.length / 20));
                    if (index % step === 0) onProgress(40 + Math.floor((index / leafNodes.length) * 50), `正在生成分块... (${index + 1}/${leafNodes.length})`);
                }
                const chunkId = `${object.uuid}_chunk_${index}`;
                const chunkBounds = node.bounds.clone();
                
                // 为每个构件分配 bimId 和 chunkId
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

                // 注册到 chunks 列表
                const paddedBounds = chunkBounds.clone();
                const padSize = chunkBounds.getSize(new THREE.Vector3()).multiplyScalar(this.chunkPadding);
                paddedBounds.expandByVector(padSize);
                this.chunks.push({
                    id: chunkId,
                    bounds: chunkBounds,
                    paddedBounds,
                    _padding: this.chunkPadding,
                    center: chunkBounds.getCenter(new THREE.Vector3()),
                    loaded: false,
                    node: node, // 存储节点数据以便后续加载
                    groupName: `optimized_${object.uuid}`,
                    originalUuid: object.uuid
                });

                // 显示鬼影
                const size = new THREE.Vector3();
                chunkBounds.getSize(size);
                const center = new THREE.Vector3();
                chunkBounds.getCenter(center);

                const edges = new THREE.LineSegments(
                    edgesGeo,
                    boxMat
                );
                edges.name = `ghost_${chunkId}`;
                edges.scale.copy(size);
                edges.position.copy(center);
                this.ghostGroup.add(edges);
            });

            this.reportChunkProgress();

            // 隐藏原始网格中的 Mesh 标记优化
            object.traverse(child => {
                if ((child as THREE.Mesh).isMesh) {
                    child.visible = false;
                    child.userData.isOptimized = true;
                }
            });
            if (onProgress) onProgress(95, "分块准备完成");
        }

        this.sceneBounds = this.computeTotalBounds(false);
        // 缓存完整包围盒，确保剖切等功能使用稳定的范围
        this.precomputedBounds = this.sceneBounds.clone();
        // 如果有 globalOffset，precomputedBounds 存储的是原始坐标，需要把 offset 加回去
        if (this.globalOffset.length() > 0) {
            this.precomputedBounds.translate(this.globalOffset);
        }

        this.updateSettings(this.settings);
        if (onProgress) onProgress(100, "模型已加入加载队列");
        this.checkCullingAndLoad();
    }

    removeObject(uuid: string) {
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
                    if (bm.geometry) bm.geometry.dispose();
                    if (bm.material) {
                        const materials = Array.isArray(bm.material) ? bm.material : [bm.material];
                        materials.forEach((m: any) => m.dispose && m.dispose());
                    }
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
                if (bm.geometry) bm.geometry.dispose();
                if (bm.material) {
                    const materials = Array.isArray(bm.material) ? bm.material : [bm.material];
                    materials.forEach((m: any) => m.dispose && m.dispose());
                }
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
        this.interactableListValid = false;

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
                    if ((ghost as any).geometry) (ghost as any).geometry.dispose();
                }
                return false;
            }
            return true;
        });

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

    addTileset(url: string, onProgress?: (p: number, msg: string) => void) {
        if (this.tilesRenderer) {
            this.tilesRenderer.dispose();
            this.contentGroup.remove(this.tilesRenderer.group);
        }

        if (onProgress) onProgress(10, "正在初始化 TilesRenderer...");
        
        const renderer = new TilesRenderer(url);
        renderer.setCamera(this.camera);
        renderer.setResolutionFromRenderer(this.camera, this.renderer);

        // 从当前配置动态设置
        renderer.errorTarget = 16; // 默认屏幕空间误差阈值
        renderer.lruCache.maxSize = 500 * 1024 * 1024; // 默认缓存 500MB

        (renderer.group as any).name = "3D Tileset"; // 确保大纲能识别

        // 监听加载事件 (对齐 refs 进度)
        let loadedTiles = 0;
        let hasError = false;

        (renderer as any).onLoadTileSet = () => {
            if (onProgress) onProgress(50, "Tileset 结构已加载");
        };
        
        (renderer as any).onLoadModel = () => {
            loadedTiles++;
            if (onProgress && !hasError) {
                onProgress(Math.min(99, 50 + loadedTiles), `已加载瓦片: ${loadedTiles}`);
            }
        };

        // 错误处理：3d-tiles-renderer 没有直接的 onError，这里用超时检查 tileset 是否成功解析
        setTimeout(() => {
            if (!(renderer as any).tileset && !hasError) {
                hasError = true;
                if (onProgress) onProgress(0, "加载失败: 无法获取 Tileset 配置文件，请检查网络或路径。");
            }
        }, 10000); // 10秒超时检查

        // 树更新的钩子
        (renderer as any).onLoadTile = (_tile: any) => {
            if (this.onTilesUpdate) this.onTilesUpdate();
        };
        (renderer as any).onDisposeTile = (_tile: any) => {
            if (this.onTilesUpdate) this.onTilesUpdate();
        };

        this.contentGroup.add(renderer.group);
        this.tilesRenderer = renderer;

        // 抵消全局偏移
        (renderer.group as any).position.copy(this.globalOffset.clone().negate());
        (renderer.group as any).name = "3D Tileset";

        // 添加到结构树
        const buildTilesTree = (tile: any, depth = 0): StructureTreeNode => {
            const node: StructureTreeNode = {
                id: tile.content?.uuid || THREE.MathUtils.generateUUID(),
                name: tile.content?.name || `Tile_${tile.level}_${tile.x || 0}_${tile.y || 0}`,
                type: 'Group',
                children: []
            };
            
            if (tile.children) {
                node.children = tile.children.map((c: any) => buildTilesTree(c, depth + 1));
            }
            
            return node;
        };

        const tilesNode: StructureTreeNode = {
            id: (renderer.group as any).uuid,
            name: "3D Tileset",
            type: 'Group',
            children: (renderer as any).tileset ? [buildTilesTree((renderer as any).tileset.root)] : []
        };
        if (!this.structureRoot.children) this.structureRoot.children = [];
        this.structureRoot.children.push(tilesNode);
        this.nodeMap.set(tilesNode.id, [tilesNode]);
        
        this.updateSceneBounds();
        // 如需，应用当前设置
        this.updateSettings(this.settings);
        
        return renderer.group;
    }

    // --- 辅助功能 (对齐 refs) ---
    private getTypeIndex(type: string): number {
        const types = ['Generic', 'Column', 'Beam', 'Slab', 'Wall', 'Window', 'Door', 'Pipe', 'Duct'];
        const idx = types.indexOf(type);
        return idx === -1 ? 0 : idx;
    }

    private guessType(name: string): string {
        const n = name.toLowerCase();
        if (n.includes('col') || n.includes('柱')) return 'Column';
        if (n.includes('beam') || n.includes('梁')) return 'Beam';
        if (n.includes('slab') || n.includes('板')) return 'Slab';
        if (n.includes('wall') || n.includes('墙')) return 'Wall';
        if (n.includes('window') || n.includes('窗')) return 'Window';
        if (n.includes('door') || n.includes('门')) return 'Door';
        return 'Generic';
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
            const typeStr = this.guessType(firstNode?.name || "");
            dv.setUint32(offset, bimIdIndex, true); offset += 4;
            const typeIndex = typeof item.typeIndex === "number" ? item.typeIndex : this.getTypeIndex(typeStr);
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

    private reconstructBatchedMesh(data: any, material: THREE.Material): THREE.BatchedMesh | null {
        const { geometries: geoData, instances: instData, originalUuid } = data;
        
        // BatchedMesh 要求所有几何体必须一致地拥有（或都没有）索引。
        // 检查是否至少有一个几何体带有索引。
        const hasAnyIndex = geoData.some((g: any) => g.index && g.index.length > 0);

        const geometries: THREE.BufferGeometry[] = geoData.map((g: any) => {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(g.position, 3));
            geo.setAttribute('normal', new THREE.BufferAttribute(g.normal, 3));
            if (g.index && g.index.length > 0) {
                geo.setIndex(new THREE.BufferAttribute(g.index, 1));
            } else if (hasAnyIndex) {
                // 如果批次中有其他几何体带索引，则为此几何体生成顺序索引
                const count = g.position.length / 3;
                const index = new Uint32Array(count);
                for (let i = 0; i < count; i++) index[i] = i;
                geo.setIndex(new THREE.BufferAttribute(index, 1));
            }
            return geo;
        });

        let totalVerts = 0;
        let totalIndices = 0;
        geometries.forEach(g => {
            totalVerts += g.attributes.position.count;
            if (g.index) totalIndices += g.index.count;
        });
        
        const bm = new THREE.BatchedMesh(instData.length, totalVerts, totalIndices, material);
        // 关键：禁用 BatchedMesh 自身的视锥剔除，由 SceneManager 的分块加载逻辑来控制可见性。
        // 这可以解决在正交相机下，当相机非常靠近模型时，模型意外消失的问题。
        bm.frustumCulled = false;
        (bm as any).perInstanceFrustumCulling = false;
        const geoIds = geometries.map(g => bm.addGeometry(g));

        const matrix = new THREE.Matrix4();
        const color = new THREE.Color();
        const batchIdToUuid = new Map<number, string>();
        const batchIdToBimId = new Map<number, string>();
        const batchIdToColor = new Map<number, number>();
        const batchIdToGeometry = new Map<number, THREE.BufferGeometry>();

        instData.forEach((inst: any) => {
            color.setHex(inst.color);
            matrix.fromArray(inst.matrix);

            const instId = bm.addInstance(geoIds[inst.geoIdx]);
            bm.setMatrixAt(instId, matrix);
            bm.setColorAt(instId, color);
            
            // 设置实例包围盒，用于 perInstanceFrustumCulling
            const geo = geometries[inst.geoIdx];
            if (!geo.boundingBox) geo.computeBoundingBox();
            if (geo.boundingBox) (bm as any).setBoundingBoxAt(instId, geo.boundingBox);
            
            const bimId = inst.bimId;
            const key = `${originalUuid}::${bimId}`;
            const nodeIds = this.bimIdToNodeIds.get(key);
            batchIdToUuid.set(instId, nodeIds?.[0] || `bim_${bimId}`);
            batchIdToBimId.set(instId, bimId);
            batchIdToColor.set(instId, inst.color);
            batchIdToGeometry.set(instId, geometries[inst.geoIdx]);
        });

        bm.userData.batchIdToUuid = batchIdToUuid;
        bm.userData.batchIdToBimId = batchIdToBimId;
        bm.userData.batchIdToColor = batchIdToColor;
        bm.userData.batchIdToGeometry = batchIdToGeometry;
        bm.computeBoundingBox();
        bm.computeBoundingSphere();
        return bm;
    }

    async exportNbim() {
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

        const ifcApiByModel = new Map<string, { ifcApi: any; modelID: number }>();
        this.contentGroup.traverse(obj => {
            if (obj.userData?.ifcAPI && obj.userData?.modelID !== undefined && obj.userData?.originalUuid) {
                ifcApiByModel.set(String(obj.userData.originalUuid), { ifcApi: obj.userData.ifcAPI, modelID: obj.userData.modelID });
            }
        });

        const bimProperties: Record<string, any> = {};
        const fillBimProperties = (node: StructureTreeNode) => {
            const originalUuid = node.userData?.originalUuid ? String(node.userData.originalUuid) : "";
            if (node.bimId) {
                const key = `${originalUuid}::${node.bimId}`;
                if (!bimProperties[key]) {
                    bimProperties[key] = { uuid: node.id, name: node.name };
                    const expressID = node.userData?.expressID;
                    if (expressID !== undefined && ifcApiByModel.has(originalUuid)) {
                        try {
                            const { ifcApi, modelID } = ifcApiByModel.get(originalUuid)!;
                            const entity = ifcApi.GetLine(modelID, Number(expressID));
                            if (entity) {
                                bimProperties[key].ifcType = entity.is_a || '';
                                bimProperties[key].globalId = entity.GlobalId?.value || '';
                                bimProperties[key].ifcName = entity.Name?.value || '';
                            }
                        } catch {}
                    }
                }
            }
            if (node.children) node.children.forEach(fillBimProperties);
        };
        fillBimProperties(this.structureRoot);

        const chunkBlobs: Uint8Array[] = [];
        const exportChunks = this.chunks.map(c => ({
            id: c.id,
            bounds: {
                min: { x: c.bounds.min.x, y: c.bounds.min.y, z: c.bounds.min.z },
                max: { x: c.bounds.max.x, y: c.bounds.max.y, z: c.bounds.max.z }
            },
            byteOffset: 0,
            byteLength: 0
        }));

        let currentOffset = 1024;

        const decodeV7 = (buffer: ArrayBuffer) => {
            const dv = new DataView(buffer);
            let offset = 0;
            const geoCount = dv.getUint32(offset, true); offset += 4;
            const geometries: THREE.BufferGeometry[] = [];
            for (let i = 0; i < geoCount; i++) {
                const vertCount = dv.getUint32(offset, true); offset += 4;
                const indexCount = dv.getUint32(offset, true); offset += 4;
                const posArr = new Float32Array(buffer, offset, vertCount * 3); offset += vertCount * 12;
                const normArr = new Float32Array(buffer, offset, vertCount * 3); offset += vertCount * 12;
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posArr), 3));
                geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normArr), 3));
                if (indexCount > 0) {
                    const indexArr = new Uint32Array(buffer, offset, indexCount); offset += indexCount * 4;
                    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indexArr), 1));
                }
                geometries.push(geo);
            }
            const instanceCount = dv.getUint32(offset, true); offset += 4;
            const matrix = new THREE.Matrix4();
            const instances: any[] = [];
            for (let i = 0; i < instanceCount; i++) {
                const bimIdNum = dv.getUint32(offset, true); offset += 4;
                const typeIndex = dv.getUint32(offset, true); offset += 4;
                const color = dv.getUint32(offset, true); offset += 4;
                for (let k = 0; k < 16; k++) {
                    matrix.elements[k] = dv.getFloat32(offset, true); offset += 4;
                }
                const geoIdx = dv.getUint32(offset, true); offset += 4;
                instances.push({ bimId: String(bimIdNum), typeIndex, color, matrix: matrix.clone(), geometry: geometries[geoIdx] });
            }
            return instances;
        };

        const decodeV8 = (buffer: ArrayBuffer, table: string[]) => {
            const dv = new DataView(buffer);
            let offset = 0;
            const geoCount = dv.getUint32(offset, true); offset += 4;
            const geometries: THREE.BufferGeometry[] = [];
            for (let i = 0; i < geoCount; i++) {
                const vertCount = dv.getUint32(offset, true); offset += 4;
                const indexCount = dv.getUint32(offset, true); offset += 4;
                const posArr = new Float32Array(buffer, offset, vertCount * 3); offset += vertCount * 12;
                const normArr = new Float32Array(buffer, offset, vertCount * 3); offset += vertCount * 12;
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posArr), 3));
                geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normArr), 3));
                if (indexCount > 0) {
                    const indexArr = new Uint32Array(buffer, offset, indexCount); offset += indexCount * 4;
                    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indexArr), 1));
                }
                geometries.push(geo);
            }
            const instanceCount = dv.getUint32(offset, true); offset += 4;
            const matrix = new THREE.Matrix4();
            const instances: any[] = [];
            for (let i = 0; i < instanceCount; i++) {
                const bimIdIndex = dv.getUint32(offset, true); offset += 4;
                const typeIndex = dv.getUint32(offset, true); offset += 4;
                const color = dv.getUint32(offset, true); offset += 4;
                for (let k = 0; k < 16; k++) {
                    matrix.elements[k] = dv.getFloat32(offset, true); offset += 4;
                }
                const geoIdx = dv.getUint32(offset, true); offset += 4;
                instances.push({ bimId: table[bimIdIndex] ?? String(bimIdIndex), typeIndex, color, matrix: matrix.clone(), geometry: geometries[geoIdx] });
            }
            return instances;
        };

        for (let i = 0; i < this.chunks.length; i++) {
            const chunk = this.chunks[i];
            const exportChunk = exportChunks[i];
            
            let buffer: ArrayBuffer;
            if (chunk.node) {
                buffer = this.generateChunkBinaryV8(chunk.node.items, bimIdToIndex);
            } else if (chunk.nbimFileId && this.nbimFiles.has(chunk.nbimFileId) && chunk.byteOffset) {
                const file = this.nbimFiles.get(chunk.nbimFileId)!;
                const raw = await file.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength).arrayBuffer();
                const meta = this.nbimMeta.get(chunk.nbimFileId);
                const version = meta?.version ?? 7;
                const instances = version >= 8 ? decodeV8(raw, meta?.bimIdTable || []) : decodeV7(raw);
                const items = instances.map(inst => ({ uuid: "", bimId: inst.bimId, typeIndex: inst.typeIndex, color: inst.color, matrix: inst.matrix, geometry: inst.geometry }));
                buffer = this.generateChunkBinaryV8(items, bimIdToIndex);
            } else {
                continue;
            }

            const uint8 = new Uint8Array(buffer);
            chunkBlobs.push(uint8);
            
            exportChunk.byteOffset = currentOffset;
            exportChunk.byteLength = uint8.byteLength;
            currentOffset += uint8.byteLength;
        }

        const manifest = {
            globalBounds: {
                min: { x: this.sceneBounds.min.x, y: this.sceneBounds.min.y, z: this.sceneBounds.min.z },
                max: { x: this.sceneBounds.max.x, y: this.sceneBounds.max.y, z: this.sceneBounds.max.z }
            },
            chunks: exportChunks,
            structureTree: (() => {
                const sanitizeUserData = (ud: any) => {
                    if (!ud || typeof ud !== 'object') return undefined;
                    const out: any = {};
                    if (ud.originalUuid !== undefined) out.originalUuid = String(ud.originalUuid);
                    if (ud.expressID !== undefined) out.expressID = ud.expressID;
                    if (ud.modelID !== undefined) out.modelID = ud.modelID;
                    return Object.keys(out).length > 0 ? out : undefined;
                };

                const srcRoot: any = this.structureRoot;
                const rootCopy: any = {
                    id: srcRoot?.id,
                    name: srcRoot?.name,
                    type: srcRoot?.type,
                    visible: srcRoot?.visible !== false,
                    children: []
                };
                if (srcRoot?.bimId !== undefined) rootCopy.bimId = srcRoot.bimId;
                if (srcRoot?.chunkId !== undefined) rootCopy.chunkId = srcRoot.chunkId;
                const rootUd = sanitizeUserData(srcRoot?.userData);
                if (rootUd) rootCopy.userData = rootUd;

                const stack: Array<{ src: any; dst: any }> = [{ src: srcRoot, dst: rootCopy }];
                while (stack.length > 0) {
                    const { src, dst } = stack.pop()!;
                    const children = Array.isArray(src?.children) ? src.children : [];
                    for (const child of children) {
                        const childCopy: any = {
                            id: child?.id,
                            name: child?.name,
                            type: child?.type,
                            visible: child?.visible !== false,
                            children: []
                        };
                        if (child?.bimId !== undefined) childCopy.bimId = child.bimId;
                        if (child?.chunkId !== undefined) childCopy.chunkId = child.chunkId;
                        const ud = sanitizeUserData(child?.userData);
                        if (ud) childCopy.userData = ud;
                        dst.children.push(childCopy);
                        stack.push({ src: child, dst: childCopy });
                    }
                }
                return rootCopy;
            })(),
            bimIdTable,
            bimProperties
        };

        let manifestStr: string;
        try {
            manifestStr = JSON.stringify(manifest);
        } catch (e) {
            const minimalManifest = {
                globalBounds: manifest.globalBounds,
                chunks: manifest.chunks,
                structureTree: { id: this.structureRoot.id, name: this.structureRoot.name, type: this.structureRoot.type, children: this.structureRoot.children ? [] : [] },
                bimIdTable: manifest.bimIdTable,
                bimProperties: {}
            };
            manifestStr = JSON.stringify(minimalManifest);
        }
        const manifestBytes = new TextEncoder().encode(manifestStr);

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
        a.download = `model_${new Date().getTime()}.nbim`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async loadNbim(file: File, onProgress?: (p: number, msg: string) => void) {
        // 不再自动清空场景，支持多模型
        const fileId = `nbim_${file.name}_${new Date().getTime()}`;
        this.nbimFiles.set(fileId, file);

        if (onProgress) onProgress(10, "正在解析 NBIM 文件头...");
        const headerBuffer = await file.slice(0, 1024).arrayBuffer();
        const dv = new DataView(headerBuffer);
        
        const magic = dv.getUint32(0, true);
        if (magic !== 0x4D49424E) throw new Error("不是有效的 NBIM 文件");

        const version = dv.getUint32(4, true);
        
        const manifestOffset = dv.getUint32(8, true);
        const manifestLen = dv.getUint32(12, true);

        if (onProgress) onProgress(20, "正在读取元数据...");
        const manifestBlob = file.slice(manifestOffset, manifestOffset + manifestLen);
        const manifestText = await manifestBlob.text();
        const manifest = JSON.parse(manifestText);

        this.nbimMeta.set(fileId, { version, bimIdTable: manifest.bimIdTable });
        
        // 设置或更新场景包围盒
        if (manifest.globalBounds) {
            const newBounds = new THREE.Box3(
                new THREE.Vector3(manifest.globalBounds.min.x, manifest.globalBounds.min.y, manifest.globalBounds.min.z),
                new THREE.Vector3(manifest.globalBounds.max.x, manifest.globalBounds.max.y, manifest.globalBounds.max.z)
            );

            // 处理大坐标偏移
            if (this.globalOffset.length() === 0) {
                newBounds.getCenter(this.globalOffset);
                console.log("初始化全局偏移 (NBIM):", this.globalOffset);
            }

            if (this.precomputedBounds.isEmpty()) {
                this.precomputedBounds.copy(newBounds);
            } else {
                this.precomputedBounds.union(newBounds);
            }
            this.sceneBounds.copy(this.precomputedBounds);
        }
        
        const modelRoot = manifest.structureTree;
        if (!this.structureRoot.children) this.structureRoot.children = [];
        
        // 不要增加额外的 root 节点，直接将内容加入 structureRoot
        if (modelRoot) {
            if (modelRoot.children && modelRoot.name === 'Root') {
                this.structureRoot.children.push(...modelRoot.children);
            } else {
                this.structureRoot.children.push(modelRoot);
            }
        }

        const rootId = modelRoot?.id || fileId;
        this.nbimPropsByOriginalUuid.set(rootId, manifest.bimProperties || {});

        // 为 NBIM 创建一个容器组
        const fileGroup = new THREE.Group();
        fileGroup.name = `file_${rootId}`;
        fileGroup.userData.originalUuid = rootId;
        this.contentGroup.add(fileGroup);
        this.interactableListValid = false;
        
        // 增量构建节点映射
        if (modelRoot) {
            const traverse = (node: StructureTreeNode) => {
                if (!node.userData) node.userData = {};
                node.userData.originalUuid = rootId;
                if (!this.nodeMap.has(node.id)) this.nodeMap.set(node.id, []);
                this.nodeMap.get(node.id)!.push(node);
                if (node.bimId) {
                    const key = `${rootId}::${node.bimId}`;
                    if (!this.bimIdToNodeIds.has(key)) this.bimIdToNodeIds.set(key, []);
                    this.bimIdToNodeIds.get(key)!.push(node.id);
                }
                if (node.children) node.children.forEach(traverse);
            };
            traverse(modelRoot);
        }
        
        // 注册分块
        if (onProgress) onProgress(30, "正在初始化分块...");
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const boxMat = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.3 });

        manifest.chunks.forEach((c: any) => {
            const bounds = new THREE.Box3(
                new THREE.Vector3(c.bounds.min.x, c.bounds.min.y, c.bounds.min.z),
                new THREE.Vector3(c.bounds.max.x, c.bounds.max.y, c.bounds.max.z)
            );
            
            // 关键：将包围盒也平移到偏移后的局部空间，否则视锥体裁剪会失败
            if (this.globalOffset.length() > 0) {
                bounds.translate(this.globalOffset.clone().negate());
            }

            const chunkId = c.id;
            const center = bounds.getCenter(new THREE.Vector3());
            const paddedBounds = bounds.clone();
            const padSize = bounds.getSize(new THREE.Vector3()).multiplyScalar(this.chunkPadding);
            paddedBounds.expandByVector(padSize);
            this.chunks.push({
                id: chunkId,
                bounds: bounds,
                paddedBounds,
                _padding: this.chunkPadding,
                center,
                loaded: false,
                byteOffset: c.byteOffset,
                byteLength: c.byteLength,
                nbimFileId: fileId,
                groupName: `optimized_${rootId}`,
                originalUuid: rootId
            });

            // 显示鬼影
            const size = new THREE.Vector3();
            bounds.getSize(size);

            const edges = new THREE.LineSegments(
                new THREE.EdgesGeometry(boxGeo),
                boxMat
            );
            edges.name = `ghost_${chunkId}`;
            edges.scale.copy(size);
            edges.position.copy(center);
            this.ghostGroup.add(edges);
        });

        this.reportChunkProgress();

        this.fitView();
        if (onProgress) onProgress(100, "NBIM 已就绪，正在按需加载...");
        this.checkCullingAndLoad();
    }

    async clear() {
        console.log("开始清空场景...");
        
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
            while(this.contentGroup.children.length > 0) {
                this.contentGroup.remove(this.contentGroup.children[0]);
            }

            // 2. 清理 3D Tiles
            if (this.tilesRenderer) {
                this.tilesRenderer.dispose();
                this.tilesRenderer = null;
            }

            // 3. 清理辅助组
            this.ghostGroup.children.forEach(disposeObject);
            this.ghostGroup.clear();
            
            this.selectionBox.visible = false;
            this.highlightMesh.visible = false;
            
            // 4. 清理测量记录
            this.clearAllMeasurements();

            // 5. 清理状态数据
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
            this.lastReportedProgress = { loaded: -1, total: -1 };
            this.processingChunks.clear();
            this.cancelledChunkIds.clear();
            this.componentMap.clear();
            this.chunkLoadingEnabled = true;
            this.contentGroup.visible = true;
            this.ghostGroup.visible = true;
            
            // 6. 重置全局偏移
            this.globalOffset.set(0, 0, 0);

            console.log("场景已清空");
        } catch (error) {
            console.error("清空场景失败:", error);
            throw error;
        }
    }

    getStructureNodes(id: string): StructureTreeNode[] | undefined {
        return this.nodeMap.get(id);
    }

    getNbimProperties(id: string): any | null {
        const node = this.nodeMap.get(id)?.[0];
        if (!node || !node.bimId) return null;
        const originalUuid = node.userData?.originalUuid ? String(node.userData.originalUuid) : "";
        if (!originalUuid) return null;
        const map = this.nbimPropsByOriginalUuid.get(originalUuid);
        if (!map) return null;
        const key = `${originalUuid}::${node.bimId}`;
        return map[key] || null;
    }

    setAllVisibility(visible: boolean) {
        const setNodeVisible = (n: StructureTreeNode) => {
            n.visible = visible;
            if (n.children) n.children.forEach(setNodeVisible);
        };
        if (this.structureRoot.children) this.structureRoot.children.forEach(setNodeVisible);

        this.optimizedMapping.forEach((mappings) => {
            mappings.forEach(m => {
                m.mesh.setVisibleAt(m.instanceId, visible);
            });
        });

        this.contentGroup.traverse(o => {
            if (o.name === "Helpers" || o.name === "Measure") return;
            if ((o as THREE.Mesh).isMesh && o.userData.isOptimized) {
                o.visible = false;
                return;
            }
            o.visible = visible;
        });

        this.updateSceneBounds();
    }

    hideObjects(uuids: string[]) {
        uuids.forEach(id => this.setObjectVisibility(id, false));
    }

    isolateObjects(uuids: string[]) {
        this.setAllVisibility(false);
        uuids.forEach(id => this.setObjectVisibility(id, true));
    }

    setObjectVisibility(uuid: string, visible: boolean) {
        // 更新结构树中的状态 (可能存在多个节点指向同一个 UUID)
        const nodes = this.nodeMap.get(uuid);
        if (nodes) {
            nodes.forEach(node => {
                const setVisibleRecursive = (n: StructureTreeNode) => {
                    n.visible = visible;
                    if (n.children) n.children.forEach(setVisibleRecursive);
                    
                    // 如果该子节点也有其他映射，同步更新它们
                    const otherNodes = this.nodeMap.get(n.id);
                    if (otherNodes) {
                        otherNodes.forEach(on => on.visible = visible);
                    }
                };
                setVisibleRecursive(node);
            });
        }

        const obj = this.contentGroup.getObjectByProperty("uuid", uuid);
        
        // 如果设置为可见，确保所有父节点也可见
        if (visible && obj) {
            let parent = obj.parent;
            while (parent && parent !== this.scene) {
                parent.visible = true;
                parent = parent.parent;
            }
        }

        if (!visible) {
            // 如果隐藏的对象（或其子对象）当前被高亮，则取消高亮
            const idsToUnhighlight: string[] = [];
            if (this.highlightedUuids.has(uuid)) {
                idsToUnhighlight.push(uuid);
            }
            
            // 检查子对象
            if (obj) {
                obj.traverse(child => {
                    if (this.highlightedUuids.has(child.uuid)) {
                        idsToUnhighlight.push(child.uuid);
                    }
                });
            } else if (nodes && nodes.length > 0) {
                const findHighlightedRecursive = (n: StructureTreeNode) => {
                    if (this.highlightedUuids.has(n.id)) idsToUnhighlight.push(n.id);
                    if (n.children) n.children.forEach(findHighlightedRecursive);
                };
                findHighlightedRecursive(nodes[0]);
            }

            if (idsToUnhighlight.length > 0) {
                const nextHighlighted = new Set(this.highlightedUuids);
                idsToUnhighlight.forEach(id => nextHighlighted.delete(id));
                this.highlightObjects(Array.from(nextHighlighted));
            }
        }

        if (!obj) {
            // 如果在 contentGroup 中找不到，可能已经被优化掉了
            // 我们尝试直接根据 node 递归更新 mappings
            if (nodes && nodes.length > 0) {
                const updateMappingsRecursive = (n: StructureTreeNode) => {
                    const mappings = this.optimizedMapping.get(n.id);
                    if (mappings) {
                        mappings.forEach(m => {
                            m.mesh.setVisibleAt(m.instanceId, visible);
                        });
                    }
                    if (n.children) n.children.forEach(updateMappingsRecursive);
                };
                updateMappingsRecursive(nodes[0]); // 只需要递归一个分支来更新物理对象
            }
            return;
        }

        obj.traverse(o => {
            if (o.name !== "Helpers" && o.name !== "Measure") {
                // 如果是原始网格，我们保持它不可见（因为我们使用 BatchedMesh 渲染）
                if ((o as THREE.Mesh).isMesh && o.userData.isOptimized) {
                    o.visible = false;
                } else {
                    o.visible = visible;
                }

                // 更新对应的 BatchedMesh 实例可见性
                const mappings = this.optimizedMapping.get(o.uuid);
                if (mappings) {
                    mappings.forEach(m => {
                        m.mesh.setVisibleAt(m.instanceId, visible);
                    });
                }
            }
        });

        this.interactableListValid = false;
        this.updateSceneBounds();
    }

    highlightObject(uuid: string | null) {
        this.highlightObjects(uuid ? [uuid] : []);
    }

    highlightObjects(uuids: string[]) {
        const target = new Set(uuids.filter(Boolean));

        const restoreOne = (id: string) => {
            const mappings = this.optimizedMapping.get(id);
            if (mappings) {
                mappings.forEach(m => {
                    m.mesh.setColorAt(m.instanceId, new THREE.Color(m.originalColor));
                });
            }
        };

        const applyOne = (id: string) => {
            const mappings = this.optimizedMapping.get(id);
            if (mappings) {
                mappings.forEach(m => {
                    m.mesh.setColorAt(m.instanceId, new THREE.Color(0xffaa00));
                });
            }
        };

        for (const prev of this.highlightedUuids) {
            if (!target.has(prev)) restoreOne(prev);
        }
        for (const next of target) {
            if (!this.highlightedUuids.has(next)) applyOne(next);
        }

        this.highlightedUuids = target;
        this.selectionBox.visible = false;
        this.highlightMesh.visible = false;
        this.lastSelectedUuid = uuids.length > 0 ? uuids[uuids.length - 1] : null;

        if (target.size === 0) return;

        const union = new THREE.Box3();
        const tmpBox = new THREE.Box3();
        const tmpMat = new THREE.Matrix4();

        const addObjectBounds = (id: string) => {
            const mappings = this.optimizedMapping.get(id);
            if (mappings && mappings.length > 0) {
                const m = mappings[0];
                if (m.geometry) {
                    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
                    tmpBox.copy(m.geometry.boundingBox!);
                    m.mesh.getMatrixAt(m.instanceId, tmpMat);
                    tmpMat.premultiply(m.mesh.matrixWorld);
                    tmpBox.applyMatrix4(tmpMat);
                    union.union(tmpBox);
                }
                return;
            }

            const obj = this.contentGroup.getObjectByProperty("uuid", id);
            if (!obj) return;
            obj.updateMatrixWorld(true);
            if (obj.userData.boundingBox) {
                tmpBox.copy(obj.userData.boundingBox).applyMatrix4(obj.matrixWorld);
            } else {
                tmpBox.setFromObject(obj);
            }
            union.union(tmpBox);
        };

        for (const id of target) addObjectBounds(id);

        if (!union.isEmpty()) {
            this.selectionBox.box.copy(union);
            this.selectionBox.visible = false; // 用户要求不显示包围盒
        }

        const focusId = this.lastSelectedUuid;
        if (!focusId) return;

        const focusMappings = this.optimizedMapping.get(focusId);
        if (focusMappings && focusMappings.length > 0) {
            const m = focusMappings[0];
            if (m.geometry) {
                this.highlightMesh.geometry = m.geometry;

                const matrix = new THREE.Matrix4();
                m.mesh.getMatrixAt(m.instanceId, matrix);
                matrix.premultiply(m.mesh.matrixWorld);

                const worldPos = new THREE.Vector3();
                const worldQuat = new THREE.Quaternion();
                const worldScale = new THREE.Vector3();
                matrix.decompose(worldPos, worldQuat, worldScale);

                this.highlightMesh.position.copy(worldPos);
                this.highlightMesh.quaternion.copy(worldQuat);
                this.highlightMesh.scale.copy(worldScale);
                this.highlightMesh.visible = true;
            }
            return;
        }

        const focusObj = this.contentGroup.getObjectByProperty("uuid", focusId);
        if (!focusObj) return;
        if ((focusObj as THREE.Mesh).isMesh) {
            focusObj.updateMatrixWorld(true);
            this.highlightMesh.geometry = (focusObj as THREE.Mesh).geometry;

            const worldPos = new THREE.Vector3();
            const worldQuat = new THREE.Quaternion();
            const worldScale = new THREE.Vector3();
            focusObj.matrixWorld.decompose(worldPos, worldQuat, worldScale);

            this.highlightMesh.position.copy(worldPos);
            this.highlightMesh.quaternion.copy(worldQuat);
            this.highlightMesh.scale.copy(worldScale);
            this.highlightMesh.visible = true;
        }
    }

    pick(clientX: number, clientY: number): { object: THREE.Object3D, intersect: THREE.Intersection } | null {
        const intersect = this.getRayIntersects(clientX, clientY);
        if (!intersect) return null;

        return { object: intersect.object, intersect };
    }

    getRayIntersects(clientX: number, clientY: number): THREE.Intersection | null {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        if (!this.interactableListValid) {
            this.interactableList = [];
            
            // 优化：优先从已加载的分块中收集网格，避免昂贵的 traverse
            if (this.chunks.length > 0) {
                this.chunks.forEach(c => {
                    if (c.loaded && c.mesh && c.mesh.visible) {
                        this.interactableList.push(c.mesh);
                    }
                });
            }

            // 收集非分块加载的可见普通 Mesh 或 Group 中的内容
            // 限制遍历深度以提高性能
            const traverseLimit = (o: THREE.Object3D, depth: number) => {
                if (depth > 10) return;
                if (!o.visible) return;
                
                // 跳过已经被分块系统处理的对象
                if ((o as any).userData.chunkId) return;
                
                if ((o as THREE.Mesh).isMesh || (o as any).isBatchedMesh) {
                    if (!o.userData.isOptimized) {
                        this.interactableList.push(o);
                    }
                } else if (o.children.length > 0) {
                    for (const child of o.children) {
                        traverseLimit(child, depth + 1);
                    }
                }
            };

            // 遍历内容组
            for (const child of this.contentGroup.children) {
                // 如果是优化组，跳过它（已经在上面通过 chunks 处理过了）
                if (child.userData.isOptimizedGroup) continue;
                traverseLimit(child, 0);
            }

            this.interactableListValid = true;
        }

        const intersects = this.raycaster.intersectObjects(this.interactableList, false); 
        if (intersects.length > 0) {
            const hit = intersects[0];
            // 如果拾取到的是 BatchedMesh，我们需要将其转换为原始 Object3D 或 Proxy
            if ((hit.object as any).isBatchedMesh) {
                const bm = hit.object as THREE.BatchedMesh;
                // 兼容不同版本的 Three.js 拾取结果字段
                const batchId = (hit as any).batchId !== undefined ? (hit as any).batchId : (hit as any).instanceId;
                
                if (batchId !== undefined) {
                    const originalUuid = (bm.userData.batchIdToUuid as Map<number, string>)?.get(batchId);
                    if (originalUuid) {
                        const originalObj = this.contentGroup.getObjectByProperty("uuid", originalUuid);
                        if (originalObj) {
                            (hit as any).object = originalObj;
                        } else {
                            // NBIM 模式下可能没有原始对象，返回一个更健壮的 Proxy Object
                            // 模拟基础的 Object3D 方法以防止 UI 端处理报错
                            const nodes = this.nodeMap.get(originalUuid);
                            const node = nodes?.[0];
                            const proxy = new THREE.Object3D();
                            proxy.uuid = originalUuid;
                            if (node) {
                                proxy.name = node.name;
                                (proxy as any).type = node.type;
                                (proxy as any).isMesh = node.type === 'Mesh';
                            }
                            
                            // 覆盖 getWorldPosition 以返回实例位置
                            proxy.getWorldPosition = (v: THREE.Vector3) => {
                                const mat = new THREE.Matrix4();
                                bm.getMatrixAt(batchId, mat);
                                mat.premultiply(bm.matrixWorld);
                                return v.setFromMatrixPosition(mat);
                            };

                            // 覆盖 getPosition (针对某些 UI 组件)
                            const mat = new THREE.Matrix4();
                            bm.getMatrixAt(batchId, mat);
                            proxy.position.setFromMatrixPosition(mat);

                            (hit as any).object = proxy;
                        }
                    }
                }
            }
            return hit;
        }
        return null;
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

            // 1. 处理 3D Tileset (特殊对象，通常作为根组处理)
            // 如果已经处理过 Tileset，我们可以跳过它的子节点以避免重复计算或精度问题
            if (obj.name === "3D Tileset" && this.tilesRenderer) {
                const tilesBox = new THREE.Box3();
                if ((this.tilesRenderer as any).getBounds) {
                    (this.tilesRenderer as any).getBounds(tilesBox);
                    if (!tilesBox.isEmpty() && this.globalOffset.length() > 0) {
                        if (Math.abs(tilesBox.min.x) > 100000 || Math.abs(tilesBox.min.y) > 100000) {
                            tilesBox.translate(this.globalOffset.clone().negate());
                        }
                    }
                    if (!tilesBox.isEmpty()) totalBox.union(tilesBox);
                }
                // 跳过子节点遍历，因为 getBounds 已经包含了全部
                obj.traverse(child => { if (child !== obj) (child as any)._skipTraverse = true; });
            }
            // 2. 处理普通 Mesh (如果不是 Tileset 的子节点)
            else if ((obj as THREE.Mesh).isMesh && !(obj as any)._skipTraverse) {
                const mesh = obj as THREE.Mesh;
                if (mesh.geometry) {
                    const box = new THREE.Box3().setFromObject(mesh);
                    if (!box.isEmpty()) totalBox.union(box);
                }
            }
            // 3. 处理 BatchedMesh
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

    fitView(keepOrientation = false) {
        this.contentGroup.updateMatrixWorld(true);
        let box = this.computeTotalBounds(true);
        
        // 如果可见部分为空，尝试使用完整包围盒
        if (box.isEmpty()) {
            box = this.computeTotalBounds(false);
        }

        this.sceneBounds = box.clone(); 
        this.fitBox(box, !keepOrientation);
    }

    fitViewToObject(uuid: string) {
        const obj = this.contentGroup.getObjectByProperty("uuid", uuid);
        if(!obj) return;
        const box = new THREE.Box3();
        if (obj.userData.boundingBox) {
            box.copy(obj.userData.boundingBox).applyMatrix4(obj.matrixWorld);
        } else {
            box.setFromObject(obj);
        }
        if(!box.isEmpty()) this.fitBox(box);
    }

    fitBox(box: THREE.Box3, updateCameraPosition: boolean = true) {
        if (box.isEmpty()) {
            this.camera.zoom = 1;
            this.camera.position.set(1000, 1000, 1000);
            this.camera.lookAt(0,0,0);
            this.controls.target.set(0,0,0);
            this.camera.updateProjectionMatrix();
            this.controls.update();
            return;
        }

        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const extent = maxDim > 0 ? maxDim : 100;
        const padding = 1.2;

        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        const aspect = w / h;
        let fH, fW;
        if (aspect >= 1) { fH = extent * padding; fW = fH * aspect; } 
        else { fW = extent * padding; fH = fW / aspect; }

        this.camera.zoom = 1;
        this.camera.left = -fW / 2;
        this.camera.right = fW / 2;
        this.camera.top = fH / 2;
        this.camera.bottom = -fH / 2;
        
        const zBuffer = Math.max(extent * 5, 2000); 
        this.camera.near = -zBuffer;
        this.camera.far = zBuffer;

        if (updateCameraPosition) {
            const offset = new THREE.Vector3(1, -1, 1).normalize(); 
            const dist = Math.max(extent * 2, 2000); 
            this.camera.position.copy(center.clone().add(offset.multiplyScalar(dist)));
            this.camera.lookAt(center);
        } else {
            const direction = new THREE.Vector3();
            this.camera.getWorldDirection(direction); 
            const dist = this.camera.position.distanceTo(this.controls.target);
            this.camera.position.copy(center).add(direction.multiplyScalar(-dist));
            this.camera.lookAt(center);
        }
        
        this.camera.updateProjectionMatrix();
        this.controls.target.copy(center);
        this.controls.update();
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
        switch(view) {
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

        // --- 测量逻辑 ---
    startMeasurement(type: MeasureType) {
        this.measureType = type;
        this.currentMeasurePoints = [];
        this.currentMeasureModelUuid = null;
        this.clearMeasurementPreview();
    }

    addMeasurePoint(point: THREE.Vector3, modelUuid?: string): { id: string, type: string, val: string } | null {
        if (this.measureType === 'none') return null;

        // 如果传入了模型 UUID，则记录到当前测量中
        if (modelUuid) {
            this.currentMeasureModelUuid = modelUuid;
        }

        this.currentMeasurePoints.push(point);
        // addMarker 会创建一个临时的点显示在 measureGroup 中
        // 我们不需要在这里手动 addMarker，因为 updatePreviewLine 已经处理了点的显示
        // 或者我们可以只在这里添加一个临时的点
        this.addMarker(point, this.measureGroup); 

        // 检查完成状态
        if (this.measureType === 'dist' && this.currentMeasurePoints.length === 2) {
            return this.finalizeMeasurement();
        } else if (this.measureType === 'angle' && this.currentMeasurePoints.length === 3) {
            return this.finalizeMeasurement();
        } else if (this.measureType === 'coord') {
            return this.finalizeMeasurement();
        }
        
        this.updatePreviewLine();
        return null;
    }

    updateMeasureHover(clientX: number, clientY: number) {
        if (this.measureType === 'none') {
            this.tempMarker.visible = false;
            return;
        }
        
        const intersect = this.getRayIntersects(clientX, clientY);
        if (intersect) {
            const p = intersect.point;
            const attr = this.tempMarker.geometry.attributes.position as THREE.BufferAttribute;
            attr.setXYZ(0, p.x, p.y, p.z);
            attr.needsUpdate = true;
            this.tempMarker.visible = true;

            if (this.currentMeasurePoints.length > 0) {
                 this.updatePreviewLine(p);
            }
        } else {
            this.tempMarker.visible = false;
            if(this.previewLine) this.previewLine.visible = false;
        }
    }

    updatePreviewLine(hoverPoint?: THREE.Vector3) {
        if (this.previewLine) {
            this.measureGroup.remove(this.previewLine);
            this.previewLine = null;
        }

        const points = [...this.currentMeasurePoints];
        if (hoverPoint) points.push(hoverPoint);
        if (points.length < 2) return;

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineDashedMaterial({ 
            color: 0xff0000, 
            dashSize: 5, 
            gapSize: 2, 
            depthTest: false 
        });
        
        this.previewLine = new THREE.Line(geometry, material);
        this.previewLine.computeLineDistances();
        this.previewLine.renderOrder = 998;
        this.measureGroup.add(this.previewLine);
    }

    finalizeMeasurement() {
        const id = `measure_${Date.now()}`;
        const group = new THREE.Group();
        group.name = id;

        this.currentMeasurePoints.forEach(p => this.addMarker(p, group));

        let valStr = "";
        let displayVal = "";
        let typeStr = this.measureType; 
        let labelPos = new THREE.Vector3();

        if (this.measureType === 'dist') {
            const p1 = this.currentMeasurePoints[0];
            const p2 = this.currentMeasurePoints[1];
            const dist = p1.distanceTo(p2);
            
            const dx = Math.abs(p2.x - p1.x);
            const dy = Math.abs(p2.y - p1.y);
            const dz = Math.abs(p2.z - p1.z);

            displayVal = dist.toFixed(3);
            valStr = `${displayVal} (Δx:${dx.toFixed(2)}, Δy:${dy.toFixed(2)}, Δz:${dz.toFixed(2)})`;
            this.addLine(this.currentMeasurePoints, group);
            labelPos.copy(p1).add(p2).multiplyScalar(0.5);
        } else if (this.measureType === 'angle') {
            const p1 = this.currentMeasurePoints[0];
            const center = this.currentMeasurePoints[1];
            const p2 = this.currentMeasurePoints[2];
            const v1 = p1.clone().sub(center).normalize();
            const v2 = p2.clone().sub(center).normalize();
            const angle = v1.angleTo(v2) * (180 / Math.PI);
            displayVal = angle.toFixed(2) + "°";
            valStr = displayVal;
            this.addLine(this.currentMeasurePoints, group);
            labelPos.copy(center);
        } else {
            const p = this.currentMeasurePoints[0];
            displayVal = `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`;
            valStr = displayVal;
            labelPos.copy(p);
        }

        // 添加数字显示标签
        const label = this.createLabel(displayVal, labelPos);
        group.add(label);

        this.measureGroup.add(group);
        this.measureRecords.set(id, { 
            id, 
            type: typeStr, 
            val: valStr, 
            group,
            modelUuid: this.currentMeasureModelUuid || undefined
        });
        
        this.currentMeasurePoints = [];
        this.currentMeasureModelUuid = null;
        this.clearMeasurementPreview();
        
        if (this.onMeasureUpdate) {
            this.onMeasureUpdate(Array.from(this.measureRecords.values()));
        }

        return { id, type: typeStr, val: valStr };
    }

    private createLabel(text: string, position: THREE.Vector3): THREE.Sprite {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return new THREE.Sprite();

        // 提高分辨率以获得更清晰的文字
        const fontSize = 48;
        const padding = 24;
        ctx.font = `Bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
        const textWidth = ctx.measureText(text).width;
        
        canvas.width = textWidth + padding * 2;
        canvas.height = fontSize + padding;

        // 绘制带阴影的背景
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = 'rgba(30, 30, 30, 0.9)';
        
        const radius = 8;
        // @ts-ignore
        if (ctx.roundRect) {
            // @ts-ignore
            ctx.roundRect(5, 5, canvas.width - 10, canvas.height - 10, radius);
        } else {
            ctx.rect(5, 5, canvas.width - 10, canvas.height - 10);
        }
        ctx.fill();

        // 绘制边框
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 绘制文字
        ctx.font = `Bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        
        const spriteMaterial = new THREE.SpriteMaterial({ 
            map: texture, 
            depthTest: false,
            sizeAttenuation: false // 关键：使文字不受相机缩放影响
        });
        
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.copy(position);
        
        // 由于 sizeAttenuation 为 false，scale 现在代表在屏幕空间占用的比例 (0.0 到 1.0)
        // 我们设定一个合适的大小，例如占据屏幕高度的 3%
        const baseScale = 0.035;
        sprite.scale.set(baseScale * (canvas.width / canvas.height), baseScale, 1);
        sprite.renderOrder = 1001;
        sprite.userData = { type: 'label' };
        
        return sprite;
    }

    highlightMeasurement(id: string | null) {
        this.measureRecords.forEach((record, rid) => {
            const isHighlighted = rid === id;
            const color = isHighlighted ? 0x00ff00 : 0xff0000; // 高亮绿色，普通红色
            
            record.group.traverse(child => {
                if (child instanceof THREE.Line) {
                    (child.material as THREE.LineBasicMaterial).color.set(color);
                } else if (child instanceof THREE.Points) {
                    (child.material as THREE.PointsMaterial).color.set(color);
                } else if (child instanceof THREE.Sprite) {
                    // 对于 Sprite，由于是 Canvas 贴图，如果要变色可能需要重新生成贴图
                    // 这里我们简单调整下材质的 color
                    (child.material as THREE.SpriteMaterial).color.set(isHighlighted ? 0x00ff00 : 0xffffff);
                }
            });
        });
    }

    pickMeasurement(clientX: number, clientY: number): string | null {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        // 增加阈值以便更容易选中线
        const oldThreshold = this.raycaster.params.Line?.threshold || 0;
        if (this.raycaster.params.Line) this.raycaster.params.Line.threshold = 5;

        const intersects = this.raycaster.intersectObjects(this.measureGroup.children, true);
        
        if (this.raycaster.params.Line) this.raycaster.params.Line.threshold = oldThreshold;

        if (intersects.length > 0) {
            // 找到所属的 Group (其名字为 measure_xxx)
            let obj = intersects[0].object;
            while (obj.parent && !obj.name.startsWith("measure_")) {
                obj = obj.parent;
            }
            if (obj.name.startsWith("measure_")) {
                return obj.name;
            }
        }
        return null;
    }

    addMarker(point: THREE.Vector3, parent: THREE.Object3D) {
        const markerGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([point.x, point.y, point.z], 3));
        const markerMat = new THREE.PointsMaterial({ color: 0xff0000, size: 8, map: this.dotTexture, transparent: true, alphaTest: 0.5, depthTest: false });
        const marker = new THREE.Points(markerGeo, markerMat);
        marker.renderOrder = 999;
        parent.add(marker);
    }

    addLine(points: THREE.Vector3[], parent: THREE.Object3D) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xff0000, depthTest: false, linewidth: 2 });
        const line = new THREE.Line(geometry, material);
        line.renderOrder = 998;
        parent.add(line);
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
    }

    clearMeasurementPreview() {
        this.currentMeasurePoints = [];
        if (this.previewLine) {
            this.measureGroup.remove(this.previewLine);
            this.previewLine = null;
        }
        this.tempMarker.visible = false;
        // 清理
        for (let i = this.measureGroup.children.length - 1; i >= 0; i--) {
            const child = this.measureGroup.children[i];
            if (!child.name.startsWith("measure_") && child !== this.previewLine) {
                this.measureGroup.remove(child);
            }
        }
    }

    // --- 剖切逻辑 ---

    setupClipping() {
        this.clippingPlanes = [
            new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
            new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
            new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
            new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
            new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
            new THREE.Plane(new THREE.Vector3(0, 0, -1), 0),
        ];
        this.renderer.clippingPlanes = [];

        // 创建剖切面辅助可视化
        const colors = [0xff0000, 0xff0000, 0x00ff00, 0x00ff00, 0x0000ff, 0x0000ff];
        this.clipPlaneHelpers = [];
        this.clipHelpersGroup.clear();

        for (let i = 0; i < 6; i++) {
            const geom = new THREE.PlaneGeometry(1, 1);
            const mat = new THREE.MeshBasicMaterial({
                color: colors[i],
                transparent: true,
                opacity: 0.3, // 提高不透明度，使半透明效果更明显
                side: THREE.DoubleSide,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -4, 
                polygonOffsetUnits: -4,
                clippingPlanes: [] 
            });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.visible = false;
            mesh.renderOrder = 9999; // 提高渲染顺序，减少与模型的闪烁冲突
            
            // 添加边框
            const edges = new THREE.EdgesGeometry(geom);
            const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ 
                color: colors[i], 
                transparent: true, 
                opacity: 0.8, // 边框也调亮一点
                depthWrite: false
            }));
            line.renderOrder = 10000;
            mesh.add(line);
            
            this.clipPlaneHelpers.push(mesh);
            this.clipHelpersGroup.add(mesh);
        }
    }

    setClippingEnabled(enabled: boolean) {
        this.renderer.clippingPlanes = enabled ? this.clippingPlanes : [];
        if (!enabled) {
            this.clipPlaneHelpers.forEach(h => h.visible = false);
        }
    }

    updateClippingPlanes(bounds: THREE.Box3, values: {x:number[], y:number[], z:number[]}, active: {x:boolean, y:boolean, z:boolean}) {
        if (bounds.isEmpty()) return;
        const { min, max } = bounds;
        const size = max.clone().sub(min);
        const center = bounds.getCenter(new THREE.Vector3());
        
        // 辅助面大小：设置为包围盒对角线长度，既足够大又避免过大导致精度问题
        const diagonal = size.length();
        const helperSize = diagonal > 0 ? diagonal * 1.2 : 1000;
        
        const xMin = min.x + (values.x[0] / 100) * size.x;
        const xMax = min.x + (values.x[1] / 100) * size.x;
        const yMin = min.y + (values.y[0] / 100) * size.y;
        const yMax = min.y + (values.y[1] / 100) * size.y;
        const zMin = min.z + (values.z[0] / 100) * size.z;
        const zMax = min.z + (values.z[1] / 100) * size.z;

        const isEnabled = this.renderer.clippingPlanes.length > 0;

        // X 轴
        if (active.x) {
            this.clippingPlanes[0].constant = -xMin;
            this.clippingPlanes[1].constant = xMax;
            
            this.updatePlaneHelper(0, new THREE.Vector3(1, 0, 0), xMin, center, helperSize, isEnabled);
            this.updatePlaneHelper(1, new THREE.Vector3(-1, 0, 0), xMax, center, helperSize, isEnabled);
        } else {
            this.clippingPlanes[0].constant = Infinity;
            this.clippingPlanes[1].constant = Infinity;
            this.clipPlaneHelpers[0].visible = false;
            this.clipPlaneHelpers[1].visible = false;
        }

        // Y 轴
        if (active.y) {
            this.clippingPlanes[2].constant = -yMin;
            this.clippingPlanes[3].constant = yMax;
            
            this.updatePlaneHelper(2, new THREE.Vector3(0, 1, 0), yMin, center, helperSize, isEnabled);
            this.updatePlaneHelper(3, new THREE.Vector3(0, -1, 0), yMax, center, helperSize, isEnabled);
        } else {
            this.clippingPlanes[2].constant = Infinity;
            this.clippingPlanes[3].constant = Infinity;
            this.clipPlaneHelpers[2].visible = false;
            this.clipPlaneHelpers[3].visible = false;
        }

        // Z 轴
        if (active.z) {
            this.clippingPlanes[4].constant = -zMin;
            this.clippingPlanes[5].constant = zMax;
            
            this.updatePlaneHelper(4, new THREE.Vector3(0, 0, 1), zMin, center, helperSize, isEnabled);
            this.updatePlaneHelper(5, new THREE.Vector3(0, 0, -1), zMax, center, helperSize, isEnabled);
        } else {
            this.clippingPlanes[4].constant = Infinity;
            this.clippingPlanes[5].constant = Infinity;
            this.clipPlaneHelpers[4].visible = false;
            this.clipPlaneHelpers[5].visible = false;
        }
    }

    private updatePlaneHelper(idx: number, normal: THREE.Vector3, dist: number, center: THREE.Vector3, size: number, isEnabled: boolean) {
        const helper = this.clipPlaneHelpers[idx];
        if (!helper) return;

        helper.visible = isEnabled;
        helper.scale.set(size, size, 1);
        
        // 设置位置：在对应轴向上设置为 dist，增加一个微小的偏移量 (1mm) 以减少与模型表面的闪烁
        const pos = new THREE.Vector3(center.x, center.y, center.z);
        const epsilon = 0.001; 
        if (normal.x !== 0) pos.x = dist + (normal.x * epsilon);
        else if (normal.y !== 0) pos.y = dist + (normal.y * epsilon);
        else if (normal.z !== 0) pos.z = dist + (normal.z * epsilon);
        
        helper.position.copy(pos);
        
        // 设置旋转使其面向法线
        helper.lookAt(pos.clone().add(normal));
    }

    /**
     * 检查包围盒是否完全被当前剖切面裁剪掉
     * 如果包围盒完全在任意一个激活的剖切面的“背面”，则认为被裁剪
     */
    private isBoxClipped(box: THREE.Box3): boolean {
        for (const plane of this.clippingPlanes) {
            if (plane.constant === Infinity) continue;
            
            // 获取包围盒在平面法线方向上的最大点
            // 如果最大点都在平面负方向，说明整个盒子都在平面外
            const planeNormal = plane.normal;
            const maxPoint = new THREE.Vector3(
                planeNormal.x > 0 ? box.max.x : box.min.x,
                planeNormal.y > 0 ? box.max.y : box.min.y,
                planeNormal.z > 0 ? box.max.z : box.min.z
            );
            
            if (plane.distanceToPoint(maxPoint) < 0) {
                return true;
            }
        }
        return false;
    }

    getStats() {
        let meshes = 0;
        let faces = 0;
        let memory = 0;

        this.contentGroup.traverse((obj) => {
            if (obj.name === "__EdgesHelper") return;
            
            if ((obj as THREE.Mesh).isMesh || (obj as any).isBatchedMesh) {
                meshes++;
                const mesh = obj as any;
                
                if (mesh.isBatchedMesh) {
                    // BatchedMesh 统计
                    // faces += mesh.indexCount / 3; // 这是一个粗略估算
                    // 准确做法是累加所有已添加几何体的面数
                    // 但这里我们可以简单使用渲染器提供的信息或者直接从几何体计算
                    // 由于 BatchedMesh 内部存储，我们假设它已经被包含在 memory 计算中
                    const mapping = mesh.userData.batchIdToExpressId as Map<number, number>;
                    if (mapping) {
                        // 如果有映射，说明每个实例都代表一个原始对象
                        // 这里的 meshes 增加量应该是实例数量
                        meshes += (mapping.size - 1); 
                    }
                }

                if (mesh.geometry) {
                    let meshFaces = 0;
                    if (mesh.geometry.index) {
                        meshFaces = mesh.geometry.index.count / 3;
                    } else if (mesh.geometry.attributes.position) {
                        meshFaces = mesh.geometry.attributes.position.count / 3;
                    }
                    
                    if (mesh.isInstancedMesh) {
                        meshFaces *= mesh.count;
                    }
                    
                    faces += meshFaces;
                    memory += calculateGeometryMemory(mesh.geometry);
                }
            }
        });
        
        const drawCalls = this.renderer.info.render.calls;
        return { 
            meshes, 
            faces: Math.floor(faces), 
            memory: parseFloat(memory.toFixed(2)),
            drawCalls 
        };
    }

    dispose() {
        if (this.logicTimer) clearInterval(this.logicTimer);
        this.renderer.dispose();
        if (this.tilesRenderer) this.tilesRenderer.dispose();
    }
}
