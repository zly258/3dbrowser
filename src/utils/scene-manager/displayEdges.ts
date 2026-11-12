import * as THREE from "three";

/**
 * 构件边线生成器：只为“真实的几何棱边”生成线，不显示三角形网格线。
 *  - 普通 Mesh：对几何体做 EdgesGeometry(阈值角) 后作为子节点挂载；
 *  - BatchedMesh：按实例读取几何体与实例矩阵，把棱边顶点变换到批量网格局部空间后合并成一条 LineSegments。
 * 用于「真实（着色 + 边线）」与「线框（仅边线）」。
 */

const EDGE_ANGLE = 30;
/** 单个批量网格的边线顶点预算，超出部分不再生成（避免超大场景内存暴涨） */
const MAX_EDGE_VERTS_PER_BATCH = 6000000;

export class DisplayEdgeBuilder {
    private geometryEdgeCache = new Map<string, Float32Array>();
    private material = new THREE.LineBasicMaterial({
        color: 0x23292f,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
    });
    private objects: THREE.LineSegments[] = [];
    private lineColor = 0x23292f;
    private baseOpacity = 0.62;
    private opacityFactor = 1;

    private applyOpacity() {
        const next = THREE.MathUtils.clamp(this.baseOpacity * this.opacityFactor, 0.08, 1);
        if (Math.abs(next - this.material.opacity) < 0.001) return;
        this.material.opacity = next;
    }

    /** 真实模式边线更淡，线框模式更清晰 */
    setBaseOpacity(opacity: number) {
        this.baseOpacity = THREE.MathUtils.clamp(opacity, 0.1, 1);
        this.applyOpacity();
    }

    /** 远景衰减系数（0~1），用于避免缩小看全局时边线糊成一片发黑发粗 */
    setOpacityFactor(factor: number) {
        this.opacityFactor = THREE.MathUtils.clamp(factor, 0.2, 1);
        this.applyOpacity();
    }

    /** 根据视口底色自动选择边线颜色：浅底用深线，深底用浅线，保证线框可读 */
    setBackground(color: THREE.ColorRepresentation) {
        const background = new THREE.Color(color);
        const luminance = 0.2126 * background.r + 0.7152 * background.g + 0.0722 * background.b;
        const next = luminance > 0.45 ? 0x23292f : 0xb9c2cc;
        if (next === this.lineColor) return;
        this.lineColor = next;
        this.material.color.setHex(next);
        this.material.needsUpdate = true;
    }

    /** 几何体棱边顶点（局部坐标），按 geometry.uuid 缓存 */
    private getGeometryEdges(geometry: THREE.BufferGeometry): Float32Array | null {
        if (!geometry) return null;
        const cached = this.geometryEdgeCache.get(geometry.uuid);
        if (cached) return cached;
        try {
            const edgesGeometry = new THREE.EdgesGeometry(geometry, EDGE_ANGLE);
            const attribute = edgesGeometry.getAttribute("position");
            if (!attribute) {
                edgesGeometry.dispose();
                return null;
            }
            const copy = new Float32Array(attribute.array as ArrayLike<number>);
            edgesGeometry.dispose();
            this.geometryEdgeCache.set(geometry.uuid, copy);
            return copy;
        } catch {
            return null;
        }
    }

    private createLine(positions: Float32Array): THREE.LineSegments {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.computeBoundingSphere();
        const line = new THREE.LineSegments(geometry, this.material);
        line.name = "__displayEdges";
        line.userData.isDisplayEdges = true;
        line.raycast = () => {};
        line.renderOrder = 1;
        return line;
    }

    private attachToMesh(mesh: THREE.Mesh) {
        if (mesh.userData.__displayEdges) return;
        const positions = this.getGeometryEdges(mesh.geometry);
        if (!positions || positions.length === 0) return;
        const line = this.createLine(positions);
        mesh.add(line);
        mesh.userData.__displayEdges = line;
        this.objects.push(line);
    }

    private attachToBatch(batch: THREE.BatchedMesh) {
        if (batch.userData.__displayEdges) return;
        const geometryById = batch.userData.batchIdToGeometry as Map<number, THREE.BufferGeometry> | undefined;
        if (!geometryById) return;

        const instanceCount = (batch as any).instanceCount ?? 0;
        if (instanceCount <= 0) return;

        const plans: Array<{ edges: Float32Array; matrix: THREE.Matrix4 }> = [];
        let totalVerts = 0;
        const matrix = new THREE.Matrix4();
        const visibility = (batch as any).getVisibleAt ? batch as any : null;

        for (let instanceId = 0; instanceId < instanceCount; instanceId++) {
            if (visibility && visibility.getVisibleAt(instanceId) === false) continue;
            const geometry = geometryById.get(instanceId);
            if (!geometry) continue;
            const edges = this.getGeometryEdges(geometry);
            if (!edges || edges.length === 0) continue;
            totalVerts += edges.length / 3;
            if (totalVerts > MAX_EDGE_VERTS_PER_BATCH) break;
            batch.getMatrixAt(instanceId, matrix);
            plans.push({ edges, matrix: matrix.clone() });
        }
        if (plans.length === 0) return;

        const positions = new Float32Array(totalVerts * 3);
        const vertex = new THREE.Vector3();
        let offset = 0;
        for (const plan of plans) {
            const edges = plan.edges;
            for (let i = 0; i < edges.length; i += 3) {
                vertex.set(edges[i], edges[i + 1], edges[i + 2]).applyMatrix4(plan.matrix);
                positions[offset++] = vertex.x;
                positions[offset++] = vertex.y;
                positions[offset++] = vertex.z;
            }
        }

        const line = this.createLine(positions);
        line.userData.isBatchedEdges = true;
        batch.add(line);
        batch.userData.__displayEdges = line;
        this.objects.push(line);
    }

    /** 为根节点下的内容生成棱边线；append=false 时先清理已有边线 */
    buildFor(root: THREE.Object3D, append = false) {
        if (!root) return;
        if (!append) this.clear();
        root.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh || !mesh.geometry) return;
            if ((object as any).isLine || (object as any).isLineSegments || (object as any).isPoints) return;
            if ((object as any).isBatchedMesh) {
                this.attachToBatch(object as THREE.BatchedMesh);
            } else {
                this.attachToMesh(mesh);
            }
        });
    }

    setVisible(visible: boolean) {
        for (const object of this.objects) object.visible = visible;
    }

    /** 爆炸状态下批量网格的实例矩阵会变化，合并后的边线不再准确，先隐藏 */
    setBatchedVisible(visible: boolean) {
        for (const object of this.objects) {
            if (object.userData.isBatchedEdges) object.visible = visible;
        }
    }

    clear() {
        for (const object of this.objects) {
            const parent = object.parent as any;
            if (parent?.userData) delete parent.userData.__displayEdges;
            object.removeFromParent();
            object.geometry.dispose();
        }
        this.objects = [];
    }

    /** 单个对象被销毁/移除时清理它的边线（分块网格回收） */
    releaseFor(object: THREE.Object3D) {
        const line = (object.userData as any)?.__displayEdges as THREE.LineSegments | undefined;
        if (!line) return;
        delete (object.userData as any).__displayEdges;
        line.removeFromParent();
        line.geometry.dispose();
        this.objects = this.objects.filter((item) => item !== line);
    }

    dispose() {
        this.clear();
        this.geometryEdgeCache.clear();
        this.material.dispose();
    }
}
