import * as THREE from "three";
import type { MeasurementRecord, MeasureType } from "./types";

type MeasurementState = {
    measureType: MeasureType;
    currentMeasurePoints: THREE.Vector3[];
    currentMeasureModelUuid: string | null;
    previewLine: THREE.Line | null;
    previewPolygon: THREE.LineLoop | null;
};

interface SceneManagerMeasurementContext {
    canvas: HTMLCanvasElement;
    camera: THREE.Camera;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    measureGroup: THREE.Group;
    tempMarker: THREE.Points;
    dotTexture: THREE.Texture;
    measureRecords: Map<string, MeasurementRecord>;
    state: MeasurementState;
    getRayIntersects: (clientX: number, clientY: number) => THREE.Intersection | null;
    onMeasureUpdate?: (records: MeasurementRecord[]) => void;
}

interface MeasurementResult {
    state: MeasurementState;
    needsRender: boolean;
    completed?: { id: string; type: string; val: string } | null;
}

function createMarker(point: THREE.Vector3, parent: THREE.Object3D, dotTexture: THREE.Texture) {
    const markerGeometry = new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute([point.x, point.y, point.z], 3)
    );
    const markerMaterial = new THREE.PointsMaterial({
        color: 0xff0000,
        size: 8,
        map: dotTexture,
        transparent: true,
        alphaTest: 0.5,
        depthTest: false
    });
    const marker = new THREE.Points(markerGeometry, markerMaterial);
    marker.renderOrder = 999;
    parent.add(marker);
}

function createLine(points: THREE.Vector3[], parent: THREE.Object3D) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xff0000, depthTest: false, linewidth: 2 });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 998;
    parent.add(line);
}

/** 测量标注在屏幕上的固定高度（CSS px）。与相机 zoom 无关。 */
export const MEASURE_LABEL_HEIGHT_PX = 22;

/** 测量线 / 端点 / 标签边框共用色（保持与 3D 线段一致） */
const MEASURE_COLOR = 0xff0000;
const MEASURE_COLOR_HIGHLIGHT = 0x00e676;
const MEASURE_BORDER = "#ff0000";
const MEASURE_BORDER_HIGHLIGHT = "#00e676";

/**
 * 绘制标签贴图。
 * 画布按约 4 倍于最终显示尺寸绘制，再由 sprite 降采样，保证在高 DPI 与缩放下都清晰。
 */
function buildLabelCanvas(text: string, highlighted: boolean): HTMLCanvasElement | null {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return null;

    const fontSize = 56;
    const paddingX = 22;
    const paddingY = 18;
    const border = 3;
    const font = `600 ${fontSize}px 'Nunito', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei UI', sans-serif`;

    context.font = font;
    const textWidth = Math.ceil(context.measureText(text).width);

    canvas.width = Math.max(1, Math.ceil(textWidth + paddingX * 2));
    canvas.height = Math.max(1, Math.ceil(fontSize + paddingY));

    // 重设尺寸会清空上下文状态，需重新设置字体
    context.font = font;
    context.textAlign = "center";
    context.textBaseline = "middle";

    const w = canvas.width;
    const h = canvas.height;
    const inset = border / 2 + 1;
    const radius = 12;

    // 底色胶囊
    context.beginPath();
    const rounded = context as CanvasRenderingContext2D & {
        roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
    };
    if (rounded.roundRect) {
        rounded.roundRect(inset, inset, w - inset * 2, h - inset * 2, radius);
    } else {
        context.rect(inset, inset, w - inset * 2, h - inset * 2);
    }
    context.fillStyle = "rgba(24, 27, 33, 0.86)";
    context.fill();
    context.lineWidth = border;
    context.strokeStyle = highlighted ? MEASURE_BORDER_HIGHLIGHT : MEASURE_BORDER;
    context.stroke();

    // 读数（等宽数字）
    context.fillStyle = "#ffffff";
    context.font = font;
    context.fillText(text, w / 2, h / 2 + 1);
    return canvas;
}

/** 为标签 sprite 生成贴图（保留旧贴图的释放） */
function applyLabelTexture(sprite: THREE.Sprite, text: string, highlighted: boolean) {
    const canvas = buildLabelCanvas(text, highlighted);
    if (!canvas) return;
    const material = sprite.material as THREE.SpriteMaterial;
    const previous = material.map;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    material.map = texture;
    material.color.set(0xffffff);
    material.needsUpdate = true;
    if (previous) previous.dispose();
    sprite.userData = {
        ...(sprite.userData || {}),
        type: "label",
        text,
        highlighted,
        aspect: canvas.width / canvas.height
    };
}

function createLabel(text: string, position: THREE.Vector3): THREE.Sprite {
    const material = new THREE.SpriteMaterial({
        depthTest: false,
        sizeAttenuation: false,
        transparent: true
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.renderOrder = 1001;
    applyLabelTexture(sprite, text, false);
    // 初始 scale 只是占位；每帧由 applyMeasureLabelScreenSize 按视口反算，保证固定像素尺寸
    const aspect = (sprite.userData?.aspect as number) || 1;
    sprite.scale.set(0.1 * aspect, 0.1, 1);
    return sprite;
}

/**
 * 把测量标签的尺寸固定为屏幕像素尺寸。
 *
 * 视口用的是正交相机，而 Three.js 的 `sizeAttenuation:false` 只对透视相机生效，
 * 正交下 sprite.scale 是世界单位、会随 camera.zoom 线性放大。
 * 因此这里按当前投影矩阵反算 scale：正交下投影 P11 已含 zoom，
 * 标签 NDC 高度 = P11 * scale.y，故 scale.y = 2 * 目标像素 / (P11 * 视口高度)。
 */
export function applyMeasureLabelScreenSize(
    context: Pick<SceneManagerMeasurementContext, "canvas" | "camera" | "measureRecords">,
    targetHeightPx: number = MEASURE_LABEL_HEIGHT_PX
): boolean {
    if (context.measureRecords.size === 0) return false;

    const canvas = context.canvas;
    const heightPx = canvas.clientHeight || canvas.height;
    const projection = (context.camera as THREE.Camera).projectionMatrix;
    const p11 = projection?.elements?.[5];
    if (!heightPx || !Number.isFinite(p11) || p11 <= 0) return false;

    const scaleY = (2 * targetHeightPx) / (p11 * heightPx);
    if (!Number.isFinite(scaleY) || scaleY <= 0) return false;

    let changed = false;
    context.measureRecords.forEach((record) => {
        record.group.traverse((child) => {
            if (!(child instanceof THREE.Sprite)) return;
            if (child.userData?.type !== "label") return;
            const aspect = (child.userData.aspect as number) || 1;
            const nextX = scaleY * aspect;
            if (Math.abs(child.scale.x - nextX) > 1e-6 || Math.abs(child.scale.y - scaleY) > 1e-6) {
                child.scale.set(nextX, scaleY, 1);
                changed = true;
            }
        });
    });
    return changed;
}

function clearPreviewVisuals(context: SceneManagerMeasurementContext, state: MeasurementState) {
    if (state.previewLine) {
        context.measureGroup.remove(state.previewLine);
        state.previewLine = null;
    }
    if (state.previewPolygon) {
        context.measureGroup.remove(state.previewPolygon);
        state.previewPolygon = null;
    }
    context.tempMarker.visible = false;
}

export function applyClearMeasurementPreview(
    context: SceneManagerMeasurementContext,
    resetPoints = true
): MeasurementResult {
    const state: MeasurementState = {
        ...context.state,
        currentMeasurePoints: resetPoints ? [] : [...context.state.currentMeasurePoints]
    };

    clearPreviewVisuals(context, state);

    for (let i = context.measureGroup.children.length - 1; i >= 0; i--) {
        const child = context.measureGroup.children[i];
        if (!child.name.startsWith("measure_")) {
            context.measureGroup.remove(child);
        }
    }

    return {
        state,
        needsRender: true
    };
}

export function applyUpdateMeasurePreview(
    context: SceneManagerMeasurementContext,
    hoverPoint?: THREE.Vector3
): MeasurementResult {
    const state: MeasurementState = {
        ...context.state,
        currentMeasurePoints: [...context.state.currentMeasurePoints]
    };

    clearPreviewVisuals(context, state);

    const points = [...state.currentMeasurePoints];
    if (hoverPoint) points.push(hoverPoint);
    if (points.length < 2) {
        return { state, needsRender: true };
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
        color: 0xff0000,
        dashSize: 5,
        gapSize: 2,
        depthTest: false
    });

    state.previewLine = new THREE.Line(geometry, material);
    state.previewLine.computeLineDistances();
    state.previewLine.renderOrder = 998;
    context.measureGroup.add(state.previewLine);

    return { state, needsRender: true };
}

export function applyUpdateMeasureHover(
    context: SceneManagerMeasurementContext,
    clientX: number,
    clientY: number
): MeasurementResult {
    const state: MeasurementState = {
        ...context.state,
        currentMeasurePoints: [...context.state.currentMeasurePoints]
    };

    if (state.measureType === "none") {
        context.tempMarker.visible = false;
        return { state, needsRender: false };
    }

    const intersect = context.getRayIntersects(clientX, clientY);
    if (!intersect) {
        context.tempMarker.visible = false;
        if (state.previewLine) state.previewLine.visible = false;
        return { state, needsRender: true };
    }

    const point = intersect.point;
    const position = context.tempMarker.geometry.attributes.position as THREE.BufferAttribute;
    position.setXYZ(0, point.x, point.y, point.z);
    position.needsUpdate = true;
    context.tempMarker.visible = true;

    if (state.currentMeasurePoints.length === 0) {
        return { state, needsRender: true };
    }

    const previewResult = applyUpdateMeasurePreview(context, point);
    return {
        state: previewResult.state,
        needsRender: true
    };
}

export function applyFinalizeMeasurement(
    context: SceneManagerMeasurementContext
): MeasurementResult {
    const state: MeasurementState = {
        ...context.state,
        currentMeasurePoints: [...context.state.currentMeasurePoints]
    };

    const id = `measure_${Date.now()}`;
    const group = new THREE.Group();
    group.name = id;

    state.currentMeasurePoints.forEach((point) => createMarker(point, group, context.dotTexture));

    let value = "";
    let displayValue = "";
    const type = state.measureType;
    const labelPosition = new THREE.Vector3();

    if (state.measureType === "dist") {
        const [p1, p2] = state.currentMeasurePoints;
        const distance = p1.distanceTo(p2);
        const dx = Math.abs(p2.x - p1.x);
        const dy = Math.abs(p2.y - p1.y);
        const dz = Math.abs(p2.z - p1.z);

        displayValue = distance.toFixed(3);
        value = `${displayValue} (Δx:${dx.toFixed(2)}, Δy:${dy.toFixed(2)}, Δz:${dz.toFixed(2)})`;
        createLine(state.currentMeasurePoints, group);
        labelPosition.copy(p1).add(p2).multiplyScalar(0.5);
    } else if (state.measureType === "angle") {
        const [p1, center, p2] = state.currentMeasurePoints;
        const arm1 = p1.clone().sub(center);
        const arm2 = p2.clone().sub(center);
        const v1 = arm1.clone().normalize();
        const v2 = arm2.clone().normalize();
        const angle = v1.angleTo(v2) * (180 / Math.PI);

        displayValue = `${angle.toFixed(2)}°`;
        value = displayValue;
        createLine(state.currentMeasurePoints, group);

        // 让标签沿角平分线外移，避免压在顶点上遮住夹角本身
        const bisector = v1.clone().add(v2);
        if (bisector.lengthSq() < 1e-8) {
            // 接近 180° 时角平分线退化，退回到垂线方向
            bisector.copy(v1).cross(new THREE.Vector3(0, 0, 1));
            if (bisector.lengthSq() < 1e-8) bisector.copy(v1);
        }
        const armLength = Math.min(arm1.length(), arm2.length());
        const offset = Math.max(1e-6, armLength * 0.22);
        labelPosition.copy(center).addScaledVector(bisector.normalize(), offset);
    } else {
        const [point] = state.currentMeasurePoints;
        displayValue = `(${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)})`;
        value = displayValue;
        labelPosition.copy(point);
    }

    group.add(createLabel(displayValue, labelPosition));
    context.measureGroup.add(group);
    context.measureRecords.set(id, {
        id,
        type,
        val: value,
        group,
        modelUuid: state.currentMeasureModelUuid || undefined
    });

    // 新建后立即校准一次，避免首帧出现错误尺寸（后续每帧由 renderFrame 维持）
    applyMeasureLabelScreenSize(context);

    const cleared = applyClearMeasurementPreview(
        {
            ...context,
            state: {
                ...state,
                currentMeasurePoints: [],
                currentMeasureModelUuid: null
            }
        },
        false
    );

    const nextState: MeasurementState = {
        ...cleared.state,
        currentMeasurePoints: [],
        currentMeasureModelUuid: null
    };

    if (context.onMeasureUpdate) {
        context.onMeasureUpdate(Array.from(context.measureRecords.values()));
    }

    return {
        state: nextState,
        needsRender: true,
        completed: { id, type, val: value }
    };
}

export function applyAddMeasurePoint(
    context: SceneManagerMeasurementContext,
    point: THREE.Vector3,
    modelUuid?: string
): MeasurementResult {
    if (context.state.measureType === "none") {
        return { state: context.state, needsRender: false, completed: null };
    }

    const state: MeasurementState = {
        ...context.state,
        currentMeasurePoints: [...context.state.currentMeasurePoints, point],
        currentMeasureModelUuid: modelUuid ?? context.state.currentMeasureModelUuid
    };

    createMarker(point, context.measureGroup, context.dotTexture);

    const shouldFinalize =
        (state.measureType === "dist" && state.currentMeasurePoints.length === 2) ||
        (state.measureType === "angle" && state.currentMeasurePoints.length === 3) ||
        state.measureType === "coord";

    if (shouldFinalize) {
        return applyFinalizeMeasurement({ ...context, state });
    }

    const previewResult = applyUpdateMeasurePreview({ ...context, state });
    return {
        state: previewResult.state,
        needsRender: true,
        completed: null
    };
}

export function applyHighlightMeasurement(
    context: SceneManagerMeasurementContext,
    id: string | null
): MeasurementResult {
    context.measureRecords.forEach((record, recordId) => {
        const isHighlighted = recordId === id;
        const color = isHighlighted ? MEASURE_COLOR_HIGHLIGHT : MEASURE_COLOR;

        record.group.traverse((child) => {
            if (child instanceof THREE.Line || child instanceof THREE.LineLoop) {
                (child.material as THREE.LineBasicMaterial).color.set(color);
            } else if (child instanceof THREE.Points) {
                (child.material as THREE.PointsMaterial).color.set(color);
            } else if (child instanceof THREE.Sprite) {
                // 标签只换边框颜色，不再把整块贴图乘成绿色（会把底色与文字一起染绿）
                if (child.userData?.type === "label") {
                    const text = String(child.userData.text ?? "");
                    const wasHighlighted = child.userData.highlighted === true;
                    if (text && wasHighlighted !== isHighlighted) {
                        applyLabelTexture(child, text, isHighlighted);
                    }
                } else {
                    (child.material as THREE.SpriteMaterial).color.set(
                        isHighlighted ? MEASURE_COLOR_HIGHLIGHT : 0xffffff
                    );
                }
            } else if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
                child.material.color.set(color);
            } else if (child instanceof THREE.Box3Helper) {
                (child as any).material.color.set(color);
            }
        });
    });

    // 重建贴图后需要重新校准屏幕尺寸
    applyMeasureLabelScreenSize(context);

    return {
        state: context.state,
        needsRender: true
    };
}

export function applyPickMeasurement(
    context: SceneManagerMeasurementContext,
    clientX: number,
    clientY: number
): string | null {
    const rect = context.canvas.getBoundingClientRect();
    context.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    context.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    context.raycaster.setFromCamera(context.mouse, context.camera);
    const previousThreshold = context.raycaster.params.Line?.threshold || 0;
    if (context.raycaster.params.Line) {
        context.raycaster.params.Line.threshold = 5;
    }

    const intersects = context.raycaster.intersectObjects(context.measureGroup.children, true);

    if (context.raycaster.params.Line) {
        context.raycaster.params.Line.threshold = previousThreshold;
    }

    if (intersects.length === 0) {
        return null;
    }

    let object = intersects[0].object;
    while (object.parent && !object.name.startsWith("measure_")) {
        object = object.parent;
    }

    return object.name.startsWith("measure_") ? object.name : null;
}

