import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { SceneManager } from "../utils/SceneManager";

interface ViewCubeProps {
    sceneMgr: SceneManager | null;
    theme: any;
}

export const ViewCube: React.FC<ViewCubeProps> = ({ sceneMgr, theme }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const cubeRef = useRef<THREE.Group | null>(null);
    const raycaster = useRef(new THREE.Raycaster());
    const mouse = useRef(new THREE.Vector2());
    const hoveredPart = useRef<THREE.Mesh | null>(null);

    useEffect(() => {
        if (!canvasRef.current || !containerRef.current) return;

        const width = 180;
        const height = 180;

        // Renderer
        const renderer = new THREE.WebGLRenderer({
            canvas: canvasRef.current,
            antialias: true,
            alpha: true,
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        rendererRef.current = renderer;

        // Scene
        const scene = new THREE.Scene();
        sceneRef.current = scene;

        // Camera
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        camera.position.set(0, 0, 3.5);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(5, 5, 5);
        scene.add(dirLight);

        // Cube Group
        const cubeGroup = new THREE.Group();
        scene.add(cubeGroup);
        cubeRef.current = cubeGroup;

        // Create Face Texture
        const createFaceTexture = (text: string, rotation: number = 0) => {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const context = canvas.getContext('2d');
            if (context) {
                // Background
                context.fillStyle = '#f8f9fa';
                context.fillRect(0, 0, 128, 128);
                
                // Text
                context.save();
                context.translate(64, 64);
                if (rotation !== 0) {
                    context.rotate((rotation * Math.PI) / 180);
                }
                context.fillStyle = '#333333';
                context.font = 'bold 54px "Microsoft YaHei", sans-serif';
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.fillText(text, 0, 0);
                context.restore();
                
                // Border
                context.strokeStyle = '#cccccc';
                context.lineWidth = 4;
                context.strokeRect(2, 2, 124, 124);
            }
            const texture = new THREE.CanvasTexture(canvas);
            return texture;
        };

        const faceColor = 0xf8f9fa;
        const edgeColor = 0xf8f9fa;
        const cornerColor = 0xf8f9fa;

        // Create Cube Parts
        const createPart = (size: THREE.Vector3, pos: THREE.Vector3, name: string, color: number, text?: string, rotation: number = 0) => {
            const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
            let material;
            if (text) {
                const texture = createFaceTexture(text, rotation);
                material = new THREE.MeshPhongMaterial({
                    map: texture,
                    transparent: true,
                    opacity: 0.98,
                    shininess: 30
                });
            } else {
                material = new THREE.MeshPhongMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.98,
                    shininess: 30
                });
            }
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.copy(pos);
            mesh.name = name;
            // Store original color/opacity for hover effect
            mesh.userData.originalOpacity = material.opacity;
            mesh.userData.originalColor = material.color.clone();
            mesh.userData.isFace = !!text;
            cubeGroup.add(mesh);
            return mesh;
        };

        const faceSize = 0.88;
        const edgeSize = 0.12;
        const cornerSize = 0.12;
        const offset = 0.5;

        // Faces (SceneManager: Z up, Y- front)
        createPart(new THREE.Vector3(faceSize, 0.05, faceSize), new THREE.Vector3(0, -offset, 0), "front", faceColor, "前");
        createPart(new THREE.Vector3(faceSize, 0.05, faceSize), new THREE.Vector3(0, offset, 0), "back", faceColor, "后", 180);
        createPart(new THREE.Vector3(faceSize, faceSize, 0.05), new THREE.Vector3(0, 0, offset), "top", faceColor, "顶", 180);
        createPart(new THREE.Vector3(faceSize, faceSize, 0.05), new THREE.Vector3(0, 0, -offset), "bottom", faceColor, "底");
        createPart(new THREE.Vector3(0.05, faceSize, faceSize), new THREE.Vector3(-offset, 0, 0), "left", faceColor, "左", 90);
        createPart(new THREE.Vector3(0.05, faceSize, faceSize), new THREE.Vector3(offset, 0, 0), "right", faceColor, "右", 270);

        // Edges
        // Top edges (Z = offset)
        createPart(new THREE.Vector3(faceSize, edgeSize, edgeSize), new THREE.Vector3(0, -offset, offset), "top-front", edgeColor);
        createPart(new THREE.Vector3(faceSize, edgeSize, edgeSize), new THREE.Vector3(0, offset, offset), "top-back", edgeColor);
        createPart(new THREE.Vector3(edgeSize, faceSize, edgeSize), new THREE.Vector3(-offset, 0, offset), "top-left", edgeColor);
        createPart(new THREE.Vector3(edgeSize, faceSize, edgeSize), new THREE.Vector3(offset, 0, offset), "top-right", edgeColor);
        // Bottom edges (Z = -offset)
        createPart(new THREE.Vector3(faceSize, edgeSize, edgeSize), new THREE.Vector3(0, -offset, -offset), "bottom-front", edgeColor);
        createPart(new THREE.Vector3(faceSize, edgeSize, edgeSize), new THREE.Vector3(0, offset, -offset), "bottom-back", edgeColor);
        createPart(new THREE.Vector3(edgeSize, faceSize, edgeSize), new THREE.Vector3(-offset, 0, -offset), "bottom-left", edgeColor);
        createPart(new THREE.Vector3(edgeSize, faceSize, edgeSize), new THREE.Vector3(offset, 0, -offset), "bottom-right", edgeColor);
        // Middle edges (Z = 0)
        createPart(new THREE.Vector3(edgeSize, edgeSize, faceSize), new THREE.Vector3(-offset, -offset, 0), "front-left", edgeColor);
        createPart(new THREE.Vector3(edgeSize, edgeSize, faceSize), new THREE.Vector3(offset, -offset, 0), "front-right", edgeColor);
        createPart(new THREE.Vector3(edgeSize, edgeSize, faceSize), new THREE.Vector3(-offset, offset, 0), "back-left", edgeColor);
        createPart(new THREE.Vector3(edgeSize, edgeSize, faceSize), new THREE.Vector3(offset, offset, 0), "back-right", edgeColor);

        // Corners
        createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(-offset, -offset, offset), "top-front-left", cornerColor);
        createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(offset, -offset, offset), "top-front-right", cornerColor);
        createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(-offset, offset, offset), "top-back-left", cornerColor);
        createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(offset, offset, offset), "top-back-right", cornerColor);
        createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(-offset, -offset, -offset), "bottom-front-left", cornerColor);
        createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(offset, -offset, -offset), "bottom-front-right", cornerColor);
        createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(-offset, offset, -offset), "bottom-back-left", cornerColor);
        createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(offset, offset, -offset), "bottom-back-right", cornerColor);

        // Animation Loop
        let animationId: number;
        const animate = () => {
            animationId = requestAnimationFrame(animate);

            if (sceneMgr && cubeRef.current) {
                // Sync rotation with main camera
                cubeRef.current.quaternion.copy(sceneMgr.camera.quaternion).invert();
            }

            renderer.render(scene, camera);
        };
        animate();

        // Cleanup
        return () => {
            cancelAnimationFrame(animationId);
            renderer.dispose();
            scene.traverse((obj) => {
                if (obj instanceof THREE.Mesh) {
                    obj.geometry.dispose();
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(m => m.dispose());
                    } else {
                        obj.material.dispose();
                    }
                }
            });
        };
    }, [sceneMgr]);

    const handleMouseMove = (event: React.MouseEvent) => {
        if (!canvasRef.current || !sceneRef.current || !cameraRef.current || !cubeRef.current) return;

        const rect = canvasRef.current.getBoundingClientRect();
        mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.current.setFromCamera(mouse.current, cameraRef.current);
        const intersects = raycaster.current.intersectObjects(cubeRef.current.children);

        if (intersects.length > 0) {
            const mesh = intersects[0].object as THREE.Mesh;
            if (hoveredPart.current !== mesh) {
                if (hoveredPart.current) {
                    const mat = hoveredPart.current.material as THREE.MeshPhongMaterial;
                    mat.opacity = hoveredPart.current.userData.originalOpacity;
                    mat.color.copy(hoveredPart.current.userData.originalColor);
                }
                hoveredPart.current = mesh;
                const mat = mesh.material as THREE.MeshPhongMaterial;
                mat.opacity = 1.0;
                mat.color.set(0x0078d4); // Highlight color
            }
            containerRef.current!.style.cursor = 'pointer';
        } else {
            if (hoveredPart.current) {
                const mat = hoveredPart.current.material as THREE.MeshPhongMaterial;
                mat.opacity = hoveredPart.current.userData.originalOpacity;
                mat.color.copy(hoveredPart.current.userData.originalColor);
                hoveredPart.current = null;
            }
            containerRef.current!.style.cursor = 'default';
        }
    };

    const handleMouseLeave = () => {
        if (hoveredPart.current) {
            const mat = hoveredPart.current.material as THREE.MeshPhongMaterial;
            mat.opacity = hoveredPart.current.userData.originalOpacity;
            mat.color.copy(hoveredPart.current.userData.originalColor);
            hoveredPart.current = null;
        }
    };

    const handleClick = (event: React.MouseEvent) => {
        if (!canvasRef.current || !sceneRef.current || !cameraRef.current || !sceneMgr) return;

        const rect = canvasRef.current.getBoundingClientRect();
        mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.current.setFromCamera(mouse.current, cameraRef.current);
        const intersects = raycaster.current.intersectObjects(cubeRef.current!.children);

        if (intersects.length > 0) {
            const name = intersects[0].object.name;
            handleViewChange(name);
        }
    };

    const handleViewChange = (viewName: string) => {
        if (!sceneMgr) return;
        
        // Map cube part names to SceneManager view names
        // SceneManager views: 'top', 'bottom', 'front', 'back', 'left', 'right', 'se', 'sw', 'ne', 'nw'
        
        let targetView = viewName;
        
        // Map some composite names to supported views if necessary
        // The SceneManager's setView is currently limited to 10 views.
        // I might need to extend it or map my 26 parts to these 10.
        
        if (viewName === "top-front-right") targetView = "se";
        else if (viewName === "top-front-left") targetView = "sw";
        else if (viewName === "top-back-right") targetView = "ne";
        else if (viewName === "top-back-left") targetView = "nw";
        
        // For others, just try to use the name or a fallback
        sceneMgr.setView(targetView);
    };

    return (
        <div 
            ref={containerRef}
            style={{
                position: "absolute",
                top: "10px",
                right: "10px",
                width: "180px",
                height: "180px",
                zIndex: 100,
                pointerEvents: "auto",
                borderRadius: "8px",
                overflow: "hidden",
            }}
            onClick={handleClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            <canvas ref={canvasRef} />
        </div>
    );
};
