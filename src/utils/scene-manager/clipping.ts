import * as THREE from "three";

type ClipAxisRanges = { x: number[]; y: number[]; z: number[] };
type ClipAxisActive = { x: boolean; y: boolean; z: boolean };

type ClippingState = {
    clippingPlanes: THREE.Plane[];
    clipPlaneHelpers: THREE.Mesh[];
    clipHelperVisible: boolean;
    clipHelperOpacity: number;
};

interface SceneManagerClippingContext {
    renderer: THREE.WebGLRenderer;
    clipHelpersGroup: THREE.Group;
    state: ClippingState;
}

interface ClippingResult {
    state: ClippingState;
    needsRender: boolean;
}

const CLIP_HELPER_COLORS = [0xff0000, 0xff0000, 0x00ff00, 0x00ff00, 0x0000ff, 0x0000ff];

function clonePlanes(planes: THREE.Plane[]) {
    return planes.map((plane) => plane.clone());
}

function updatePlaneHelper(
    helper: THREE.Mesh | undefined,
    normal: THREE.Vector3,
    distance: number,
    center: THREE.Vector3,
    size: number,
    isEnabled: boolean,
    clipHelperVisible: boolean
) {
    if (!helper) return;

    helper.visible = isEnabled && clipHelperVisible;
    helper.scale.set(size, size, 1);

    const position = new THREE.Vector3(center.x, center.y, center.z);
    const epsilon = 0.001;
    if (normal.x !== 0) position.x = distance + (normal.x * epsilon);
    else if (normal.y !== 0) position.y = distance + (normal.y * epsilon);
    else if (normal.z !== 0) position.z = distance + (normal.z * epsilon);

    helper.position.copy(position);
    helper.lookAt(position.clone().add(normal));
}

export function applySetupClipping(context: SceneManagerClippingContext): ClippingResult {
    const clippingPlanes = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
        new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
        new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)
    ];

    context.renderer.clippingPlanes = [];
    context.clipHelpersGroup.clear();

    const clipPlaneHelpers = CLIP_HELPER_COLORS.map((color) => {
        const geometry = new THREE.PlaneGeometry(1, 1);
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: context.state.clipHelperOpacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
            clippingPlanes: []
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.visible = false;
        mesh.renderOrder = 9999;

        const edges = new THREE.EdgesGeometry(geometry);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity: Math.min(1, context.state.clipHelperOpacity + 0.08),
            depthWrite: false
        }));
        line.visible = false;
        line.renderOrder = 10000;
        mesh.add(line);

        context.clipHelpersGroup.add(mesh);
        return mesh;
    });

    return {
        state: {
            ...context.state,
            clippingPlanes,
            clipPlaneHelpers
        },
        needsRender: false
    };
}

export function applySetClipHelperOptions(
    context: SceneManagerClippingContext,
    options: { visible?: boolean; opacity?: number }
): ClippingResult {
    const state: ClippingState = {
        ...context.state,
        clippingPlanes: clonePlanes(context.state.clippingPlanes),
        clipPlaneHelpers: [...context.state.clipPlaneHelpers],
        clipHelperVisible: typeof options.visible === "boolean" ? options.visible : context.state.clipHelperVisible,
        clipHelperOpacity:
            typeof options.opacity === "number" && !Number.isNaN(options.opacity)
                ? THREE.MathUtils.clamp(options.opacity, 0.05, 0.35)
                : context.state.clipHelperOpacity
    };

    state.clipPlaneHelpers.forEach((helper) => {
        const surfaceMaterial = helper.material as THREE.MeshBasicMaterial;
        surfaceMaterial.opacity = state.clipHelperOpacity;
        surfaceMaterial.needsUpdate = true;

        helper.children.forEach((child) => {
            const lineMaterial = (child as THREE.LineSegments).material as THREE.LineBasicMaterial;
            if (!lineMaterial) return;
            lineMaterial.opacity = Math.min(1, state.clipHelperOpacity + 0.08);
            lineMaterial.needsUpdate = true;
        });
    });

    if (!state.clipHelperVisible || context.renderer.clippingPlanes.length === 0) {
        state.clipPlaneHelpers.forEach((helper) => {
            helper.visible = false;
        });
    }

    return { state, needsRender: false };
}

export function applyUpdateClippingPlanes(
    context: SceneManagerClippingContext,
    bounds: THREE.Box3,
    values: ClipAxisRanges,
    active: ClipAxisActive
): ClippingResult {
    if (bounds.isEmpty()) {
        return { state: context.state, needsRender: false };
    }

    const clippingPlanes = clonePlanes(context.state.clippingPlanes);
    const clipPlaneHelpers = [...context.state.clipPlaneHelpers];
    const state: ClippingState = { ...context.state, clippingPlanes, clipPlaneHelpers };

    const { min, max } = bounds;
    const size = max.clone().sub(min);
    const center = bounds.getCenter(new THREE.Vector3());
    const diagonal = size.length();
    const helperSize = diagonal > 0 ? diagonal * 1.2 : 1000;

    const xMin = min.x + (values.x[0] / 100) * size.x;
    const xMax = min.x + (values.x[1] / 100) * size.x;
    const yMin = min.y + (values.y[0] / 100) * size.y;
    const yMax = min.y + (values.y[1] / 100) * size.y;
    const zMin = min.z + (values.z[0] / 100) * size.z;
    const zMax = min.z + (values.z[1] / 100) * size.z;

    const isEnabled = context.renderer.clippingPlanes.length > 0;

    if (active.x) {
        clippingPlanes[0].constant = -xMin;
        clippingPlanes[1].constant = xMax;
        updatePlaneHelper(clipPlaneHelpers[0], new THREE.Vector3(1, 0, 0), xMin, center, helperSize, isEnabled, state.clipHelperVisible);
        updatePlaneHelper(clipPlaneHelpers[1], new THREE.Vector3(-1, 0, 0), xMax, center, helperSize, isEnabled, state.clipHelperVisible);
    } else {
        clippingPlanes[0].constant = Infinity;
        clippingPlanes[1].constant = Infinity;
        if (clipPlaneHelpers[0]) clipPlaneHelpers[0].visible = false;
        if (clipPlaneHelpers[1]) clipPlaneHelpers[1].visible = false;
    }

    if (active.y) {
        clippingPlanes[2].constant = -yMin;
        clippingPlanes[3].constant = yMax;
        updatePlaneHelper(clipPlaneHelpers[2], new THREE.Vector3(0, 1, 0), yMin, center, helperSize, isEnabled, state.clipHelperVisible);
        updatePlaneHelper(clipPlaneHelpers[3], new THREE.Vector3(0, -1, 0), yMax, center, helperSize, isEnabled, state.clipHelperVisible);
    } else {
        clippingPlanes[2].constant = Infinity;
        clippingPlanes[3].constant = Infinity;
        if (clipPlaneHelpers[2]) clipPlaneHelpers[2].visible = false;
        if (clipPlaneHelpers[3]) clipPlaneHelpers[3].visible = false;
    }

    if (active.z) {
        clippingPlanes[4].constant = -zMin;
        clippingPlanes[5].constant = zMax;
        updatePlaneHelper(clipPlaneHelpers[4], new THREE.Vector3(0, 0, 1), zMin, center, helperSize, isEnabled, state.clipHelperVisible);
        updatePlaneHelper(clipPlaneHelpers[5], new THREE.Vector3(0, 0, -1), zMax, center, helperSize, isEnabled, state.clipHelperVisible);
    } else {
        clippingPlanes[4].constant = Infinity;
        clippingPlanes[5].constant = Infinity;
        if (clipPlaneHelpers[4]) clipPlaneHelpers[4].visible = false;
        if (clipPlaneHelpers[5]) clipPlaneHelpers[5].visible = false;
    }

    return { state, needsRender: true };
}

export function isBoxClippedByPlanes(planes: THREE.Plane[], box: THREE.Box3): boolean {
    for (const plane of planes) {
        if (plane.constant === Infinity) continue;

        const planeNormal = plane.normal;
        const maxPoint = new THREE.Vector3(
            planeNormal.x > 0 ? box.max.x : box.min.x,
            planeNormal.y > 0 ? box.max.y : box.min.y,
            planeNormal.z > 0 ? box.max.z : box.min.z
        );

        if (plane.distanceToPoint(maxPoint) < 0) {
            return true;
        }
    }
    return false;
}

