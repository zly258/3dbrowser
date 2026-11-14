import * as THREE from "three";

/**
 * 渲染预算代理：数据仍然全量驻留，但超出预算的分块不再绘制完整几何，
 * 而是合并到一个 LineSegments 里用包围盒线框表示（1 个 draw call）。
 * 这是 UE/Navisworks 常用的 HLOD/Proxy 思路，避免“全量驻留 = 全量绘制”。
 */
export class ChunkRenderProxy {
    private readonly lines: THREE.LineSegments;
    private geometry: THREE.BufferGeometry;
    private positionAttribute: THREE.BufferAttribute;
    private positions: Float32Array;
    private capacity: number;

    constructor(parent: THREE.Object3D, material: THREE.LineBasicMaterial, capacity = 4096) {
        this.capacity = capacity;
        // 每块 12 条边 × 2 个端点 × 3 个分量 = 72 个 float
        this.positions = new Float32Array(capacity * 72);
        this.positionAttribute = new THREE.BufferAttribute(this.positions, 3);
        this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute("position", this.positionAttribute);
        this.geometry.setDrawRange(0, 0);
        this.lines = new THREE.LineSegments(this.geometry, material);
        this.lines.name = "RenderBudgetProxy";
        this.lines.frustumCulled = false;
        this.lines.renderOrder = 1;
        this.lines.visible = false;
        this.lines.userData.isRenderProxy = true;
        parent.add(this.lines);
    }

    /** 多模型/大工程可能超过初始容量，按需扩容而不是静默丢弃 */
    private ensureCapacity(count: number) {
        if (count <= this.capacity) return;
        const nextCapacity = Math.max(count, this.capacity * 2);
        const next = new Float32Array(nextCapacity * 72);
        next.set(this.positions);
        this.positions = next;
        this.capacity = nextCapacity;
        const attribute = new THREE.BufferAttribute(this.positions, 3);
        attribute.setUsage(THREE.DynamicDrawUsage);
        this.geometry.deleteAttribute("position");
        this.geometry.setAttribute("position", attribute);
        this.positionAttribute = attribute;
    }

    get object() {
        return this.lines;
    }

    clear() {
        this.geometry.setDrawRange(0, 0);
        this.lines.visible = false;
    }

    update(boxes: Array<{ min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }>) {
        const count = boxes.length;
        if (count === 0) {
            this.clear();
            return;
        }
        this.ensureCapacity(count);
        const p = this.positions;
        let offset = 0;
        const push = (x: number, y: number, z: number) => {
            p[offset++] = x;
            p[offset++] = y;
            p[offset++] = z;
        };
        const edgePairs: Array<[number, number]> = [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7]
        ];
        for (let i = 0; i < count; i++) {
            const { min, max } = boxes[i];
            const corners: number[][] = [
                [min.x, min.y, min.z],
                [max.x, min.y, min.z],
                [max.x, max.y, min.z],
                [min.x, max.y, min.z],
                [min.x, min.y, max.z],
                [max.x, min.y, max.z],
                [max.x, max.y, max.z],
                [min.x, max.y, max.z]
            ];
            for (const [a, b] of edgePairs) {
                const ca = corners[a];
                const cb = corners[b];
                push(ca[0], ca[1], ca[2]);
                push(cb[0], cb[1], cb[2]);
            }
        }
        this.positionAttribute.needsUpdate = true;
        this.geometry.setDrawRange(0, count * 24);
        this.lines.visible = true;
    }

    dispose() {
        this.lines.removeFromParent();
        this.geometry.dispose();
    }
}
