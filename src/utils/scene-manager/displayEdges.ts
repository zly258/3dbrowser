import * as THREE from "three";
import { clearBatchedGeometryViews, getBatchedInstanceGeometry } from "./batchedGeometryView";

/**
 * 构件边线生成器：只为“真实的几何棱边”生成线，不显示三角形网格线。
 *  - 普通 Mesh：对几何体做 EdgesGeometry(阈值角) 后作为子节点挂载；
 *  - BatchedMesh：按实例读取几何体与实例矩阵，把棱边顶点变换到批量网格局部空间后合并成一条 LineSegments。
 * 用于「真实（着色 + 边线）」与「线框（仅边线）」。
 */

const EDGE_ANGLE = 30;
/** 单个批量网格的边线顶点预算，超出部分不再生成（避免超大场景内存暴涨） */
const MAX_EDGE_VERTS_PER_BATCH = 6000000;
/**
 * 单个分块索引数超过该值就跳过棱边生成：
 * EdgesGeometry 的耗时与索引数成正比，个别分块可达 500 万+ 索引（约 200 万三角面），
 * 单块就要十几秒，是切“真实/线框”样式卡死的主因。跳过这些超大块后，
 * 它们仍保留实体着色，只是没有描边。
 */
const EDGE_MAX_INDEX_PER_BATCH = 200000;
/** 单个几何索引数超过该值时跳过的描边，避免个别超大网格拖垮整块 */
const EDGE_MAX_INDEX_PER_GEOMETRY = 80000;

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
    /** 全部边线顶点的总字节预算；超过后不再为新分块生成（防止切线框时 OOM） */
    private byteBudget = Number.POSITIVE_INFINITY;
    private totalBytes = 0;

    /** 设置边线总字节预算（MB）；不传则不限 */
    setByteBudget(mb?: number) {
        this.byteBudget = mb && mb > 0 ? mb * 1048576 : Number.POSITIVE_INFINITY;
    }

    private canAllocate(bytes: number) {
        return this.totalBytes + bytes <= this.byteBudget;
    }

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

    private createLine(positions: Float32Array): THREE.LineSegments | null {
        if (!this.canAllocate(positions.byteLength)) return null;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.computeBoundingSphere();
        const line = new THREE.LineSegments(geometry, this.material);
        line.name = "__displayEdges";
        line.userData.isDisplayEdges = true;
        line.raycast = () => {};
        line.renderOrder = 1;
        this.totalBytes += positions.byteLength;
        return line;
    }

    private attachToMesh(mesh: THREE.Mesh) {
        if (mesh.userData.__displayEdges) return;
        const positions = this.getGeometryEdges(mesh.geometry);
        if (!positions || positions.length === 0) return;
        const line = this.createLine(positions);
        if (!line) return;
        mesh.add(line);
        mesh.userData.__displayEdges = line;
        this.objects.push(line);
    }

    private attachToBatch(batch: THREE.BatchedMesh) {
        if (batch.userData.__displayEdges) return;

        const instanceCount = (batch as any).instanceCount ?? 0;
        if (instanceCount <= 0) return;

        const mergedIndexCount = batch.geometry.getIndex()?.count || 0;
        if (mergedIndexCount > EDGE_MAX_INDEX_PER_BATCH) {
            // 超大分块直接不描边：优先保证样式切换不卡死；线框模式下由实体面兜底。
            batch.userData.__edgeSkipped = true;
            return;
        }

        const plans: Array<{ edges: Float32Array; matrix: THREE.Matrix4 }> = [];
        let totalVerts = 0;
        let visibleInstanceCount = 0;
        const matrix = new THREE.Matrix4();
        const visibility = (batch as any).getVisibleAt ? batch as any : null;

        for (let instanceId = 0; instanceId < instanceCount; instanceId++) {
            if (visibility && visibility.getVisibleAt(instanceId) === false) continue;
            visibleInstanceCount++;
            const geometry = getBatchedInstanceGeometry(batch, instanceId);
            if (!geometry) continue;
            const indexCount = geometry.getIndex()?.count || 0;
            if (indexCount > EDGE_MAX_INDEX_PER_GEOMETRY) continue;
            const edges = this.getGeometryEdges(geometry);
            if (!edges || edges.length === 0) continue;
            totalVerts += edges.length / 3;
            if (totalVerts > MAX_EDGE_VERTS_PER_BATCH) break;
            batch.getMatrixAt(instanceId, matrix);
            plans.push({ edges, matrix: matrix.clone() });
        }
        if (plans.length === 0) {
            clearBatchedGeometryViews(batch);
            // 关键区分：如果是因为“实例全部被隐藏”而没有边线，不能标记为跳过，
            // 否则重新显示该构件时边线永远无法恢复（隐藏选择只隐藏实体面、边线不回来的 bug）。
            if (visibleInstanceCount > 0) {
                batch.userData.__edgeSkipped = true;
            }
            return;
        }
        if (!this.canAllocate(totalVerts * 3 * 4)) {
            clearBatchedGeometryViews(batch);
            return;
        }

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
        if (!line) {
            clearBatchedGeometryViews(batch);
            return;
        }
        line.userData.isBatchedEdges = true;
        batch.add(line);
        batch.userData.__displayEdges = line;
        // 记录“该批次应当有边线”：即使后续因实例全部隐藏而移除边线，
        // 重新显示时也要能据此把边线重建回来。
        batch.userData.__displayEdgesWanted = true;
        // 之前可能因“整批实例都被隐藏/超预算”被标记为跳过；本次成功生成后必须清除，
        // 否则线框模式下 finalizeDisplayModeAfterEdges 会误把该块实体面重新显示出来。
        delete (batch.userData as any).__edgeSkipped;
        this.objects.push(line);
        // 边线顶点已经合并进 line.geometry，逐几何视图（索引副本）可以立刻释放。
        clearBatchedGeometryViews(batch);
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

    /** 调试用：当前边线对象数与顶点字节数（用于内存分类统计） */
    getStats() {
        let bytes = 0;
        for (const object of this.objects) {
            const attribute = object.geometry?.getAttribute?.("position") as THREE.BufferAttribute | undefined;
            const array = attribute?.array as ArrayLike<number> | undefined;
            if (array && typeof (array as any).byteLength === "number") {
                bytes += (array as any).byteLength;
            }
        }
        return { count: this.objects.length, bytes };
    }

    /** 爆炸状态下批量网格的实例矩阵会变化，合并后的边线不再准确，先隐藏 */
    setBatchedVisible(visible: boolean) {
        for (const object of this.objects) {
            if (object.userData.isBatchedEdges) object.visible = visible;
        }
    }

    /**
     * 实例可见性变化后，重建指定批量网格的合并边线。
     * 合并边线是“整批次一条 LineSegments”，`setVisibleAt(id,false)` 只隐藏实体面，
     * 隐藏实例的棱边仍留在合并线里，所以必须按当前可见实例重新生成。
     * 只处理“本来应该有边线”的批次（曾经生成过），避免给超大/超预算批次额外补线；
     * 同时必须支持“边线已被整体移除（全部实例都隐藏过）后再恢复”的情况。
     */
    rebuildForBatches(batches: Iterable<THREE.BatchedMesh>) {
        const rebuildTargets: THREE.BatchedMesh[] = [];
        const staleLines = new Set<THREE.LineSegments>();
        for (const batch of batches) {
            const userData = batch.userData as any;
            const line = userData?.__displayEdges as THREE.LineSegments | undefined;
            if (line) staleLines.add(line);
            // 没有边线且从未生成过（或已被判定跳过）的批次不处理
            if (!line && !userData?.__displayEdgesWanted) continue;
            if (!line && userData?.__edgeSkipped) continue;
            rebuildTargets.push(batch);
        }
        if (rebuildTargets.length === 0) return;

        // 一次性移除受影响的旧边线，避免对 objects 数组反复 filter（O(n^2)）
        if (staleLines.size > 0) {
            this.objects = this.objects.filter((line) => {
                if (!staleLines.has(line)) return true;
                const positionArray = line.geometry.getAttribute?.("position")?.array as ArrayLike<number> | undefined;
                if (positionArray && typeof (positionArray as any).byteLength === "number") {
                    this.totalBytes = Math.max(0, this.totalBytes - (positionArray as any).byteLength);
                }
                const parent = line.parent as any;
                if (parent?.userData) delete parent.userData.__displayEdges;
                line.removeFromParent();
                line.geometry.dispose();
                return false;
            });
        }

        // 按当前实例可见性重新生成（attachToBatch 内部会跳过 getVisibleAt===false 的实例）
        for (const batch of rebuildTargets) {
            if (!batch.parent || batch.visible === false) continue;
            this.attachToBatch(batch);
        }
    }

    clear() {
        for (const object of this.objects) {
            const parent = object.parent as any;
            if (parent?.userData) {
                delete parent.userData.__displayEdges;
                // 样式/场景整体清空：连“应否有边线”的标记一起复位，避免下次按旧标记重建。
                delete parent.userData.__displayEdgesWanted;
            }
            object.removeFromParent();
            object.geometry.dispose();
        }
        this.objects = [];
        this.totalBytes = 0;
        // 棱边顶点缓存（按 geometry.uuid）在全模型可达数百 MB，必须一起释放，
        // 否则切回着色后对象虽已移除，堆仍然降不下来。
        this.geometryEdgeCache.clear();
    }

    /** 单个对象被销毁/移除时清理它的边线（分块网格回收） */
    releaseFor(object: THREE.Object3D) {
        const line = (object.userData as any)?.__displayEdges as THREE.LineSegments | undefined;
        delete (object.userData as any).__displayEdgesWanted;
        if (!line) return;
        delete (object.userData as any).__displayEdges;
        const positionArray = line.geometry.getAttribute?.("position")?.array as ArrayLike<number> | undefined;
        if (positionArray && typeof (positionArray as any).byteLength === "number") {
            this.totalBytes = Math.max(0, this.totalBytes - (positionArray as any).byteLength);
        }
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
