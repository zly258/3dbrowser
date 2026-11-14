import * as THREE from "three";

/**
 * 显示样式（与 AutoCAD 视觉习惯对齐）：
 *  - realistic 真实：着色 + 构件棱边
 *  - shaded    着色：仅着色
 *  - wireframe 线框：仅棱边
 *
 * 实体面与棱边的切换都在这里完成（棱边由 DisplayEdgeBuilder 生成）。
 */
export type DisplayMode = "realistic" | "shaded" | "wireframe";

export const DISPLAY_MODES: DisplayMode[] = ["realistic", "shaded", "wireframe"];

export function normalizeDisplayMode(value: unknown): DisplayMode {
    return value === "realistic" || value === "wireframe" || value === "shaded" ? value : "shaded";
}

/**
 * 控制实体面是否显示；线框模式下隐藏实体面，只保留棱边。
 * 棱边对象使用独立材质，因此不受此处的 visible 影响。
 */
export function applyDisplayMode(root: THREE.Object3D, mode: DisplayMode) {
    if (!root) return;
    const hideSolid = mode === "wireframe";
    const touchedMaterials = new Set<THREE.Material>();

    root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        if ((object as any).isLine || (object as any).isLineSegments || (object as any).isPoints) return;
        // 超大分块无法生成棱边时保留实体面，避免线框模式下整块“消失”。
        if (mesh.userData?.keepSolid) return;

        const materialOrMaterials = mesh.material as THREE.Material | THREE.Material[];
        if (!materialOrMaterials) return;

        const materials = Array.isArray(materialOrMaterials) ? materialOrMaterials : [materialOrMaterials];
        for (const material of materials) {
            if (!material || touchedMaterials.has(material)) continue;
            touchedMaterials.add(material);
            (material as any).wireframe = false;
            material.visible = !hideSolid;
        }
    });
}
