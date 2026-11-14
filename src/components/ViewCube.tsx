import React, { useEffect, useRef } from "react";
import * as THREE from "three";
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
 * 倒直角立方体（局部坐标，边长 1）
 *
 * 每条棱用一张 45° 平面切掉，8 个顶点被切成三角形倒角面。
 * 于是 6 个面 + 12 条棱带 + 8 个角三角 = 26 块，全部是
 * 可独立拾取的零件 —— 面、棱、顶点都能点。
 *
 * 零件各自沿边缘内缩「半条缝」，底下垫一个实心的同形外壳，
 * 外壳用描边色：缝隙里透出来的就是分块线。这样每条棱、
 * 每个角都有一圈细线勾着，看上去就是一格一格可点的目标。
 * ============================================================ */
const CHAMFER = 0.09;
const FACE_SIZE = 1 - CHAMFER * 2;
/** 倒角棱带的宽度（45° 切面在表面上的宽度） */
const BAND_WIDTH = CHAMFER * Math.SQRT2;
/** 三角倒角面外接圆半径 */
const CORNER_CIRCUM = (CHAMFER * Math.SQRT2) / Math.sqrt(3);

const CAMERA_DISTANCE = 2.8;
const CAMERA_FOV = 38;

/** 相邻零件之间透出的分块线宽度（屏幕像素） */
const SEAM_PX = 1.1;
/** 外轮廓线宽度（屏幕像素） */
const OUTLINE_PX = 0.8;

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
    /** 棱两侧面的朝向（axis 分量为 0） */
    signs: [number, number, number];
}

const EDGE_PARTS: EdgePart[] = [
    { name: "top-front", axis: 0, signs: [0, -1, 1] },
    { name: "top-back", axis: 0, signs: [0, 1, 1] },
    { name: "bottom-front", axis: 0, signs: [0, -1, -1] },
    { name: "bottom-back", axis: 0, signs: [0, 1, -1] },
    { name: "top-left", axis: 1, signs: [-1, 0, 1] },
    { name: "top-right", axis: 1, signs: [1, 0, 1] },
    { name: "bottom-left", axis: 1, signs: [-1, 0, -1] },
    { name: "bottom-right", axis: 1, signs: [1, 0, -1] },
    { name: "front-left", axis: 2, signs: [-1, -1, 0] },
    { name: "front-right", axis: 2, signs: [1, -1, 0] },
    { name: "back-left", axis: 2, signs: [-1, 1, 0] },
    { name: "back-right", axis: 2, signs: [1, 1, 0] }
];

const CORNER_PARTS: { name: string; signs: [number, number, number] }[] = [
    { name: "top-front-left", signs: [-1, -1, 1] },
    { name: "top-front-right", signs: [1, -1, 1] },
    { name: "top-back-left", signs: [-1, 1, 1] },
    { name: "top-back-right", signs: [1, 1, 1] },
    { name: "bottom-front-left", signs: [-1, -1, -1] },
    { name: "bottom-front-right", signs: [1, -1, -1] },
    { name: "bottom-back-left", signs: [-1, 1, -1] },
    { name: "bottom-back-right", signs: [1, 1, -1] }
];

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const AXIS_VECTORS = [AXIS_X, AXIS_Y, AXIS_Z];

/** 倒角立方的顶点：沿 axis 方向保留满长，另外两个方向各内收 CHAMFER */
const cornerVertex = (signs: [number, number, number], skip: 0 | 1 | 2, chamfer: number) => {
    const inset = 0.5 - chamfer;
    return new THREE.Vector3(
        signs[0] * (skip === 0 ? 0.5 : inset),
        signs[1] * (skip === 1 ? 0.5 : inset),
        signs[2] * (skip === 2 ? 0.5 : inset)
    );
};

/** 把一组顶点按扇形三角化写入 positions，并保证法线朝外 */
const pushPolygon = (positions: number[], points: THREE.Vector3[]) => {
    const centroid = new THREE.Vector3();
    points.forEach((point) => centroid.add(point));
    centroid.multiplyScalar(1 / points.length);

    const normal = new THREE.Vector3()
        .subVectors(points[1], points[0])
        .cross(new THREE.Vector3().subVectors(points[2], points[0]));

    if (normal.dot(centroid) < 0) points.reverse();

    for (let i = 1; i < points.length - 1; i += 1) {
        positions.push(points[0].x, points[0].y, points[0].z);
        positions.push(points[i].x, points[i].y, points[i].z);
        positions.push(points[i + 1].x, points[i + 1].y, points[i + 1].z);
    }
};

/** 26 块拼成的倒角立方（封闭实体），用作描边底壳 */
const buildChamferedHull = (chamfer: number) => {
    const positions: number[] = [];
    const quadOrder: [number, number][] = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1]
    ];

    for (let axis = 0; axis < 3; axis += 1) {
        const b = (axis + 1) % 3;
        const d = (axis + 2) % 3;

        // 6 个面
        for (const sign of [-1, 1]) {
            const points = quadOrder.map(([sb, sd]) => {
                const signs: [number, number, number] = [0, 0, 0];
                signs[axis] = sign;
                signs[b] = sb;
                signs[d] = sd;
                return cornerVertex(signs, axis as 0 | 1 | 2, chamfer);
            });
            pushPolygon(positions, points);
        }

        // 12 条棱带（axis 方向各 4 条）
        for (const sb of [-1, 1]) {
            for (const sd of [-1, 1]) {
                const plus: [number, number, number] = [0, 0, 0];
                const minus: [number, number, number] = [0, 0, 0];
                plus[b] = sb;
                plus[d] = sd;
                minus[b] = sb;
                minus[d] = sd;
                plus[axis] = 1;
                minus[axis] = -1;

                pushPolygon(positions, [
                    cornerVertex(plus, b as 0 | 1 | 2, chamfer),
                    cornerVertex(plus, d as 0 | 1 | 2, chamfer),
                    cornerVertex(minus, d as 0 | 1 | 2, chamfer),
                    cornerVertex(minus, b as 0 | 1 | 2, chamfer)
                ]);
            }
        }
    }

    // 8 个三角倒角面
    for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
            for (const sz of [-1, 1]) {
                const signs: [number, number, number] = [sx, sy, sz];
                pushPolygon(positions, [
                    cornerVertex(signs, 0, chamfer),
                    cornerVertex(signs, 1, chamfer),
                    cornerVertex(signs, 2, chamfer)
                ]);
            }
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
};

/** 单个顶点的三角倒角面：以质心为中心按「缝」内缩，保证与相邻棱带留缝 */
const buildCornerTriangle = (signs: [number, number, number], inset: number) => {
    const points = [0, 1, 2].map((skip) =>
        cornerVertex(signs, skip as 0 | 1 | 2, CHAMFER)
    );
    const centroid = new THREE.Vector3()
        .add(points[0])
        .add(points[1])
        .add(points[2])
        .multiplyScalar(1 / 3);

    // 等边三角形按质心等比缩放即等于三边同时内缩；留 20% 余量避免角料被缩没
    const scale = Math.max(0.2, 1 - (2 * inset) / CORNER_CIRCUM);
    const local = points.map((point) => point.clone().sub(centroid).multiplyScalar(scale));

    const normal = new THREE.Vector3()
        .subVectors(local[1], local[0])
        .cross(new THREE.Vector3().subVectors(local[2], local[0]));

    if (normal.dot(centroid) < 0) {
        const tmp = local[1];
        local[1] = local[2];
        local[2] = tmp;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
            local.flatMap((point) => [point.x, point.y, point.z]),
            3
        )
    );

    return { geometry, centroid };
};

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

    const cubeSize = sceneMgr?.settings?.viewCubeSize || 132;
    const t = (key: string) => getTranslation(lang as Lang, key);
    const isDark = typeof document !== "undefined" && (
        document.documentElement.classList.contains("theme-dark") ||
        document.documentElement.getAttribute("data-theme") === "dark" ||
        theme?.bg?.toLowerCase() === "#0e1114"
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

        // 极简线稿：无光照，靠「面 / 倒角」两档底色 + 分块线表达形体与可点击区域
        const palette = isDark
            ? {
                fill: "#232B33",
                bevelFill: "#343E4A",
                hoverFill: "#2A5F86",
                line: "#6C7885",
                text: "#DCE2E8",
                textHover: "#EAF3FA"
            }
            : {
                fill: "#FFFFFF",
                bevelFill: "#E4EAF2",
                hoverFill: "#CFE4F7",
                line: "#9AA6B3",
                text: "#3B424B",
                textHover: "#22303B"
            };

        const createdTextures: THREE.Texture[] = [];

        /** 1 个像素对应多少世界单位（立方体位于 z≈0 平面） */
        const worldPerPixel =
            (2 * CAMERA_DISTANCE * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2))) / cubeSize;

        /** 每个零件从公共边界往回收缩的距离 —— 两个零件各让一半，缝宽就是 SEAM_PX */
        const inset = (SEAM_PX * worldPerPixel) / 2;

        const cubeGroup = new THREE.Group();
        scene.add(cubeGroup);
        cubeRef.current = cubeGroup;
        clickablePartsRef.current = [];

        const bodyGroup = new THREE.Group();
        cubeGroup.add(bodyGroup);

        /**
         * 底层实心外壳：面和棱带都内缩，缝隙里露出这层描边色，
         * 于是每条棱、每个顶点都有一圈细线。再用一个放大一圈、
         * 只渲染背面的同形外壳画出外轮廓。
         */
        const hullGeometry = buildChamferedHull(CHAMFER);
        const hullMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color(palette.line),
            toneMapped: false,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
        });
        const hullMesh = new THREE.Mesh(hullGeometry, hullMaterial);
        hullMesh.frustumCulled = false;
        cubeGroup.add(hullMesh);

        const outlineScale = 1 + 2 * OUTLINE_PX * worldPerPixel;
        const outlineMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color(palette.line),
            side: THREE.BackSide,
            toneMapped: false
        });
        const outlineMesh = new THREE.Mesh(hullGeometry, outlineMaterial);
        outlineMesh.scale.setScalar(outlineScale);
        outlineMesh.frustumCulled = false;
        cubeGroup.add(outlineMesh);

        const addPart = (
            geometry: THREE.BufferGeometry,
            position: THREE.Vector3,
            material: THREE.MeshBasicMaterial,
            name?: string
        ) => {
            const mesh = new THREE.Mesh(geometry, material) as ViewCubeMesh;
            mesh.position.copy(position);
            if (name) mesh.name = name;
            bodyGroup.add(mesh);

            return mesh;
        };

        const createFaceTexture = (text: string, fill: string, ink: string) => {
            const textureCanvas = document.createElement("canvas");
            const size = 384;
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
            texture.anisotropy = 8;
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

            const geometry = new THREE.PlaneGeometry(
                FACE_SIZE - inset * 2,
                FACE_SIZE - inset * 2
            );
            const label = t(`cube_${part.key}`);
            const normalMap = createFaceTexture(label, palette.fill, palette.text);
            const hoverMap = createFaceTexture(label, palette.hoverFill, palette.textHover);

            const material = new THREE.MeshBasicMaterial({ map: normalMap, toneMapped: false });
            const mesh = addPart(geometry, normal.clone().multiplyScalar(0.5), material, part.key);
            mesh.quaternion.setFromRotationMatrix(basis);

            mesh.userData.isFace = true;
            mesh.userData.normalMap = normalMap;
            mesh.userData.hoverMap = hoverMap;
            mesh.userData.originalColor = material.color.clone();

            clickablePartsRef.current.push(mesh);
        });

        // ---------- 12 条棱：45° 倒角带 ----------
        EDGE_PARTS.forEach((part) => {
            const axis = part.axis;
            const b = (axis + 1) % 3;
            const d = (axis + 2) % 3;

            const normal = new THREE.Vector3();
            normal.setComponent(b, part.signs[b]);
            normal.setComponent(d, part.signs[d]);
            normal.normalize();

            // 沿棱方向 = axis；带宽方向 = 棱方向 × 倒角面法线
            const lengthDir = AXIS_VECTORS[axis].clone();
            const widthDir = new THREE.Vector3().crossVectors(lengthDir, normal).normalize();
            const basis = new THREE.Matrix4().makeBasis(widthDir, lengthDir, normal);

            const geometry = new THREE.PlaneGeometry(
                BAND_WIDTH - inset * 2,
                FACE_SIZE - inset * 2
            );

            const position = new THREE.Vector3(
                part.signs[0] * (axis === 0 ? 0 : 0.5 - CHAMFER / 2),
                part.signs[1] * (axis === 1 ? 0 : 0.5 - CHAMFER / 2),
                part.signs[2] * (axis === 2 ? 0 : 0.5 - CHAMFER / 2)
            );

            const material = new THREE.MeshBasicMaterial({
                color: new THREE.Color(palette.bevelFill),
                toneMapped: false
            });

            const mesh = addPart(geometry, position, material, part.name);
            mesh.quaternion.setFromRotationMatrix(basis);

            mesh.userData.isFace = false;
            mesh.userData.hoverColor = palette.hoverFill;
            mesh.userData.originalColor = material.color.clone();

            clickablePartsRef.current.push(mesh);
        });

        // ---------- 8 个角：三角倒角面 ----------
        CORNER_PARTS.forEach((part) => {
            const { geometry, centroid } = buildCornerTriangle(part.signs, inset);

            const material = new THREE.MeshBasicMaterial({
                color: new THREE.Color(palette.bevelFill),
                toneMapped: false
            });

            const mesh = addPart(geometry, centroid, material, part.name);

            mesh.userData.isFace = false;
            mesh.userData.hoverColor = palette.hoverFill;
            mesh.userData.originalColor = material.color.clone();

            clickablePartsRef.current.push(mesh);
        });

        let animationId = 0;

        const animate = () => {
            animationId = requestAnimationFrame(animate);

            if (cubeRef.current && sceneMgr) {
                cubeRef.current.quaternion.copy(sceneMgr.camera.quaternion).invert();
            }

            renderer.render(scene, camera);
        };

        animate();

        return () => {
            cancelAnimationFrame(animationId);
            clickablePartsRef.current = [];
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
    }, [sceneMgr, lang, isDark]);

    // 尺寸/DPR 变化只调整渲染器，不重建场景（此前每拖一次滑块都会重建 WebGL 上下文）
    useEffect(() => {
        const renderer = rendererRef.current;
        const camera = cameraRef.current;
        const canvas = canvasRef.current;
        if (!renderer || !canvas) return;
        const applySize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            renderer.setPixelRatio(dpr);
            renderer.setSize(cubeSize, cubeSize, false);
            if (camera) {
                camera.aspect = 1;
                camera.updateProjectionMatrix();
            }
        };
        applySize();
        const resolutionQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        const onResolutionChange = () => applySize();
        resolutionQuery.addEventListener?.("change", onResolutionChange);
        window.addEventListener("resize", applySize);
        return () => {
            resolutionQuery.removeEventListener?.("change", onResolutionChange);
            window.removeEventListener("resize", applySize);
        };
    }, [cubeSize]);

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

        // 面 / 棱 / 顶点都直接对应 setView 支持的视图名
        sceneMgr.setView(mesh.name);
    };

    return (
        <div
            ref={containerRef}
            className="ui-viewcube ui-viewcube-clean"
            role="button"
            tabIndex={0}
            aria-label={lang === "zh" ? "视图立方：点击或回车切换视图" : "View cube: click or press Enter to change view"}
            style={{
                width: `${cubeSize}px`,
                height: `${cubeSize}px`
            }}
            onClick={handleClick}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    sceneMgr?.setView("front");
                }
            }}
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
