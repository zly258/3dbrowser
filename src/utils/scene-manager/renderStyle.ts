import * as THREE from "three";

const INDUSTRIAL_NEUTRAL = new THREE.Color("#7f8c99");
const INDUSTRIAL_DARK_FLOOR = 0.24;
const INDUSTRIAL_LIGHT_CEIL = 0.68;

function clamp01(value: number) {
    return THREE.MathUtils.clamp(value, 0, 1);
}

function getColorFromInput(input: THREE.ColorRepresentation | THREE.Color) {
    return input instanceof THREE.Color ? input.clone() : new THREE.Color(input as THREE.ColorRepresentation);
}

/**
 * 将模型原始颜色映射为更适合工业 BIM 浏览的显示颜色。
 * 保留专业色彩区分，但压低大红、亮黄、品红等高饱和色，避免模型画面过于花哨。
 */
export function toIndustrialDisplayColor(input: THREE.ColorRepresentation | THREE.Color) {
    const color = getColorFromInput(input);
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);

    const sourceSaturation = hsl.s;
    const sourceLightness = hsl.l;

    // 保留更多专业色彩，只压住过艳的红、黄、紫，避免上一版过灰、过浅。
    const saturationFactor = sourceSaturation > 0.7 ? 0.56 : sourceSaturation > 0.45 ? 0.64 : 0.78;
    const nextSaturation = THREE.MathUtils.clamp(sourceSaturation * saturationFactor + 0.025, 0.06, 0.68);

    // 降低整体亮度上限，增加对比度，避免模型发白、灰蒙。
    let nextLightness = sourceLightness * 0.88 + 0.018;
    nextLightness = THREE.MathUtils.clamp(nextLightness, INDUSTRIAL_DARK_FLOOR, INDUSTRIAL_LIGHT_CEIL);

    color.setHSL(hsl.h, nextSaturation, nextLightness);

    // 仅极轻微统一色相，不再明显混入灰蓝，保留管道/桥架/构件的识别颜色。
    const neutralMix = sourceSaturation > 0.55 ? 0.055 : 0.025;
    color.lerp(INDUSTRIAL_NEUTRAL, neutralMix);
    return color;
}

export function toIndustrialDisplayHex(input: THREE.ColorRepresentation | THREE.Color | number) {
    return toIndustrialDisplayColor(input as THREE.ColorRepresentation).getHex();
}

export function applyIndustrialMaterialStyle(material: THREE.Material | null | undefined) {
    if (!material) return;

    const anyMaterial = material as any;
    const userData = anyMaterial.userData || (anyMaterial.userData = {});
    if (userData.__industrialRenderStyled) return;

    if (anyMaterial.color && anyMaterial.color.isColor) {
        anyMaterial.color.copy(toIndustrialDisplayColor(anyMaterial.color));
    }

    if (anyMaterial.emissive && anyMaterial.emissive.isColor) {
        anyMaterial.emissive.multiplyScalar(0.12);
        if (typeof anyMaterial.emissiveIntensity === "number") {
            anyMaterial.emissiveIntensity = Math.min(anyMaterial.emissiveIntensity, 0.18);
        }
    }

    if ("roughness" in anyMaterial) {
        anyMaterial.roughness = THREE.MathUtils.clamp(Math.max(anyMaterial.roughness ?? 0, 0.72), 0, 1);
    }
    if ("metalness" in anyMaterial) {
        anyMaterial.metalness = THREE.MathUtils.clamp((anyMaterial.metalness ?? 0.04) * 0.45, 0.02, 0.16);
    }
    if ("shininess" in anyMaterial) {
        anyMaterial.shininess = Math.min(anyMaterial.shininess ?? 30, 18);
    }
    if ("envMapIntensity" in anyMaterial) {
        anyMaterial.envMapIntensity = Math.min(anyMaterial.envMapIntensity ?? 0.35, 0.35);
    }

    material.side = THREE.DoubleSide;
    userData.__industrialRenderStyled = true;
    material.needsUpdate = true;
}

export function applyIndustrialMaterials(materialOrMaterials: THREE.Material | THREE.Material[] | null | undefined) {
    if (!materialOrMaterials) return;
    const materials = Array.isArray(materialOrMaterials) ? materialOrMaterials : [materialOrMaterials];
    materials.forEach(applyIndustrialMaterialStyle);
}

export function createIndustrialSharedMaterial() {
    const material = new THREE.MeshStandardMaterial({
        color: toIndustrialDisplayColor(0xd9dce1),
        roughness: 0.72,
        metalness: 0.05,
        side: THREE.DoubleSide
    });
    applyIndustrialMaterialStyle(material);
    return material;
}

export function applyIndustrialRendererSettings(renderer: THREE.WebGLRenderer, bgColor: string, exposure?: number) {
    renderer.setClearColor(bgColor, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = exposure ?? 0.92;
}

export function applyIndustrialObjectStyle(object: THREE.Object3D) {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    applyIndustrialMaterials(mesh.material);
}
