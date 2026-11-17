import * as THREE from "three";

/**
 * 显示样式（与 AutoCAD 视觉习惯对齐）：
 *  - shaded    着色：仅着色，不描边（最快，超大模型首选）
 *  - realistic 真实：着色 + 构件棱边（CAD 式轮廓：梁柱硬边、圆柱竖棱与圆环）
 *
 * 说明：原「wireframe 线框」模式已移除。原因：
 *  1) 线框模式下实体面被隐藏、常驻分块被压到 ~200 块，超大模型会大面积只剩骨架，
 *     与 CAD 的“线框=完整轮廓”预期不符；
 *  2) 切换需要卸载常驻块 + 逐实例重算棱边，23 万构件场景切换代价极高（数十秒卡顿）；
 *  3) CAD 用户真正需要的是“实体轮廓清晰”，这由 realistic 模式提供，
 *     而 realistic 的棱边质量已按 4° 阈值修正（圆柱/球不再丢线）。
 *
 * 兼容：历史 localStorage 中保存的 "wireframe" 会被归一化为 "realistic"。
 */
export type DisplayMode = "realistic" | "shaded";

export const DISPLAY_MODES: DisplayMode[] = ["shaded", "realistic"];

export function normalizeDisplayMode(value: unknown): DisplayMode {
    // 旧版本保存过 "wireframe"，映射到带棱边的 realistic，避免用户设置丢失。
    if (value === "wireframe") return "realistic";
    return value === "realistic" || value === "shaded" ? value : "shaded";
}

/**
 * 控制实体面是否显示。两种模式都显示实体面，只由棱边决定视觉差异，
 * 因此这里保证实体面始终可见（并清掉 three 自带的三角网格 wireframe）。
 */
export function applyDisplayMode(root: THREE.Object3D, mode: DisplayMode) {
    if (!root) return;
    void mode;
    const touchedMaterials = new Set<THREE.Material>();

    root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        if ((object as any).isLine || (object as any).isLineSegments || (object as any).isPoints) return;

        const materialOrMaterials = mesh.material as THREE.Material | THREE.Material[];
        if (!materialOrMaterials) return;

        const materials = Array.isArray(materialOrMaterials) ? materialOrMaterials : [materialOrMaterials];
        for (const material of materials) {
            if (!material || touchedMaterials.has(material)) continue;
            touchedMaterials.add(material);
            (material as any).wireframe = false;
            material.visible = true;
        }
    });
}
