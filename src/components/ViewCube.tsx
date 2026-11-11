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

type ViewCubeMesh = THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>;

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

        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        camera.position.set(0, 0, 3.2);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.9);
        scene.add(ambientLight);

        const mainLight = new THREE.DirectionalLight(0xffffff, 0.35);
        mainLight.position.set(3, 4, 5);
        scene.add(mainLight);

        const cubeGroup = new THREE.Group();
        scene.add(cubeGroup);
        cubeRef.current = cubeGroup;
        clickablePartsRef.current = [];

        const readCssVar = (name: string, fallback: string) => {
            const root = getComputedStyle(document.documentElement);
            const value = root.getPropertyValue(name).trim();
            return value || fallback;
        };

        const accentCss = readCssVar("--accent", isDark ? "#6FB3E6" : "#0B5FA5");
        // AutoCAD 风格：整体接近白色，靠细灰棱线勾出棱与角，悬停浅蓝高亮
        const faceColor = isDark ? new THREE.Color("#2B333D") : new THREE.Color("#FFFFFF");
        const sideColor = isDark ? new THREE.Color("#262D36") : new THREE.Color("#FBFCFD");
        const edgeColor = isDark ? new THREE.Color("#303945") : new THREE.Color("#FFFFFF");
        const cornerColor = isDark ? new THREE.Color("#353F4B") : new THREE.Color("#FFFFFF");
        const lineColor = isDark ? new THREE.Color("#7D8896") : new THREE.Color("#A6ADB5");
        const hoverColor = new THREE.Color(accentCss);

        const createRoundedRectPath = (
            ctx: CanvasRenderingContext2D,
            x: number,
            y: number,
            w: number,
            h: number,
            r: number
        ) => {
            const radius = Math.min(r, w / 2, h / 2);
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + w - radius, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
            ctx.lineTo(x + w, y + h - radius);
            ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
            ctx.lineTo(x + radius, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
        };

        const createFaceTexture = (text: string, rotation: number = 0) => {
            const textureCanvas = document.createElement("canvas");
            const size = 256;
            textureCanvas.width = size;
            textureCanvas.height = size;

            const context = textureCanvas.getContext("2d");

            if (context) {
                context.clearRect(0, 0, size, size);

                context.fillStyle = isDark ? "#2B333D" : "#FFFFFF";
                context.fillRect(0, 0, size, size);

                // 面内浅色板：上亮下暗的极轻渐变，模拟 AutoCAD 立方体的柔和明暗
                const plate = context.createLinearGradient(0, 24, 0, 232);
                if (isDark) {
                    plate.addColorStop(0, "#363F4A");
                    plate.addColorStop(1, "#29313A");
                } else {
                    plate.addColorStop(0, "#FFFFFF");
                    plate.addColorStop(1, "#F0F2F5");
                }
                context.fillStyle = plate;
                createRoundedRectPath(context, 22, 22, 212, 212, 14);
                context.fill();

                // 细内框线：AutoCAD 面片的细分隔线
                context.strokeStyle = isDark ? "rgba(255,255,255,0.22)" : "rgba(154,161,169,0.9)";
                context.lineWidth = 2;
                createRoundedRectPath(context, 26, 26, 204, 204, 12);
                context.stroke();

                context.save();
                context.translate(size / 2, size / 2);

                if (rotation !== 0) {
                    context.rotate((rotation * Math.PI) / 180);
                }

                const isCjk = /[\u4e00-\u9fa5]/.test(text);
                const label = isCjk ? text : text.toUpperCase();

                context.fillStyle = isDark ? "#E8EBEF" : "#3C4043";
                context.font = isCjk
                    ? '600 82px "Microsoft YaHei", "PingFang SC", sans-serif'
                    : '600 46px "Segoe UI", Arial, sans-serif';
                context.textAlign = "center";
                context.textBaseline = "middle";
                context.fillText(label, 0, 2);
                context.restore();
            }

            const texture = new THREE.CanvasTexture(textureCanvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 4;
            texture.needsUpdate = true;
            return texture;
        };

        const createLineFrame = (mesh: ViewCubeMesh) => {
            const edgesGeometry = new THREE.EdgesGeometry(mesh.geometry, 24);
            const lineMaterial = new THREE.LineBasicMaterial({
                color: lineColor,
                transparent: true,
                opacity: 0.9
            });
            const line = new THREE.LineSegments(edgesGeometry, lineMaterial);
            line.userData.isViewCubeFrame = true;
            mesh.add(line);
        };

        const createPart = (
            size: THREE.Vector3,
            pos: THREE.Vector3,
            name: string,
            color: THREE.Color,
            text?: string,
            rotation: number = 0
        ) => {
            const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);

            const material = new THREE.MeshLambertMaterial({
                color: text ? new THREE.Color("#FFFFFF") : color,
                map: text ? createFaceTexture(text, rotation) : undefined,
                transparent: true,
                opacity: text ? 0.98 : 0.96
            });

            const mesh = new THREE.Mesh(geometry, material) as ViewCubeMesh;
            mesh.position.copy(pos);
            mesh.name = name;
            mesh.userData.originalOpacity = material.opacity;
            mesh.userData.originalColor = material.color.clone();
            mesh.userData.isFace = !!text;
            mesh.userData.clickable = true;

            createLineFrame(mesh);
            cubeGroup.add(mesh);
            clickablePartsRef.current.push(mesh);

            return mesh;
        };

        const faceSize = 0.86;
        const edgeSize = 0.09;
        const cornerSize = 0.1;
        const faceThickness = 0.05;
        const offset = 0.5;

        createPart(new THREE.Vector3(faceSize, faceThickness, faceSize), new THREE.Vector3(0, -offset, 0), "front", faceColor, t("cube_front"));
        createPart(new THREE.Vector3(faceSize, faceThickness, faceSize), new THREE.Vector3(0, offset, 0), "back", faceColor, t("cube_back"), 180);
        createPart(new THREE.Vector3(faceSize, faceSize, faceThickness), new THREE.Vector3(0, 0, offset), "top", faceColor, t("cube_top"), 360);
        createPart(new THREE.Vector3(faceSize, faceSize, faceThickness), new THREE.Vector3(0, 0, -offset), "bottom", sideColor, t("cube_bottom"));
        createPart(new THREE.Vector3(faceThickness, faceSize, faceSize), new THREE.Vector3(-offset, 0, 0), "left", sideColor, t("cube_left"), 90);
        createPart(new THREE.Vector3(faceThickness, faceSize, faceSize), new THREE.Vector3(offset, 0, 0), "right", sideColor, t("cube_right"), 270);

        createPart(new THREE.Vector3(faceSize, edgeSize, edgeSize), new THREE.Vector3(0, -offset, offset), "top-front", edgeColor);
        createPart(new THREE.Vector3(faceSize, edgeSize, edgeSize), new THREE.Vector3(0, offset, offset), "top-back", edgeColor);
        createPart(new THREE.Vector3(edgeSize, faceSize, edgeSize), new THREE.Vector3(-offset, 0, offset), "top-left", edgeColor);
        createPart(new THREE.Vector3(edgeSize, faceSize, edgeSize), new THREE.Vector3(offset, 0, offset), "top-right", edgeColor);

        createPart(new THREE.Vector3(faceSize, edgeSize, edgeSize), new THREE.Vector3(0, -offset, -offset), "bottom-front", edgeColor);
        createPart(new THREE.Vector3(faceSize, edgeSize, edgeSize), new THREE.Vector3(0, offset, -offset), "bottom-back", edgeColor);
        createPart(new THREE.Vector3(edgeSize, faceSize, edgeSize), new THREE.Vector3(-offset, 0, -offset), "bottom-left", edgeColor);
        createPart(new THREE.Vector3(edgeSize, faceSize, edgeSize), new THREE.Vector3(offset, 0, -offset), "bottom-right", edgeColor);

        createPart(new THREE.Vector3(edgeSize, edgeSize, faceSize), new THREE.Vector3(-offset, -offset, 0), "front-left", edgeColor);
        createPart(new THREE.Vector3(edgeSize, edgeSize, faceSize), new THREE.Vector3(offset, -offset, 0), "front-right", edgeColor);
        createPart(new THREE.Vector3(edgeSize, edgeSize, faceSize), new THREE.Vector3(-offset, offset, 0), "back-left", edgeColor);
        createPart(new THREE.Vector3(edgeSize, edgeSize, faceSize), new THREE.Vector3(offset, offset, 0), "back-right", edgeColor);

        createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(-offset, -offset, offset), "top-front-left", cornerColor);
        createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(offset, -offset, offset), "top-front-right", cornerColor);
        createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(-offset, offset, offset), "top-back-left", cornerColor);
        createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(offset, offset, offset), "top-back-right", cornerColor);

        createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(-offset, -offset, -offset), "bottom-front-left", cornerColor);
        createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(offset, -offset, -offset), "bottom-front-right", cornerColor);
        createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(-offset, offset, -offset), "bottom-back-left", cornerColor);
        createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(offset, offset, -offset), "bottom-back-right", cornerColor);

        cubeGroup.rotation.set(0, 0, 0);

        let animationId = 0;

        const animate = () => {
            animationId = requestAnimationFrame(animate);

            if (sceneMgr && cubeRef.current) {
                cubeRef.current.quaternion.copy(sceneMgr.camera.quaternion).invert();
            }

            renderer.render(scene, camera);
        };

        animate();

        return () => {
            cancelAnimationFrame(animationId);
            clickablePartsRef.current = [];
            renderer.dispose();

            scene.traverse((obj) => {
                if (obj instanceof THREE.Mesh) {
                    obj.geometry.dispose();

                    const mat = obj.material;

                    if (Array.isArray(mat)) {
                        mat.forEach((m) => {
                            if ("map" in m && m.map) m.map.dispose();
                            m.dispose();
                        });
                    } else {
                        if (mat.map) mat.map.dispose();
                        mat.dispose();
                    }
                }

                if (obj instanceof THREE.LineSegments) {
                    obj.geometry.dispose();

                    const mat = obj.material;

                    if (Array.isArray(mat)) {
                        mat.forEach((m) => m.dispose());
                    } else {
                        mat.dispose();
                    }
                }
            });
        };
    }, [sceneMgr, cubeSize, lang, isDark]);

    const resetPartState = (mesh: ViewCubeMesh | null) => {
        if (!mesh) return;

        const mat = mesh.material;
        mat.opacity = mesh.userData.originalOpacity;
        mat.color.copy(mesh.userData.originalColor);
        mesh.scale.set(1, 1, 1);
    };

    const setHoverState = (mesh: ViewCubeMesh) => {
        const mat = mesh.material;

        // AutoCAD 风格：面与棱/角统一用浅蓝高亮（深色主题用更亮的强调蓝）
        mat.color.set(isDark ? 0x2A78AD : 0xCFE4F7);
        mat.opacity = 1;

        mesh.scale.set(1.02, 1.02, 1.02);
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

