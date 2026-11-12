import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { SceneManager } from "../utils/scene-manager/SceneManager";
import { getTranslation, Lang } from "../theme/locales";
import { ThemeColors } from "../theme/styles";

interface ViewCubeProps {
    sceneMgr: SceneManager | null;
    lang?: Lang;
    theme?: ThemeColors;
}

type ViewCubeMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

/* ============================================================
 * 圆角立方体（局部坐标，边长 1）
 * 由 6 个平面片 + 12 条圆柱棱 + 8 个球角拼出，视觉上等于
 * 一个半径 0.07 的倒角立方体；每个零件仍可独立拾取与高亮。
 * ============================================================ */
const CORNER_RADIUS = 0.07;
const FACE_SIZE = 1 - CORNER_RADIUS * 2;
const INNER = 0.5 - CORNER_RADIUS;
const SEAM_OVERLAP = 0.004;

const CAMERA_DISTANCE = 3.2;
const CAMERA_FOV = 38;

/** 轮廓线、棱线的屏幕线宽（像素） */
const OUTLINE_PX = 1.25;
const CREASE_PX = 1.15;

/** 中线（Y 形三条棱）两端缩进，避免探出圆角轮廓 */
const CREASE_TRIM_NEAR = CORNER_RADIUS * 0.4;
const CREASE_TRIM_FAR = CORNER_RADIUS * 0.6;

/** 两个相邻面都朝向相机时，才画这条棱 */
const FACE_VISIBLE_EPS = 0.02;

type FaceKey = "front" | "back" | "top" | "bottom" | "left" | "right";

interface FacePart {
    key: FaceKey;
    /** 面朝外的法线 */
    normal: [number, number, number];
    /** 该面上文字的「向上」方向 */
    up: [number, number, number];
}

/**
 * 六个面都用 PlaneGeometry + 显式基向量摆放：
 * 局部 X → 文字从左到右，局部 Y → 文字向上，局部 Z → 面法线。
 * 这样贴图永远正着贴，不受 BoxGeometry 各面 UV 朝向的影响。
 */
const FACE_PARTS: FacePart[] = [
    { key: "front", normal: [0, -1, 0], up: [0, 0, 1] },
    { key: "back", normal: [0, 1, 0], up: [0, 0, 1] },
    { key: "top", normal: [0, 0, 1], up: [0, 1, 0] },
    { key: "bottom", normal: [0, 0, -1], up: [0, 1, 0] },
    { key: "left", normal: [-1, 0, 0], up: [0, 0, 1] },
    { key: "right", normal: [1, 0, 0], up: [0, 0, 1] }
];

interface EdgePart {
    name: string;
    /** 这条棱延伸的轴：0=x, 1=y, 2=z */
    axis: 0 | 1 | 2;
    position: [number, number, number];
}

const EDGE_PARTS: EdgePart[] = [
    { name: "top-front", axis: 0, position: [0, -INNER, INNER] },
    { name: "top-back", axis: 0, position: [0, INNER, INNER] },
    { name: "top-left", axis: 1, position: [-INNER, 0, INNER] },
    { name: "top-right", axis: 1, position: [INNER, 0, INNER] },
    { name: "bottom-front", axis: 0, position: [0, -INNER, -INNER] },
    { name: "bottom-back", axis: 0, position: [0, INNER, -INNER] },
    { name: "bottom-left", axis: 1, position: [-INNER, 0, -INNER] },
    { name: "bottom-right", axis: 1, position: [INNER, 0, -INNER] },
    { name: "front-left", axis: 2, position: [-INNER, -INNER, 0] },
    { name: "front-right", axis: 2, position: [INNER, -INNER, 0] },
    { name: "back-left", axis: 2, position: [-INNER, INNER, 0] },
    { name: "back-right", axis: 2, position: [INNER, INNER, 0] }
];

const CORNER_PARTS: { name: string; position: [number, number, number] }[] = [
    { name: "top-front-left", position: [-INNER, -INNER, INNER] },
    { name: "top-front-right", position: [INNER, -INNER, INNER] },
    { name: "top-back-left", position: [-INNER, INNER, INNER] },
    { name: "top-back-right", position: [INNER, INNER, INNER] },
    { name: "bottom-front-left", position: [-INNER, -INNER, -INNER] },
    { name: "bottom-front-right", position: [INNER, -INNER, -INNER] },
    { name: "bottom-back-left", position: [-INNER, INNER, -INNER] },
    { name: "bottom-back-right", position: [INNER, INNER, -INNER] }
];

const UP = new THREE.Vector3(0, 1, 0);

export const ViewCube: React.FC<ViewCubeProps> = ({ sceneMgr, lang = "zh", theme }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const cubeRef = useRef<THREE.Group | null>(null);
    const clickablePartsRef = useRef<ViewCubeMesh[]>([]);
    const raycaster = useRef(new THREE.Raycaster());
    const mouse = useRef(new THREE.Vector2());
    const hoveredPart = useRef<ViewCubeMesh | null>(null);
    const creasesRef = useRef<THREE.Mesh[]>([]);

    const cubeSize = sceneMgr?.settings?.viewCubeSize || 132;
    const t = (key: string) => getTranslation(lang as Lang, key);
    const isDark = typeof document !== "undefined" && (
        document.documentElement.classList.contains("theme-dark") ||
        document.documentElement.getAttribute("data-theme") === "dark" ||
        theme?.bg === "#0E1114"
    );

    useEffect(() => {
        if (!canvasRef.current || !containerRef.current) return;

        const width = cubeSize;
        const height = cubeSize;
        const canvas = canvasRef.current;

        const gl = canvas.getContext("webgl2", {
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: false
        });

        if (gl) {
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        }

        const renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            context: gl || undefined,
            antialias: true,
            alpha: true,
            precision: "mediump"
        });

        renderer.setSize(width, height, false);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        rendererRef.current = renderer;

        const scene = new THREE.Scene();
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);
        camera.position.set(0, 0, CAMERA_DISTANCE);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        // 纯线稿风格：无光照，面/棱/角统一底色，靠轮廓线与中线表达形体
        const palette = isDark
            ? {
                fill: "#232B33",
                hoverFill: "#2A5F86",
                line: "#5A6672",
                text: "#DCE2E8",
                textHover: "#EAF3FA"
            }
            : {
                fill: "#FFFFFF",
                hoverFill: "#CFE4F7",
                line: "#B9C2CC",
                text: "#3B424B",
                textHover: "#22303B"
            };

        const createdTextures: THREE.Texture[] = [];

        /** 1 个像素对应多少世界单位（立方体位于 z≈0 平面） */
        const worldPerPixel =
            (2 * CAMERA_DISTANCE * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2))) / cubeSize;

        const cubeGroup = new THREE.Group();
        scene.add(cubeGroup);
        cubeRef.current = cubeGroup;
        clickablePartsRef.current = [];
        creasesRef.current = [];

        const bodyGroup = new THREE.Group();
        cubeGroup.add(bodyGroup);

        /**
         * 外轮廓：用单个「实心」圆角立方体放大一圈后只渲染背面。
         * 本体是不透明的，正面的背面被本体挡住，只剩边缘一圈轮廓线。
         * 注意不能用零件组做这件事——每个薄零件放大后内表面会跑到本体前面。
         */
        const outlineScale = 1 + 2 * OUTLINE_PX * worldPerPixel;
        const hullGeometry = new RoundedBoxGeometry(1, 1, 1, 4, CORNER_RADIUS);
        const hullMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color(palette.line),
            side: THREE.BackSide,
            toneMapped: false
        });
        const hullMesh = new THREE.Mesh(hullGeometry, hullMaterial);
        hullMesh.scale.setScalar(outlineScale);
        hullMesh.frustumCulled = false;
        cubeGroup.add(hullMesh);

        const addPart = (
            geometry: THREE.BufferGeometry,
            position: [number, number, number],
            material: THREE.MeshBasicMaterial,
            name?: string
        ) => {
            const mesh = new THREE.Mesh(geometry, material) as ViewCubeMesh;
            mesh.position.set(position[0], position[1], position[2]);
            if (name) mesh.name = name;
            bodyGroup.add(mesh);

            return mesh;
        };

        const createFaceTexture = (text: string, fill: string, ink: string) => {
            const textureCanvas = document.createElement("canvas");
            const size = 256;
            textureCanvas.width = size;
            textureCanvas.height = size;

            const context = textureCanvas.getContext("2d");

            if (context) {
                context.clearRect(0, 0, size, size);

                context.fillStyle = fill;
                context.fillRect(0, 0, size, size);

                const isCjk = /[\u4e00-\u9fa5]/.test(text);
                const label = isCjk ? text : text.toUpperCase();

                context.fillStyle = ink;
                context.font = isCjk
                    ? `600 ${Math.round(size * 0.44)}px "Microsoft YaHei", "PingFang SC", sans-serif`
                    : `600 ${Math.round(size * 0.2)}px "Segoe UI", Arial, sans-serif`;
                context.textAlign = "center";
                context.textBaseline = "middle";
                context.fillText(label, size / 2, size / 2 + (isCjk ? 2 : 0));
            }

            const texture = new THREE.CanvasTexture(textureCanvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 4;
            texture.needsUpdate = true;
            createdTextures.push(texture);
            return texture;
        };

        // ---------- 6 个面：白底 + 大字号标注，悬停换一张底色贴图 ----------
        FACE_PARTS.forEach((part) => {
            const normal = new THREE.Vector3(part.normal[0], part.normal[1], part.normal[2]);
            const up = new THREE.Vector3(part.up[0], part.up[1], part.up[2]);
            const right = new THREE.Vector3().crossVectors(up, normal).normalize();
            const basis = new THREE.Matrix4().makeBasis(right, up, normal);

            const geometry = new THREE.PlaneGeometry(FACE_SIZE, FACE_SIZE);
            const label = t(`cube_${part.key}`);
            const normalMap = createFaceTexture(label, palette.fill, palette.text);
            const hoverMap = createFaceTexture(label, palette.hoverFill, palette.textHover);

            const material = new THREE.MeshBasicMaterial({ map: normalMap, toneMapped: false });
            const mesh = addPart(
                geometry,
                [normal.x * 0.5, normal.y * 0.5, normal.z * 0.5],
                material,
                part.key
            );
            mesh.quaternion.setFromRotationMatrix(basis);

            mesh.userData.isFace = true;
            mesh.userData.normalMap = normalMap;
            mesh.userData.hoverMap = hoverMap;
            mesh.userData.originalColor = material.color.clone();

            clickablePartsRef.current.push(mesh);
        });

        // ---------- 12 条棱：圆柱，对外就是圆角 ----------
        EDGE_PARTS.forEach((part) => {
            const geometry = new THREE.CylinderGeometry(
                CORNER_RADIUS,
                CORNER_RADIUS,
                FACE_SIZE + SEAM_OVERLAP,
                12,
                1,
                true
            );

            if (part.axis === 0) {
                geometry.rotateZ(Math.PI / 2);
            } else if (part.axis === 2) {
                geometry.rotateX(Math.PI / 2);
            }

            const material = new THREE.MeshBasicMaterial({
                color: new THREE.Color(palette.fill),
                toneMapped: false
            });

            const mesh = addPart(geometry, part.position, material, part.name);

            mesh.userData.isFace = false;
            mesh.userData.hoverColor = palette.hoverFill;
            mesh.userData.originalColor = material.color.clone();

            clickablePartsRef.current.push(mesh);
        });

        // ---------- 8 个角：球 ----------
        CORNER_PARTS.forEach((part) => {
            const geometry = new THREE.SphereGeometry(CORNER_RADIUS, 16, 12);
            const material = new THREE.MeshBasicMaterial({
                color: new THREE.Color(palette.fill),
                toneMapped: false
            });

            const mesh = addPart(geometry, part.position, material, part.name);

            mesh.userData.isFace = false;
            mesh.userData.hoverColor = palette.hoverFill;
            mesh.userData.originalColor = material.color.clone();

            clickablePartsRef.current.push(mesh);
        });

        // ---------- 中线：靠近相机那个角点的三条棱 ----------
        const creaseRadius = 0.5 * CREASE_PX * worldPerPixel;
        const creaseMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color(palette.line),
            toneMapped: false
        });
        const creaseGeometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false);

        for (let i = 0; i < 3; i += 1) {
            const mesh = new THREE.Mesh(creaseGeometry, creaseMaterial);
            mesh.frustumCulled = false;
            mesh.visible = false;
            cubeGroup.add(mesh);
            creasesRef.current.push(mesh);
        }

        const creaseLength = 1 - CREASE_TRIM_NEAR - CREASE_TRIM_FAR;
        const creaseMid = CREASE_TRIM_NEAR + creaseLength / 2;

        const tmpCorner = new THREE.Vector3();
        const tmpNormalA = new THREE.Vector3();
        const tmpNormalB = new THREE.Vector3();
        const tmpDir = new THREE.Vector3();
        const tmpPos = new THREE.Vector3();

        const updateCreases = (rotation: THREE.Quaternion) => {
            // 视图空间中 z 最大的角点 = 离相机最近的角
            let bestZ = -Infinity;
            let sx = 1;
            let sy = 1;
            let sz = 1;

            for (let i = 0; i < 8; i += 1) {
                const cx = i & 1 ? 1 : -1;
                const cy = i & 2 ? 1 : -1;
                const cz = i & 4 ? 1 : -1;

                tmpCorner.set(cx * 0.5, cy * 0.5, cz * 0.5).applyQuaternion(rotation);

                if (tmpCorner.z > bestZ) {
                    bestZ = tmpCorner.z;
                    sx = cx;
                    sy = cy;
                    sz = cz;
                }
            }

            const signs = [sx, sy, sz];

            for (let axis = 0; axis < 3; axis += 1) {
                const mesh = creasesRef.current[axis];
                if (!mesh) continue;

                const a = (axis + 1) % 3;
                const b = (axis + 2) % 3;

                tmpNormalA.set(0, 0, 0).setComponent(a, signs[a]).applyQuaternion(rotation);
                tmpNormalB.set(0, 0, 0).setComponent(b, signs[b]).applyQuaternion(rotation);

                const visible = tmpNormalA.z > FACE_VISIBLE_EPS && tmpNormalB.z > FACE_VISIBLE_EPS;
                mesh.visible = visible;

                if (!visible) continue;

                tmpDir.set(0, 0, 0).setComponent(axis, -signs[axis]);
                tmpPos
                    .set(signs[0] * 0.5, signs[1] * 0.5, signs[2] * 0.5)
                    .addScaledVector(tmpDir, creaseMid);

                mesh.position.copy(tmpPos);
                mesh.quaternion.setFromUnitVectors(UP, tmpDir);
                mesh.scale.set(creaseRadius, creaseLength, creaseRadius);
            }
        };

        let animationId = 0;

        const animate = () => {
            animationId = requestAnimationFrame(animate);

            if (sceneMgr && cubeRef.current) {
                cubeRef.current.quaternion.copy(sceneMgr.camera.quaternion).invert();
                updateCreases(cubeRef.current.quaternion);
            }

            renderer.render(scene, camera);
        };

        animate();

        return () => {
            cancelAnimationFrame(animationId);
            clickablePartsRef.current = [];
            creasesRef.current = [];
            hoveredPart.current = null;
            renderer.dispose();

            const geometries = new Set<THREE.BufferGeometry>();
            const materials = new Set<THREE.Material>();

            scene.traverse((obj) => {
                if (obj instanceof THREE.Mesh) {
                    geometries.add(obj.geometry);

                    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                    mats.forEach((m) => materials.add(m));
                }
            });

            createdTextures.forEach((texture) => texture.dispose());
            materials.forEach((material) => material.dispose());
            geometries.forEach((geometry) => geometry.dispose());
        };
    }, [sceneMgr, cubeSize, lang, isDark]);

    const resetPartState = (mesh: ViewCubeMesh | null) => {
        if (!mesh) return;

        const mat = mesh.material;
        mat.color.copy(mesh.userData.originalColor);

        if (mesh.userData.isFace) {
            mat.map = mesh.userData.normalMap;
        }
    };

    const setHoverState = (mesh: ViewCubeMesh) => {
        const mat = mesh.material;

        if (mesh.userData.isFace) {
            mat.map = mesh.userData.hoverMap;
        } else {
            mat.color.set(mesh.userData.hoverColor);
        }
    };

    const pickPart = (event: React.MouseEvent) => {
        if (!canvasRef.current || !cameraRef.current) return null;

        const rect = canvasRef.current.getBoundingClientRect();

        mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.current.setFromCamera(mouse.current, cameraRef.current);

        const intersects = raycaster.current.intersectObjects(clickablePartsRef.current, false);

        if (intersects.length === 0) return null;

        return intersects[0].object as ViewCubeMesh;
    };

    const handleMouseMove = (event: React.MouseEvent) => {
        if (!containerRef.current) return;

        const mesh = pickPart(event);

        if (mesh) {
            if (hoveredPart.current !== mesh) {
                resetPartState(hoveredPart.current);
                hoveredPart.current = mesh;
                setHoverState(mesh);
            }

            containerRef.current.style.cursor = "pointer";
        } else {
            resetPartState(hoveredPart.current);
            hoveredPart.current = null;
            containerRef.current.style.cursor = "default";
        }
    };

    const handleMouseLeave = () => {
        resetPartState(hoveredPart.current);
        hoveredPart.current = null;

        if (containerRef.current) {
            containerRef.current.style.cursor = "default";
        }
    };

    const handleClick = (event: React.MouseEvent) => {
        if (!sceneMgr) return;

        const mesh = pickPart(event);

        if (!mesh) return;

        handleViewChange(mesh.name);
    };

    const handleViewChange = (viewName: string) => {
        if (!sceneMgr) return;

        const viewMap: Record<string, string> = {
            top: "top",
            bottom: "bottom",
            front: "front",
            back: "back",
            left: "left",
            right: "right",
            "top-front-right": "se",
            "top-front-left": "sw",
            "top-back-right": "ne",
            "top-back-left": "nw",
            "front-right": "right",
            "front-left": "left",
            "back-right": "right",
            "back-left": "left",
            "top-front": "front",
            "top-back": "back",
            "top-left": "left",
            "top-right": "right",
            "bottom-front": "front",
            "bottom-back": "back",
            "bottom-left": "left",
            "bottom-right": "right"
        };

        sceneMgr.setView(viewMap[viewName] || viewName);
    };

    return (
        <div
            ref={containerRef}
            className="ui-viewcube ui-viewcube-clean"
            style={{
                width: `${cubeSize}px`,
                height: `${cubeSize}px`
            }}
            onClick={handleClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            <canvas
                ref={canvasRef}
                className="ui-viewcube-canvas"
                style={{ width: `${cubeSize}px`, height: `${cubeSize}px` }}
            />
        </div>
    );
};