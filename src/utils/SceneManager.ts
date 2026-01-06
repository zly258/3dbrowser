import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TilesRenderer } from "3d-tiles-renderer";
import { 
    calculateGeometryMemory, 
    collectItems, 
    buildOctree, 
    convertOctreeToBatchedMeshes,
    collectLeafNodes,
    createBatchedMeshFromItems
} from "./octree";
import type { OctreeNode } from "./octree";

export type MeasureType = 'dist' | 'angle' | 'coord' | 'none';

interface MeasurementRecord {
    id: string;
    type: string;
    val: string;
    group: THREE.Group;
}

export type AxisOption = '+x'|'-x'|'+y'|'-y'|'+z'|'-z';

export interface SceneSettings {
    ambientInt: number;
    dirInt: number;
    bgColor: string;
    wireframe: boolean;
    sse: number;
    maxMemory: number;
    // 导入设置（加载时应用）
    importAxisGLB: AxisOption;
    importAxisIFC: AxisOption;
}

export interface StructureTreeNode {
    id: string;
    name: string;
    type: 'Mesh' | 'Group';
    children?: StructureTreeNode[];
    bimId?: number;
    chunkId?: string;
    visible?: boolean;
}

export class SceneManager {
    canvas: HTMLCanvasElement;
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    controls: OrbitControls;
    
    // 组
    contentGroup: THREE.Group; 
    helpersGroup: THREE.Group;
    measureGroup: THREE.Group;
    ghostGroup: THREE.Group; // 渐进式加载时的占位边框组
    
    // 灯光
    ambientLight: THREE.AmbientLight;
    dirLight: THREE.DirectionalLight;
    backLight: THREE.DirectionalLight;

    // 结构树
    structureRoot: StructureTreeNode = { id: 'root', name: 'Root', type: 'Group', children: [] };
    private componentCounter = 0;
    private nodeMap = new Map<string, StructureTreeNode>();

    // 引用
    tilesRenderer: TilesRenderer | null = null;
    selectionBox: THREE.Box3Helper;
    highlightMesh: THREE.Mesh; 
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;

    // 测量状态
    measureType: MeasureType = 'none';
    currentMeasurePoints: THREE.Vector3[] = [];
    previewLine: THREE.Line | null = null;
    tempMarker: THREE.Points; 
    measureRecords: Map<string, MeasurementRecord> = new Map();
    
    // 裁剪状态
    clippingPlanes: THREE.Plane[] = [];
    
    // 爆炸状态
    explodeData: Map<string, { originalPos: THREE.Vector3, direction: THREE.Vector3 }> = new Map();
    sceneCenter: THREE.Vector3 = new THREE.Vector3();
    
    // 组件映射
    componentMap: Map<number | string, any> = new Map();
    
    // 优化后的网格映射: originalUuid -> { mesh, instanceId, originalColor }[]
    optimizedMapping: Map<string, { mesh: THREE.BatchedMesh, instanceId: number, originalColor: number }[]> = new Map();
    
    // 设置
    settings: SceneSettings = {
        ambientInt: 2.0,
        dirInt: 1.0,
        bgColor: "#1e1e1e",
        wireframe: false,
        sse: 16,
        maxMemory: 500,
        importAxisGLB: '+y', // GLB标准
        importAxisIFC: '+z', // IFC标准
    };

    // 资源
    dotTexture: THREE.Texture;
    
    // 缓存
    sceneBounds: THREE.Box3 = new THREE.Box3();
    precomputedBounds: THREE.Box3 = new THREE.Box3(); // 预计算的包围盒
    
    // 渐进式加载状态 (对齐 refs)
    private chunks: any[] = [];
    private processingChunks = new Set<string>();
    private frustum = new THREE.Frustum();
    private projScreenMatrix = new THREE.Matrix4();
    private logicTimer: number = 0;
    private nbimFiles: Map<string, File> = new Map(); // 支持多文件引用
    private sharedMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        roughness: 0.6,
        metalness: 0.1,
        side: THREE.DoubleSide
    });

    // 回调
    onTilesUpdate?: () => void;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        // 为点生成简单的圆形精灵纹理
        this.dotTexture = this.createCircleTexture();

        // 渲染器
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            logarithmicDepthBuffer: true,
            precision: "highp"
        });
        // 重要：设置初始大小
        // 在resize()中使用setSize(w, h, false)来防止内联样式锁定大小，
        // 允许CSS（width: 100%, height: 100%）处理布局重排
        this.renderer.setSize(width, height, false);
        this.renderer.setPixelRatio(window.devicePixelRatio);
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
            color: 0xffff00, 
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

        this.mouse = new THREE.Vector2();

        // 启动逻辑定时器 (对齐 refs)
        this.logicTimer = window.setInterval(() => {
            this.checkCullingAndLoad();
        }, 300);

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

        // 应用线框模式（全局覆盖）
        if (this.settings.wireframe) {
            this.scene.overrideMaterial = new THREE.MeshBasicMaterial({ 
                color: 0xcccccc, 
                wireframe: true,
                transparent: true,
                opacity: 0.3
            });
        } else {
            this.scene.overrideMaterial = null;
        }

        // 应用瓦片配置
        if (this.tilesRenderer) {
            this.tilesRenderer.errorTarget = this.settings.sse;
            this.tilesRenderer.lruCache.maxSize = this.settings.maxMemory * 1024 * 1024;
            // 强制瓦片渲染器重新评估
            this.tilesRenderer.setCamera(this.camera);
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
        
        if (this.controls) this.controls.update();

        if (this.tilesRenderer) {
            this.camera.updateMatrixWorld();
            this.tilesRenderer.update();
        }

        this.updateCameraClipping();

        this.renderer.render(this.scene, this.camera);
    }
    
    updateCameraClipping() {
        if (!this.sceneBounds || this.sceneBounds.isEmpty()) return;

        const sphere = new THREE.Sphere();
        this.sceneBounds.getBoundingSphere(sphere);
        
        const dist = this.camera.position.distanceTo(sphere.center);
        const range = sphere.radius * 4 + dist; 
        
        this.camera.near = -range;
        this.camera.far = range;
        
        this.camera.updateProjectionMatrix();
    }

    resize() {
        if (!this.canvas) return;
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        
        // 确保大小为正数
        if (w === 0 || h === 0) return;

        const aspect = w / h;
        const cam = this.camera;
        const frustumHeight = cam.top - cam.bottom;
        const newWidth = frustumHeight * aspect;
        
        cam.left = -newWidth / 2;
        cam.right = newWidth / 2;
        cam.updateProjectionMatrix();
        
        // 关键修复：第三参数传 false（不更新内联样式）
        // 保持渲染分辨率与 clientWidth/Height 匹配
        // 由 CSS（宽度 100%）负责弹性容器中的实际显示大小
        this.renderer.setSize(w, h, false);
        
        // 调整大小时强制渲染
        this.renderer.render(this.scene, this.camera);
    }

    private checkCullingAndLoad() {
        if (this.chunks.length === 0 || this.processingChunks.size >= 6) return;

        this.camera.updateMatrixWorld();
        this.projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

        const toLoad = this.chunks.filter(c => !c.loaded && !this.processingChunks.has(c.id) && this.frustum.intersectsBox(c.bounds));
        
        if (toLoad.length > 0) {
            // 优先加载距离相机近的分块
            toLoad.sort((a, b) => {
                const centerA = a.bounds.getCenter(new THREE.Vector3());
                const centerB = b.bounds.getCenter(new THREE.Vector3());
                return centerA.distanceToSquared(this.camera.position) - centerB.distanceToSquared(this.camera.position);
            });

            const batch = toLoad.slice(0, 3);
            batch.forEach(chunk => this.loadChunk(chunk));
        }
    }

    private async loadChunk(chunk: any) {
        this.processingChunks.add(chunk.id);
        try {
            let bm: THREE.BatchedMesh | null = null;
            
            if (chunk.node) {
                // 来自 addModel 的本地分块
                bm = createBatchedMeshFromItems(chunk.node.items, this.sharedMaterial);
            } else if (chunk.nbimFileId && this.nbimFiles.has(chunk.nbimFileId) && chunk.byteOffset) {
                // 来自 loadNbim 的远程分块
                const file = this.nbimFiles.get(chunk.nbimFileId)!;
                const buffer = await file.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength).arrayBuffer();
                bm = this.parseChunkBinaryV7(buffer, this.sharedMaterial);
            }

            if (bm) {
                bm.name = chunk.id;
                bm.userData.chunkId = chunk.id;
                
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

                // 建立映射 (对齐 refs，记录原始颜色以便高亮恢复)
                const batchIdToUuid = bm.userData.batchIdToUuid as Map<number, string>;
                const batchIdToColor = bm.userData.batchIdToColor as Map<number, number>; // 记录颜色
                
                if (batchIdToUuid) {
                    for (const [batchId, originalUuid] of batchIdToUuid.entries()) {
                        if (!this.optimizedMapping.has(originalUuid)) {
                            this.optimizedMapping.set(originalUuid, []);
                        }
                        const originalColor = batchIdToColor?.get(batchId) ?? 0xffffff;
                        this.optimizedMapping.get(originalUuid)!.push({ 
                            mesh: bm, 
                            instanceId: batchId,
                            originalColor: originalColor
                        });
                    }
                }
            }

            chunk.loaded = true;

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

    private buildSceneGraph(object: THREE.Object3D): StructureTreeNode {
        const node: StructureTreeNode = {
            id: object.uuid,
            name: object.name || `Object_${object.id}`,
            type: (object as any).isMesh ? 'Mesh' : 'Group',
            children: []
        };
        this.nodeMap.set(object.uuid, node);
        for (const child of object.children) {
            node.children!.push(this.buildSceneGraph(child));
        }
        return node;
    }

    async addModel(object: THREE.Object3D, onProgress?: (p: number, msg: string) => void) {
        object.updateMatrixWorld(true);

        // 1. 构建场景树结构
        if (onProgress) onProgress(5, "正在构建场景树...");
        const modelRoot = this.buildSceneGraph(object);
        if (!this.structureRoot.children) this.structureRoot.children = [];
        this.structureRoot.children.push(modelRoot);

        // 预计算包围盒
        const modelBox = new THREE.Box3().setFromObject(object);
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
                if (mesh.material) {
                    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    materials.forEach(mat => {
                        if ((mat as THREE.MeshStandardMaterial).map) (mat as THREE.MeshStandardMaterial).map!.anisotropy = maxAnisotropy;
                    });
                }
            }
        });

        // 2. 将原始模型加入场景（设为不可见，仅用于数据查询和备份）
        object.visible = false;
        this.contentGroup.add(object);

        // 3. 八叉树划分与分块优化
        if (onProgress) onProgress(10, "正在进行空间划分...");
        
        const items = collectItems(object);
        if (items.length > 0) {
            const bounds = new THREE.Box3();
            items.forEach(item => {
                if (!item.geometry.boundingBox) item.geometry.computeBoundingBox();
                const itemBox = item.geometry.boundingBox!.clone().applyMatrix4(item.matrix);
                bounds.union(itemBox);
            });

            const octree = buildOctree(items, bounds, { maxItemsPerNode: 1000, maxDepth: 4 });
            const leafNodes = collectLeafNodes(octree);
            
            // 4. 注册分块并显示鬼影
            const boxGeo = new THREE.BoxGeometry(1, 1, 1);
            const boxMat = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.3 });

            leafNodes.forEach((node, index) => {
                const chunkId = `${object.uuid}_chunk_${index}`;
                const chunkBounds = node.bounds.clone();
                
                // 为每个构件分配 bimId 和 chunkId
                node.items.forEach(item => {
                    const treeNode = this.nodeMap.get(item.uuid);
                    if (treeNode) {
                        if (treeNode.bimId === undefined) {
                            treeNode.bimId = ++this.componentCounter;
                        }
                        treeNode.chunkId = chunkId;
                    }
                });

                // 注册到 chunks 列表
                this.chunks.push({
                    id: chunkId,
                    bounds: chunkBounds,
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
                    new THREE.EdgesGeometry(boxGeo),
                    boxMat
                );
                edges.name = `ghost_${chunkId}`;
                edges.scale.copy(size);
                edges.position.copy(center);
                this.ghostGroup.add(edges);
            });

            // 隐藏原始网格中的 Mesh 标记优化
            object.traverse(child => {
                if ((child as THREE.Mesh).isMesh) {
                    child.visible = false;
                    child.userData.isOptimized = true;
                }
            });
        }

        this.sceneBounds = this.computeTotalBounds();
        this.initExplodeData();
        this.updateSettings(this.settings);
        if (onProgress) onProgress(100, "模型已加入加载队列");
    }

    removeObject(uuid: string) {
        // 从 contentGroup 中找到对象
        const obj = this.contentGroup.getObjectByProperty("uuid", uuid);
        const node = this.nodeMap.get(uuid);

        const processRemoval = (o: THREE.Object3D | StructureTreeNode) => {
            const id = (o instanceof THREE.Object3D) ? o.uuid : (o as StructureTreeNode).id;
            
            // 移除相关的优化组
            const optimizedGroup = this.contentGroup.getObjectByName(`optimized_${id}`);
            if (optimizedGroup) {
                optimizedGroup.traverse(child => {
                    if ((child as any).isBatchedMesh) {
                        const bm = child as THREE.BatchedMesh;
                        if (bm.geometry) bm.geometry.dispose();
                        if (bm.material) {
                            const materials = Array.isArray(bm.material) ? bm.material : [bm.material];
                            materials.forEach(m => m.dispose());
                        }
                    }
                });
                optimizedGroup.removeFromParent();
            }

            // 处理 BatchedMesh 实例移除（通过隐藏实现）
            const mappings = this.optimizedMapping.get(id);
            if (mappings) {
                mappings.forEach(m => {
                    m.mesh.setVisibleAt(m.instanceId, false);
                });
                this.optimizedMapping.delete(id);
            }

            // 如果是 Mesh，释放资源
            if (o instanceof THREE.Mesh) {
                if (o.geometry) o.geometry.dispose();
                if (o.material) {
                    const materials = Array.isArray(o.material) ? o.material : [o.material];
                    materials.forEach(m => m.dispose());
                }
            }

            // 清理相关的组件映射
            this.componentMap.delete(id);
            if (o instanceof THREE.Object3D && o.userData.expressID !== undefined) {
                this.componentMap.delete(o.userData.expressID);
            }
            // 检查 nodeMap 中的关联 ID
            const nodeInfo = this.nodeMap.get(id);
            if (nodeInfo && nodeInfo.bimId !== undefined) {
                this.componentMap.delete(nodeInfo.bimId);
            }

            this.explodeData.delete(id);
            this.nodeMap.delete(id);
        };

        if (obj) {
            obj.traverse(processRemoval);
            obj.removeFromParent();
        } else if (node) {
            // 如果 contentGroup 中没有（例如 NBIM 模式），则递归清理结构树节点
            const traverseNode = (n: StructureTreeNode) => {
                processRemoval(n);
                if (n.children) n.children.forEach(traverseNode);
            };
            traverseNode(node);
        }

        // 移除关联的分块和鬼影
        this.chunks = this.chunks.filter(c => {
            if (c.originalUuid === uuid || c.id.startsWith(uuid)) {
                const ghost = this.ghostGroup.getObjectByName(`ghost_${c.id}`);
                if (ghost) {
                    this.ghostGroup.remove(ghost);
                    if ((ghost as any).geometry) (ghost as any).geometry.dispose();
                }
                return false;
            }
            return true;
        });

        // 从结构树中彻底移除该节点
        if (this.structureRoot) {
            // 简单递归过滤
            const filterNodes = (nodes: StructureTreeNode[]): StructureTreeNode[] => {
                return nodes.filter(n => {
                    if (n.id === uuid) return false;
                    if (n.children) n.children = filterNodes(n.children);
                    return true;
                });
            };

            if (this.structureRoot.id === uuid) {
                this.structureRoot = null;
            } else if (this.structureRoot.children) {
                this.structureRoot.children = filterNodes(this.structureRoot.children);
            }
        }

        this.sceneBounds = this.computeTotalBounds();
        return true;
    }

    addTileset(url: string) {
        if (this.tilesRenderer) {
            this.tilesRenderer.dispose();
            this.contentGroup.remove(this.tilesRenderer.group);
        }

        const renderer = new TilesRenderer(url);
        renderer.setCamera(this.camera);
        renderer.setResolutionFromRenderer(this.camera, this.renderer);

        // 从当前配置动态设置
        renderer.errorTarget = this.settings.sse;
        renderer.lruCache.maxSize = this.settings.maxMemory * 1024 * 1024;

        // 树更新的钩子
        (renderer as any).onLoadTile = (tile: any) => {
            if (this.onTilesUpdate) this.onTilesUpdate();
        };
        (renderer as any).onDisposeTile = (tile: any) => {
            if (this.onTilesUpdate) this.onTilesUpdate();
        };

        this.contentGroup.add(renderer.group);
        this.tilesRenderer = renderer;

        // 添加到结构树
        const tilesNode: StructureTreeNode = {
            id: (renderer.group as any).uuid,
            name: "3D Tileset",
            type: 'Group',
            children: []
        };
        if (!this.structureRoot.children) this.structureRoot.children = [];
        this.structureRoot.children.push(tilesNode);
        this.nodeMap.set(tilesNode.id, tilesNode);
        
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

    private extractColor(mesh: THREE.Mesh): number {
        if (mesh.userData.color !== undefined) return mesh.userData.color;

        // 尝试从顶点颜色提取（针对某些 BIM 格式）
        const geo = mesh.geometry;
        if (geo && geo.attributes.color) {
            const colorAttr = geo.attributes.color;
            if (colorAttr.count > 0) {
                const r = colorAttr.getX(0);
                const g = colorAttr.getY(0);
                const b = colorAttr.getZ(0);
                // 处理 0-1 或 0-255 范围
                const color = new THREE.Color();
                if (r > 1 || g > 1 || b > 1) color.setRGB(r / 255, g / 255, b / 255);
                else color.setRGB(r, g, b);
                return color.getHex();
            }
        }

        const material = mesh.material;
        if (Array.isArray(material)) {
            for (const mat of material) {
                if ((mat as any).color) return (mat as any).color.getHex();
            }
        } else if ((material as any).color) {
            return (material as any).color.getHex();
        }

        return this.getColorByComponentType(mesh.name);
    }

    private getColorByComponentType(name: string): number {
        const n = name.toLowerCase();
        if (n.includes('col') || n.includes('柱')) return 0xbfdbfe; // blue-200
        if (n.includes('beam') || n.includes('梁')) return 0x93c5fd; // blue-300
        if (n.includes('slab') || n.includes('板')) return 0xe5e7eb; // gray-200
        if (n.includes('wall') || n.includes('墙')) return 0xf3f4f6; // gray-100
        return 0x94a3b8; // gray-400
    }

    // --- NBIM 导入/导出功能 (对齐 refs V7 逻辑) ---
    private generateChunkBinaryV7(items: any[]): ArrayBuffer {
        const uniqueGeos: THREE.BufferGeometry[] = [];
        const geoMap = new Map<THREE.BufferGeometry, number>();
        
        items.forEach(item => {
            if (item.geometry && !geoMap.has(item.geometry)) {
                geoMap.set(item.geometry, uniqueGeos.length);
                uniqueGeos.push(item.geometry);
            }
        });

        // 计算大小
        let size = 4; // Geo Count
        for (const geo of uniqueGeos) {
            const vertCount = geo.attributes.position.count;
            const index = geo.index;
            const indexCount = index ? index.count : 0;
            size += 4 + 4 + (vertCount * 12) + (vertCount * 12); // vertCount, indexCount, pos, norm
            if (indexCount > 0) size += indexCount * 4; 
        }
        
        size += 4; // Instance Count
        size += items.length * (4 + 4 + 4 + 64 + 4); // ID, Type, Color, Matrix, GeoID

        const buffer = new ArrayBuffer(size);
        const dv = new DataView(buffer);
        let offset = 0;

        // 写入几何体
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

        // 写入实例
        dv.setUint32(offset, items.length, true); offset += 4;
        for (const item of items) {
            const treeNode = this.nodeMap.get(item.uuid);
            const id = treeNode?.bimId || 0;
            const typeStr = this.guessType(treeNode?.name || "");
            dv.setUint32(offset, id, true); offset += 4;
            dv.setUint32(offset, this.getTypeIndex(typeStr), true); offset += 4;
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

    private parseChunkBinaryV7(buffer: ArrayBuffer, material: THREE.Material): THREE.BatchedMesh | null {
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
        
        // 估算总顶点和索引数
        let totalVerts = 0;
        let totalIndices = 0;
        geometries.forEach(g => {
            totalVerts += g.attributes.position.count;
            if (g.index) totalIndices += g.index.count;
        });
        
        const bm = new THREE.BatchedMesh(instanceCount, totalVerts, totalIndices, material);
        const geoIds = geometries.map(g => bm.addGeometry(g));

        const matrix = new THREE.Matrix4();
        const color = new THREE.Color();
        const batchIdToUuid = new Map<number, string>();
        const batchIdToColor = new Map<number, number>();

        for (let i = 0; i < instanceCount; i++) {
            const bimId = dv.getUint32(offset, true); offset += 4;
            dv.getUint32(offset, true); offset += 4; // Type
            const hex = dv.getUint32(offset, true); offset += 4;
            color.setHex(hex);

            for (let k = 0; k < 16; k++) {
                matrix.elements[k] = dv.getFloat32(offset, true); offset += 4;
            }
            const geoIdx = dv.getUint32(offset, true); offset += 4;

            const instId = bm.addInstance(geoIds[geoIdx]);
            bm.setMatrixAt(instId, matrix);
            bm.setColorAt(instId, color);
            
            batchIdToUuid.set(instId, `bim_${bimId}`);
            batchIdToColor.set(instId, hex);
        }

        bm.userData.batchIdToUuid = batchIdToUuid;
        bm.userData.batchIdToColor = batchIdToColor;
        return bm;
    }

    async exportNbim() {
        if (this.chunks.length === 0) throw new Error("无模型数据可导出");

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

        for (let i = 0; i < this.chunks.length; i++) {
            const chunk = this.chunks[i];
            const exportChunk = exportChunks[i];
            
            let buffer: ArrayBuffer;
            if (chunk.node) {
                buffer = this.generateChunkBinaryV7(chunk.node.items);
            } else if (chunk.nbimFileId && this.nbimFiles.has(chunk.nbimFileId) && chunk.byteOffset) {
                const file = this.nbimFiles.get(chunk.nbimFileId)!;
                buffer = await file.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength).arrayBuffer();
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
            structureTree: this.structureRoot
        };

        const manifestStr = JSON.stringify(manifest);
        const manifestBytes = new TextEncoder().encode(manifestStr);

        const header = new ArrayBuffer(1024);
        const dv = new DataView(header);
        dv.setUint32(0, 0x4D49424E, true); // Magic 'NBIM'
        dv.setUint32(4, 7, true);          // Version 7
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
        
        const manifestOffset = dv.getUint32(8, true);
        const manifestLen = dv.getUint32(12, true);

        if (onProgress) onProgress(20, "正在读取元数据...");
        const manifestBlob = file.slice(manifestOffset, manifestOffset + manifestLen);
        const manifestText = await manifestBlob.text();
        const manifest = JSON.parse(manifestText);
        
        // 设置或更新场景包围盒
        if (manifest.globalBounds) {
            const newBounds = new THREE.Box3(
                new THREE.Vector3(manifest.globalBounds.min.x, manifest.globalBounds.min.y, manifest.globalBounds.min.z),
                new THREE.Vector3(manifest.globalBounds.max.x, manifest.globalBounds.max.y, manifest.globalBounds.max.z)
            );
            if (this.precomputedBounds.isEmpty()) {
                this.precomputedBounds.copy(newBounds);
            } else {
                this.precomputedBounds.union(newBounds);
            }
            this.sceneBounds.copy(this.precomputedBounds);
        }
        
        const modelRoot = manifest.structureTree;
        if (!this.structureRoot.children) this.structureRoot.children = [];
        this.structureRoot.children.push(modelRoot);

        const rootId = modelRoot?.id || fileId;
        
        // 增量构建节点映射
        if (modelRoot) {
            const traverse = (node: StructureTreeNode) => {
                this.nodeMap.set(node.id, node);
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
            
            const chunkId = c.id;
            this.chunks.push({
                id: chunkId,
                bounds: bounds,
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
            const center = new THREE.Vector3();
            bounds.getCenter(center);

            const edges = new THREE.LineSegments(
                new THREE.EdgesGeometry(boxGeo),
                boxMat
            );
            edges.name = `ghost_${chunkId}`;
            edges.scale.copy(size);
            edges.position.copy(center);
            this.ghostGroup.add(edges);
        });

        this.fitView();
        if (onProgress) onProgress(100, "NBIM 已就绪，正在按需加载...");
    }

    clear() {
        // 清理场景中的内容
        while(this.contentGroup.children.length > 0) {
            const child = this.contentGroup.children[0];
            this.removeObject(child.uuid);
        }
        if (this.tilesRenderer) {
            this.tilesRenderer.dispose();
            this.tilesRenderer = null;
        }
        this.ghostGroup.clear();
        this.selectionBox.visible = false;
        this.highlightMesh.visible = false;
        this.clearAllMeasurements();
        this.explodeData.clear();
        this.optimizedMapping.clear();
        this.sceneBounds.makeEmpty();
        this.precomputedBounds.makeEmpty();
        this.nbimFiles.clear();
        this.structureRoot = { id: 'root', name: 'Root', type: 'Group', children: [] };
        this.nodeMap.clear();
        this.chunks = [];
        this.componentMap.clear();
        this.componentCounter = 0;
    }

    setObjectVisibility(uuid: string, visible: boolean) {
        // 更新结构树中的状态
        const node = this.nodeMap.get(uuid);
        if (node) {
            const setVisibleRecursive = (n: StructureTreeNode) => {
                n.visible = visible;
                if (n.children) n.children.forEach(setVisibleRecursive);
            };
            setVisibleRecursive(node);
        }

        const obj = this.contentGroup.getObjectByProperty("uuid", uuid);
        if (!obj) {
            // 如果在 contentGroup 中找不到，可能已经被优化掉了
            // 我们尝试直接根据 node 递归更新 mappings
            if (node) {
                const updateMappingsRecursive = (n: StructureTreeNode) => {
                    const mappings = this.optimizedMapping.get(n.id);
                    if (mappings) {
                        mappings.forEach(m => {
                            m.mesh.setVisibleAt(m.instanceId, visible);
                        });
                    }
                    if (n.children) n.children.forEach(updateMappingsRecursive);
                };
                updateMappingsRecursive(node);
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
    }

    highlightObject(uuid: string | null) {
        // 清除之前的 BatchedMesh 高亮 (恢复原始颜色)
        this.optimizedMapping.forEach((mappings) => {
            mappings.forEach(m => {
                m.mesh.setColorAt(m.instanceId, new THREE.Color(m.originalColor));
            });
        });
        // 标记所有 BatchedMesh 材质颜色需要更新
        this.contentGroup.traverse(o => {
            if ((o as any).isBatchedMesh) {
                const bm = o as THREE.BatchedMesh;
                if (bm.geometry.getAttribute('color')) bm.geometry.getAttribute('color').needsUpdate = true;
            }
        });

        this.selectionBox.visible = false;
        this.highlightMesh.visible = false;
        
        if (!uuid) return;

        const obj = this.contentGroup.getObjectByProperty("uuid", uuid);
        if (!obj) return;

        // 处理 BatchedMesh 高亮
        const mappings = this.optimizedMapping.get(uuid);
        if (mappings) {
            mappings.forEach(m => {
                m.mesh.setColorAt(m.instanceId, new THREE.Color(0xffaa00));
                if (m.mesh.geometry.getAttribute('color')) m.mesh.geometry.getAttribute('color').needsUpdate = true;
            });
        }

        if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            this.highlightMesh.geometry = mesh.geometry;
            obj.updateMatrixWorld(true);
            
            const worldPos = new THREE.Vector3();
            const worldQuat = new THREE.Quaternion();
            const worldScale = new THREE.Vector3();
            obj.matrixWorld.decompose(worldPos, worldQuat, worldScale);

            this.highlightMesh.position.copy(worldPos);
            this.highlightMesh.quaternion.copy(worldQuat);
            this.highlightMesh.scale.copy(worldScale);
            this.highlightMesh.visible = true;
        } 
        else {
            const box = new THREE.Box3();
            if (obj.userData.boundingBox) {
                box.copy(obj.userData.boundingBox).applyMatrix4(obj.matrixWorld);
            } else {
                box.setFromObject(obj);
            }

            if (!box.isEmpty()) {
                this.selectionBox.box.copy(box);
                this.selectionBox.visible = true;
            }
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
        
        const interactables: THREE.Object3D[] = [];
        this.contentGroup.traverse(o => {
            if (o.visible && ((o as THREE.Mesh).isMesh || (o as any).isBatchedMesh)) {
                // 如果是被优化的原始网格，跳过它，我们拾取 BatchedMesh
                if (o.userData.isOptimized) return;
                interactables.push(o);
            }
        });

        const intersects = this.raycaster.intersectObjects(interactables, false); 
        if (intersects.length > 0) {
            const hit = intersects[0];
            // 如果拾取到的是 BatchedMesh，我们需要将其转换为原始 Object3D 或 Proxy
            if ((hit.object as any).isBatchedMesh) {
                const bm = hit.object as THREE.BatchedMesh;
                const batchId = (hit as any).batchId;
                if (batchId !== undefined) {
                    const originalUuid = (bm.userData.batchIdToUuid as Map<number, string>)?.get(batchId);
                    if (originalUuid) {
                        const originalObj = this.contentGroup.getObjectByProperty("uuid", originalUuid);
                        if (originalObj) {
                            (hit as any).object = originalObj;
                        } else {
                            // NBIM 模式下可能没有原始对象，返回一个 Proxy Object
                            const node = this.nodeMap.get(originalUuid);
                            if (node) {
                                (hit as any).object = {
                                    uuid: node.id,
                                    name: node.name,
                                    type: node.type,
                                    isMesh: node.type === 'Mesh',
                                    userData: {},
                                    parent: null,
                                    children: [],
                                    getWorldPosition: (v: THREE.Vector3) => {
                                        // 从 BatchedMesh 实例矩阵获取位置
                                        const mat = new THREE.Matrix4();
                                        bm.getMatrixAt(batchId, mat);
                                        return v.setFromMatrixPosition(mat);
                                    }
                                };
                            }
                        }
                    }
                }
            }
            return hit;
        }
        return null;
    }

    computeTotalBounds(): THREE.Box3 {
        const totalBox = new THREE.Box3();
        this.contentGroup.updateMatrixWorld(true);
        this.contentGroup.traverse(child => {
            if (child.visible) {
                if ((child as THREE.Mesh).isMesh) {
                    const box = new THREE.Box3().setFromObject(child);
                    if (!box.isEmpty()) totalBox.union(box);
                } else if ((child as any).isBatchedMesh) {
                    const bm = child as THREE.BatchedMesh;
                    // 对 BatchedMesh，我们需要遍历其所有实例
                    const count = bm.count;
                    const matrix = new THREE.Matrix4();
                    const box = new THREE.Box3();
                    // 这里简化处理：使用 BatchedMesh 的边界
                    // 注意：Three.js BatchedMesh 没有内置的 getBoundingBox，
                    // 实际项目中可能需要预计算或从几何体计算
                    if (bm.geometry.boundingBox) {
                        for (let i = 0; i < count; i++) {
                            if (bm.getVisibleAt(i)) {
                                bm.getMatrixAt(i, matrix);
                                box.copy(bm.geometry.boundingBox).applyMatrix4(matrix);
                                totalBox.union(box);
                            }
                        }
                    }
                }
            }
        });
        return totalBox;
    }

    fitView(keepOrientation = false) {
        this.contentGroup.updateMatrixWorld(true);
        let box = this.computeTotalBounds();
        
        // 关键改进：如果计算出的包围盒为空（可能模型还没加载完），使用预计算的包围盒
        if (box.isEmpty() && !this.precomputedBounds.isEmpty()) {
            box = this.precomputedBounds.clone();
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
        const box = this.computeTotalBounds();
        this.sceneBounds = box.clone();
        
        const center = box.isEmpty() ? new THREE.Vector3(0,0,0) : box.getCenter(new THREE.Vector3());
        const dist = 5000;

        let pos = new THREE.Vector3();
        switch(view) {
            case 'top': pos.set(0, 0, dist); break;
            case 'bottom': pos.set(0, 0, -dist); break;
            case 'front': pos.set(0, -dist, 0); break;
            case 'back': pos.set(0, dist, 0); break;
            case 'left': pos.set(-dist, 0, 0); break;
            case 'right': pos.set(dist, 0, 0); break;
            case 'se': pos.set(dist, -dist, dist); break;
            case 'sw': pos.set(-dist, -dist, dist); break;
            case 'ne': pos.set(dist, dist, dist); break;
            case 'nw': pos.set(-dist, dist, dist); break;
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
        this.clearMeasurementPreview();
    }

    addMeasurePoint(point: THREE.Vector3): { id: string, type: string, val: string } | null {
        if (this.measureType === 'none') return null;

        this.currentMeasurePoints.push(point);
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
            color: 0xffff00, 
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
        let typeStr = this.measureType; 

        if (this.measureType === 'dist') {
            const p1 = this.currentMeasurePoints[0];
            const p2 = this.currentMeasurePoints[1];
            const dist = p1.distanceTo(p2);
            
            const dx = Math.abs(p2.x - p1.x);
            const dy = Math.abs(p2.y - p1.y);
            const dz = Math.abs(p2.z - p1.z);

            valStr = `${dist.toFixed(3)} (Δx:${dx.toFixed(2)}, Δy:${dy.toFixed(2)}, Δz:${dz.toFixed(2)})`;
            this.addLine(this.currentMeasurePoints, group);
        } else if (this.measureType === 'angle') {
            const p1 = this.currentMeasurePoints[0];
            const center = this.currentMeasurePoints[1];
            const p2 = this.currentMeasurePoints[2];
            const v1 = p1.clone().sub(center).normalize();
            const v2 = p2.clone().sub(center).normalize();
            const angle = v1.angleTo(v2) * (180 / Math.PI);
            valStr = angle.toFixed(2) + "°";
            this.addLine(this.currentMeasurePoints, group);
        } else {
            const p = this.currentMeasurePoints[0];
            valStr = `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`;
        }

        this.measureGroup.add(group);
        this.measureRecords.set(id, { id, type: typeStr, val: valStr, group });
        
        this.currentMeasurePoints = [];
        this.clearMeasurementPreview();
        
        return { id, type: typeStr, val: valStr };
    }

    addMarker(point: THREE.Vector3, parent: THREE.Object3D) {
        const markerGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([point.x, point.y, point.z], 3));
        const markerMat = new THREE.PointsMaterial({ color: 0xffff00, size: 8, map: this.dotTexture, transparent: true, alphaTest: 0.5, depthTest: false });
        const marker = new THREE.Points(markerGeo, markerMat);
        marker.renderOrder = 999;
        parent.add(marker);
    }

    addLine(points: THREE.Vector3[], parent: THREE.Object3D) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xffff00, depthTest: false, linewidth: 2 });
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
            }
        }
    }

    clearAllMeasurements() {
        this.measureRecords.forEach(record => {
            this.measureGroup.remove(record.group);
        });
        this.measureRecords.clear();
        this.clearMeasurementPreview();
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
    }

    setClippingEnabled(enabled: boolean) {
        this.renderer.clippingPlanes = enabled ? this.clippingPlanes : [];
    }

    updateClippingPlanes(bounds: THREE.Box3, values: {x:number[], y:number[], z:number[]}, active: {x:boolean, y:boolean, z:boolean}) {
        const { min, max } = bounds;
        const size = max.clone().sub(min);
        
        const xMin = min.x + (values.x[0] / 100) * size.x;
        const xMax = min.x + (values.x[1] / 100) * size.x;
        const yMin = min.y + (values.y[0] / 100) * size.y;
        const yMax = min.y + (values.y[1] / 100) * size.y;
        const zMin = min.z + (values.z[0] / 100) * size.z;
        const zMax = min.z + (values.z[1] / 100) * size.z;

        if (active.x) {
            this.clippingPlanes[0].constant = -xMin;
            this.clippingPlanes[1].constant = xMax;
        } else {
            this.clippingPlanes[0].constant = Infinity;
            this.clippingPlanes[1].constant = Infinity;
        }

        if (active.y) {
            this.clippingPlanes[2].constant = -yMin;
            this.clippingPlanes[3].constant = yMax;
        } else {
            this.clippingPlanes[2].constant = Infinity;
            this.clippingPlanes[3].constant = Infinity;
        }

        if (active.z) {
            this.clippingPlanes[4].constant = -zMin;
            this.clippingPlanes[5].constant = zMax;
        } else {
            this.clippingPlanes[4].constant = Infinity;
            this.clippingPlanes[5].constant = Infinity;
        }
    }

    // --- Explode Logic ---

    initExplodeData() {
        this.explodeData.clear();
        this.contentGroup.updateMatrixWorld(true);
        const box = this.computeTotalBounds();
        this.sceneCenter.copy(box.getCenter(new THREE.Vector3()));
        
        this.contentGroup.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh && obj.name !== "__EdgesHelper") {
                this.explodeData.set(obj.uuid, {
                    originalPos: obj.position.clone(),
                    direction: new THREE.Vector3() 
                });
            }
        });

        this.contentGroup.traverse((obj) => {
             if ((obj as THREE.Mesh).isMesh && this.explodeData.has(obj.uuid)) {
                 const worldPos = new THREE.Vector3();
                 obj.getWorldPosition(worldPos);
                 
                 let dir = worldPos.clone().sub(this.sceneCenter).normalize();
                 if(dir.lengthSq() === 0) dir.set(0,0,1); 

                 if (obj.parent) {
                    const parentQuat = new THREE.Quaternion();
                    obj.parent.getWorldQuaternion(parentQuat);
                    dir.applyQuaternion(parentQuat.invert());
                 }
                 
                 this.explodeData.get(obj.uuid)!.direction = dir;
             }
        });
    }

    setExplodeFactor(factor: number) {
        if (this.explodeData.size === 0) this.initExplodeData();
        const maxDist = 100;
        this.contentGroup.traverse((obj) => {
            const data = this.explodeData.get(obj.uuid);
            if (data) {
                const offset = data.direction.clone().multiplyScalar(factor * maxDist);
                obj.position.copy(data.originalPos).add(offset);
            }
        });
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
        this.renderer.dispose();
        if (this.tilesRenderer) this.tilesRenderer.dispose();
    }
}
