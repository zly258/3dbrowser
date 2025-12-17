

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { TilesRenderer } from "3d-tiles-renderer";
import { calculateGeometryMemory } from "./converter";

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
    progressive: boolean;
    hideRatio: number; // 0 to 1
    progressiveThreshold: number; // Minimum meshes to enable progressive loading
    sse: number;
    maxMemory: number;
    // Import Settings (Applied on Load)
    importAxisGLB: AxisOption;
    importAxisIFC: AxisOption;
}

export class SceneManager {
    canvas: HTMLCanvasElement;
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    controls: OrbitControls;
    
    // Groups
    contentGroup: THREE.Group; 
    helpersGroup: THREE.Group;
    measureGroup: THREE.Group;
    
    // Lights
    ambientLight: THREE.AmbientLight;
    dirLight: THREE.DirectionalLight;
    backLight: THREE.DirectionalLight;

    // References
    tilesRenderer: TilesRenderer | null = null;
    selectionBox: THREE.Box3Helper;
    highlightMesh: THREE.Mesh; 
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;

    // Measurement State
    measureType: MeasureType = 'none';
    currentMeasurePoints: THREE.Vector3[] = [];
    previewLine: THREE.Line | null = null;
    tempMarker: THREE.Points; 
    measureRecords: Map<string, MeasurementRecord> = new Map();
    
    // Clipping State
    clippingPlanes: THREE.Plane[] = [];
    
    // Explode State
    explodeData: Map<string, { originalPos: THREE.Vector3, direction: THREE.Vector3 }> = new Map();
    sceneCenter: THREE.Vector3 = new THREE.Vector3();
    
    // Optimization / Progressive Loading
    lastMoveTime: number = 0;
    restoreDelay: number = 500; // ms to wait before showing meshes again
    allMeshes: THREE.Mesh[] = [];
    hiddenMeshes: THREE.Mesh[] = [];
    progressiveQueue: THREE.Mesh[] = [];
    
    // Settings
    settings: SceneSettings = {
        ambientInt: 2.0,
        dirInt: 1.0,
        bgColor: "#1e1e1e",
        wireframe: false,
        progressive: true,
        hideRatio: 0.6,
        progressiveThreshold: 15000, // Updated default
        sse: 16,
        maxMemory: 500,
        importAxisGLB: '+y', // Standard for GLB
        importAxisIFC: '+z', // Standard for IFC
    };

    // Assets
    dotTexture: THREE.Texture;
    
    // Cache
    sceneBounds: THREE.Box3 = new THREE.Box3();
    
    // Callback
    onTilesUpdate?: () => void;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        // Generate a simple circular sprite texture for Points
        this.dotTexture = this.createCircleTexture();

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            logarithmicDepthBuffer: true,
            precision: "highp"
        });
        // IMPORTANT: Initial size set. 
        // We use setSize(w, h, false) in resize() to prevent inline styles from locking the size,
        // allowing CSS (width: 100%, height: 100%) to handle the layout reflow.
        this.renderer.setSize(width, height, false);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setClearColor(this.settings.bgColor);
        this.renderer.localClippingEnabled = true; 
        
        // Scene
        this.scene = new THREE.Scene();
        
        // Groups
        this.contentGroup = new THREE.Group();
        this.contentGroup.name = "Content";
        this.scene.add(this.contentGroup);

        this.helpersGroup = new THREE.Group();
        this.helpersGroup.name = "Helpers";
        this.scene.add(this.helpersGroup);

        this.measureGroup = new THREE.Group();
        this.measureGroup.name = "Measure";
        this.scene.add(this.measureGroup);

        // Camera
        const frustumSize = 100;
        const aspect = width / height;
        this.camera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2,
            frustumSize * aspect / 2,
            frustumSize / 2,
            frustumSize / -2,
            0.1, 10000 
        );
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(1000, 1000, 1000);
        this.camera.lookAt(0, 0, 0);

        // Controls
        this.controls = new OrbitControls(this.camera, canvas);
        this.controls.enableDamping = false;
        this.controls.screenSpacePanning = true;
        this.controls.maxPolarAngle = Math.PI;

        // --- Interaction hooks for Progressive Loading ---
        // Use 'change' event to detect actual camera movement (rotation/zoom/pan)
        // 'start' triggers on click even if no movement occurs, so we avoid it.
        this.controls.addEventListener('change', () => {
            this.handleCameraMove();
        });
        
        // Lights
        this.ambientLight = new THREE.AmbientLight(0xffffff, this.settings.ambientInt); 
        this.scene.add(this.ambientLight);
        this.dirLight = new THREE.DirectionalLight(0xffffff, this.settings.dirInt);
        this.dirLight.position.set(50, 50, 100);
        this.scene.add(this.dirLight);
        this.backLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.backLight.position.set(-50, -50, -10);
        this.scene.add(this.backLight);

        // Selection Helpers
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

        // Measurement Helpers (Points)
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

        // Clipping Setup
        this.setupClipping();

        // Raycasting
        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Points.threshold = 10; 

        this.mouse = new THREE.Vector2();

        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }
    
    updateSettings(newSettings: Partial<SceneSettings>) {
        this.settings = { ...this.settings, ...newSettings };

        // Apply Lighting
        this.ambientLight.intensity = this.settings.ambientInt;
        this.dirLight.intensity = this.settings.dirInt;

        // Apply BG
        this.renderer.setClearColor(this.settings.bgColor);

        // Apply Wireframe Mode (Global Override)
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

        // Apply Tiles Config
        if (this.tilesRenderer) {
            this.tilesRenderer.errorTarget = this.settings.sse;
            this.tilesRenderer.lruCache.maxSize = this.settings.maxMemory * 1024 * 1024;
            // Force tiles renderer to re-evaluate
            this.tilesRenderer.setCamera(this.camera);
        }

        // Force render if not busy
        this.renderer.render(this.scene, this.camera);
    }
    
    handleCameraMove() {
        this.lastMoveTime = Date.now();

        // If optimizations enabled and enough meshes
        if (this.settings.progressive && this.allMeshes.length >= this.settings.progressiveThreshold) {
            // Only hide if we aren't already hiding (to avoid re-looping every frame)
            if (this.hiddenMeshes.length === 0) {
                this.hideMeshes();
            }
        }
    }

    hideMeshes() {
        // Clear restore queue if any
        if (this.progressiveQueue.length > 0) {
            this.hiddenMeshes.push(...this.progressiveQueue);
            this.progressiveQueue = [];
        }

        const ratio = this.settings.hideRatio; 
        let shouldHideCounter = 0;
        
        for (let i = 0; i < this.allMeshes.length; i++) {
            shouldHideCounter += ratio;
            if (shouldHideCounter >= 1) {
                const mesh = this.allMeshes[i];
                if (mesh.visible) {
                    mesh.visible = false;
                    this.hiddenMeshes.push(mesh);
                }
                shouldHideCounter -= 1;
            }
        }
    }

    restoreMeshes() {
        // Move everything from hidden to queue
        if (this.hiddenMeshes.length > 0) {
            this.progressiveQueue.push(...this.hiddenMeshes);
            this.hiddenMeshes = [];
        }
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
        
        const now = Date.now();

        // Check if we should restore meshes (debounce)
        if (this.hiddenMeshes.length > 0 && (now - this.lastMoveTime > this.restoreDelay)) {
            this.restoreMeshes();
        }

        // Process restore queue (staggered appearance)
        if (this.progressiveQueue.length > 0) {
             const batchSize = 1000; 
             const batch = this.progressiveQueue.splice(0, batchSize);
             for (const m of batch) {
                 m.visible = true;
             }
        }
        
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
        
        // Ensure size is positive
        if (w === 0 || h === 0) return;

        const aspect = w / h;
        const cam = this.camera;
        const frustumHeight = cam.top - cam.bottom;
        const newWidth = frustumHeight * aspect;
        
        cam.left = -newWidth / 2;
        cam.right = newWidth / 2;
        cam.updateProjectionMatrix();
        
        // CRITICAL FIX: Pass false as third argument.
        // updateStyle = false.
        // This ensures Three.js doesn't overwrite the canvas inline styles (width/height px).
        // It keeps the internal render resolution matching the clientWidth/Height,
        // but lets CSS (width: 100%) handle the actual display size in the flex container.
        this.renderer.setSize(w, h, false);
        
        // Force render on resize
        this.renderer.render(this.scene, this.camera);
    }

    // Refresh the list of static meshes for optimization
    refreshMeshCache() {
        this.allMeshes = [];
        this.hiddenMeshes = [];
        this.progressiveQueue = [];
        
        this.contentGroup.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh && !(obj as THREE.InstancedMesh).isInstancedMesh) {
                // Only consider valid meshes
                this.allMeshes.push(obj as THREE.Mesh);
            }
        });
    }

    addModel(object: THREE.Object3D) {
        object.updateMatrixWorld(true);
        
        // 1. Optimize Textures
        const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
        object.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                const mat = mesh.material as THREE.MeshStandardMaterial;
                if (mat.map) mat.map.anisotropy = maxAnisotropy;
                if (mat.normalMap) mat.normalMap.anisotropy = maxAnisotropy;
                
                mat.side = THREE.DoubleSide;
                mat.shadowSide = THREE.DoubleSide;
            }
        });

        this.contentGroup.add(object);
        
        // Cache bounds for camera logic
        this.sceneBounds = this.computeTotalBounds();
        this.initExplodeData();
        this.refreshMeshCache();
        
        // Apply current rotation setting immediately
        this.updateSettings(this.settings);
    }

    addTileset(url: string) {
        if (this.tilesRenderer) {
            this.tilesRenderer.dispose();
            this.contentGroup.remove(this.tilesRenderer.group);
        }

        const renderer = new TilesRenderer(url);
        renderer.setCamera(this.camera);
        renderer.setResolutionFromRenderer(this.camera, this.renderer);
        // Removed hardcoded rotation to rely on tileset.json configuration
        renderer.group.name = "3D Tileset";

        // Dynamic Settings from current config
        renderer.errorTarget = this.settings.sse;
        renderer.lruCache.maxSize = this.settings.maxMemory * 1024 * 1024;

        // Hooks for Tree Update
        (renderer as any).onLoadTile = (tile: any) => {
            if (this.onTilesUpdate) this.onTilesUpdate();
        };
        (renderer as any).onDisposeTile = (tile: any) => {
            if (this.onTilesUpdate) this.onTilesUpdate();
        };

        this.contentGroup.add(renderer.group);
        this.tilesRenderer = renderer;
        
        // Apply rotation if needed
        this.updateSettings(this.settings);
        
        return renderer.group;
    }

    clear() {
        while(this.contentGroup.children.length > 0){ 
            this.contentGroup.remove(this.contentGroup.children[0]); 
        }
        if (this.tilesRenderer) {
            this.tilesRenderer.dispose();
            this.tilesRenderer = null;
        }
        this.selectionBox.visible = false;
        this.highlightMesh.visible = false;
        this.clearAllMeasurements();
        this.explodeData.clear();
        this.sceneBounds.makeEmpty();
        this.allMeshes = [];
        this.renderer.render(this.scene, this.camera);
    }

    highlightObject(uuid: string | null) {
        this.selectionBox.visible = false;
        this.highlightMesh.visible = false;

        if (!uuid) return;

        const obj = this.contentGroup.getObjectByProperty("uuid", uuid);
        if (!obj) return;

        if ((obj as THREE.Mesh).isMesh && !(obj as THREE.InstancedMesh).isInstancedMesh) {
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

    pick(clientX: number, clientY: number): THREE.Intersection | null {
        return this.getRayIntersects(clientX, clientY);
    }

    getRayIntersects(clientX: number, clientY: number): THREE.Intersection | null {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const interactables: THREE.Object3D[] = [];
        this.contentGroup.traverse(o => {
            if (!o.visible) return;
            if ((o as THREE.Mesh).isMesh) {
                let visible = true;
                let p = o.parent;
                while(p) {
                    if (!p.visible) { visible = false; break; }
                    p = p.parent;
                }
                if(visible) interactables.push(o);
            }
        });

        const intersects = this.raycaster.intersectObjects(interactables, false); 
        return intersects.length > 0 ? intersects[0] : null;
    }

    computeTotalBounds(): THREE.Box3 {
        const totalBox = new THREE.Box3();
        this.contentGroup.updateMatrixWorld(true);
        this.contentGroup.traverse(child => {
            if (!child.visible) return;
            if((child as THREE.Mesh).isMesh) {
                const box = new THREE.Box3().setFromObject(child);
                if(!box.isEmpty()) totalBox.union(box);
            }
        });
        return totalBox;
    }

    fitView(keepOrientation = false) {
        this.contentGroup.updateMatrixWorld(true);
        const box = this.computeTotalBounds();
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

    // --- Measurement Logic ---
    startMeasurement(type: MeasureType) {
        this.measureType = type;
        this.currentMeasurePoints = [];
        this.clearMeasurementPreview();
    }

    addMeasurePoint(point: THREE.Vector3): { id: string, type: string, val: string } | null {
        if (this.measureType === 'none') return null;

        this.currentMeasurePoints.push(point);
        this.addMarker(point, this.measureGroup); 

        // Check completion
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
        // Clean up
        for (let i = this.measureGroup.children.length - 1; i >= 0; i--) {
            const child = this.measureGroup.children[i];
            if (!child.name.startsWith("measure_") && child !== this.previewLine) {
                this.measureGroup.remove(child);
            }
        }
    }

    // --- Clipping Logic ---

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
            if ((obj as THREE.Mesh).isMesh && obj.name !== "__EdgesHelper") {
                meshes++;
                const mesh = obj as THREE.Mesh;
                if (mesh.geometry) {
                    if (mesh.geometry.index) {
                        faces += mesh.geometry.index.count / 3;
                    } else if (mesh.geometry.attributes.position) {
                        faces += mesh.geometry.attributes.position.count / 3;
                    }
                    memory += calculateGeometryMemory(mesh.geometry);
                }
                if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
                    const im = mesh as THREE.InstancedMesh;
                    faces *= im.count; 
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
