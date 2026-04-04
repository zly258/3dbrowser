import * as THREE from "three";
import type { MeasurementRecord, MeasureType } from "./sceneManagerTypes";

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

function createLabel(text: string, position: THREE.Vector3): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return new THREE.Sprite();

    const fontSize = 48;
    const padding = 24;
    context.font = `Bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
    const textWidth = context.measureText(text).width;

    canvas.width = textWidth + padding * 2;
    canvas.height = fontSize + padding;

    context.shadowColor = "rgba(0, 0, 0, 0.5)";
    context.shadowBlur = 10;
    context.fillStyle = "rgba(30, 30, 30, 0.9)";

    const radius = 8;
    const roundedContext = context as CanvasRenderingContext2D & {
        roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
    };
    if (roundedContext.roundRect) {
        roundedContext.roundRect(5, 5, canvas.width - 10, canvas.height - 10, radius);
    } else {
        context.rect(5, 5, canvas.width - 10, canvas.height - 10);
    }
    context.fill();

    context.shadowBlur = 0;
    context.strokeStyle = "#ff0000";
    context.lineWidth = 2;
    context.stroke();

    context.font = `Bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
        map: texture,
        depthTest: false,
        sizeAttenuation: false
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    const baseScale = 0.5;
    sprite.scale.set(baseScale * (canvas.width / canvas.height), baseScale, 1);
    sprite.renderOrder = 1001;
    sprite.userData = { type: "label" };
    return sprite;
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
        return { state, needsRender: false };
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

    return { state, needsRender: false };
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
        const v1 = p1.clone().sub(center).normalize();
        const v2 = p2.clone().sub(center).normalize();
        const angle = v1.angleTo(v2) * (180 / Math.PI);

        displayValue = `${angle.toFixed(2)}°`;
        value = displayValue;
        createLine(state.currentMeasurePoints, group);
        labelPosition.copy(center);
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
        const color = isHighlighted ? 0x00ff00 : 0xff0000;

        record.group.traverse((child) => {
            if (child instanceof THREE.Line || child instanceof THREE.LineLoop) {
                (child.material as THREE.LineBasicMaterial).color.set(color);
            } else if (child instanceof THREE.Points) {
                (child.material as THREE.PointsMaterial).color.set(color);
            } else if (child instanceof THREE.Sprite) {
                (child.material as THREE.SpriteMaterial).color.set(isHighlighted ? 0x00ff00 : 0xffffff);
            } else if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
                child.material.color.set(color);
            } else if (child instanceof THREE.Box3Helper) {
                (child as any).material.color.set(color);
            }
        });
    });

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
