import React, { Component, useState, useRef, useEffect, useCallback, useMemo } from "react";
// @ts-ignore
import * as THREE from "three";
import "./src/styles/index.css";
import { SceneManager, MeasureType, SceneSettings } from "./src/utils/SceneManager";
import { parseTilesetFromFolder } from "./src/loader/LoaderUtils";
import { convertLMBTo3DTiles, exportGLB, exportLMB } from "./src/utils/converter";
import { themes, ThemeColors } from "./src/theme/Styles";
import { getTranslation, Lang } from "./src/theme/Locales";

// 组件
import { Toolbar } from "./src/components/MenuBar";
import { SceneTree } from "./src/components/SceneTree";
import { MeasurePanel, ClipPanel, ExportPanel, ScreenshotPanel, ViewpointPanel, SunPanel, SettingsPanel } from "./src/components/ToolPanels";
import { LoadingOverlay } from "./src/components/LoadingOverlay";
import { PropertiesPanel } from "./src/components/PropertiesPanel";
import { ConfirmModal } from "./src/components/ConfirmModal";
import { AboutModal } from "./src/components/AboutModal";
import { ViewCube } from "./src/components/ViewCube";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { ContextMenu } from "./src/components/ContextMenu";
import { IconClose, IconSun, IconMoon, IconActivity, IconBox, IconGrid } from "./src/theme/Icons";
import { usePersistentState } from "./src/hooks/usePersistentState";
import { cleanLoadingStatus, createFileSetId, loadSceneItems } from "./src/viewer/fileLoading";

// --- 全局样式注入 ---

export interface ThreeViewerProps {
    allowDragOpen?: boolean;
    hiddenMenus?: string[];
    libPath?: string;
    defaultTheme?: 'dark' | 'light';
    defaultLang?: Lang;
    showStats?: boolean;
    showOutline?: boolean;
    showProperties?: boolean;
    initialSettings?: Partial<SceneSettings>;
    initialFiles?: (string | File) | (string | File)[];
    onSelect?: (uuid: string, object: any) => void;
    onLoad?: (manager: SceneManager) => void;
    hideDeleteModel?: boolean;
}



// --- 主应用 ---
export const ThreeViewer = ({ 
    allowDragOpen = true, 
    hiddenMenus = [],
    libPath = './libs',
    defaultTheme,
    defaultLang,
    showStats: propShowStats,
    showOutline: propShowOutline,
    showProperties: propShowProperties,
     initialSettings,
     initialFiles,
     onSelect: propOnSelect,
     onLoad,
     hideDeleteModel = false
 }: ThreeViewerProps) => {
    const sceneBgFollowsTheme = initialSettings?.bgColor === undefined;

    // 主题状态 - 从localStorage恢复或使用prop
    const [themeMode, setThemeMode] = usePersistentState<'dark' | 'light'>(
        '3dbrowser_themeMode',
        () => defaultTheme || 'light',
        {
            serializer: (value) => value,
            parser: (raw) => (raw === 'dark' || raw === 'light') ? raw : 'light'
        }
    );

    const theme = useMemo(() => {
        return themes[themeMode];
    }, [themeMode]);

    

    // 语言状态 - 从localStorage恢复
    const [lang, setLang] = usePersistentState<Lang>(
        '3dbrowser_lang',
        () => defaultLang || 'zh',
        {
            serializer: (value) => value,
            parser: (raw) => (raw === 'zh' || raw === 'en') ? raw : 'zh'
        }
    );

    // 监听外部语言切换
    useEffect(() => {
        if (defaultLang && defaultLang !== lang) {
            setLang(defaultLang);
        }
    }, [defaultLang, lang, setLang]);

    // 状态
    const [treeRoot, setTreeRoot] = useState<any[]>([]);
    const [selectedUuids, setSelectedUuids] = useState<string[]>([]);
    const selectedUuid = selectedUuids.length > 0 ? selectedUuids[selectedUuids.length - 1] : null;
    const [selectedProps, setSelectedProps] = useState<any>(null);
    const [status, setStatus] = useState(getTranslation(lang, 'ready'));
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [stats, setStats] = useState({
        meshes: 0,
        faces: 0,
        memory: 0,
        textureMemory: 0,
        drawCalls: 0,
        fps: 0,
        chunksLoaded: 0,
        chunksTotal: 0,
        chunksQueued: 0,
        pixelRatio: 1
    });
    const [chunkProgress, setChunkProgress] = useState({ loaded: 0, total: 0 });
    
    // 工具状态
    const [activeTool, setActiveTool] = useState<'none' | 'measure' | 'clip' | 'settings' | 'export' | 'screenshot' | 'viewpoint' | 'sun' | 'boxSelect'>('none');

    // Viewport coords
    const [mousePos, setMousePos] = useState<THREE.Vector3 | null>(null);
    // 显示模式：solid-着色, transparent-透明
    const [displayMode, setDisplayMode] = useState<'solid' | 'transparent'>('solid');
    
    // Viewpoint State
    const [viewpoints, setViewpoints] = useState<any[]>([]);
    const [currentFileSetId, setCurrentFileSetId] = useState<string>("");
    
    // Measure State
    const [measureType, setMeasureType] = useState<MeasureType>('none');
    // 存储历史记录: { id, type, val }
    const [measureHistory, setMeasureHistory] = useState<any[]>([]);
    const [highlightedMeasureId, setHighlightedMeasureId] = useState<string | null>(null);

    const [clipEnabled, setClipEnabled] = useState(false);
    const [clipValues, setClipValues] = useState({ x: [0, 100], y: [0, 100], z: [0, 100] });
    const [clipActive, setClipActive] = useState({ x: false, y: false, z: false });
    const [clipHelperVisible, setClipHelperVisible] = usePersistentState<boolean>(
        '3dbrowser_clipHelperVisible',
        initialSettings?.clip?.helperVisible ?? false,
        {
            serializer: (value) => String(value),
            parser: (raw) => raw === 'true'
        }
    );
    const [clipHelperOpacity, setClipHelperOpacity] = usePersistentState<number>(
        '3dbrowser_clipHelperOpacity',
        initialSettings?.clip?.helperOpacity ?? 0.12,
        {
            serializer: (value) => String(value),
            parser: (raw) => {
                const parsed = Number(raw);
                return Number.isFinite(parsed) ? parsed : 0.12;
            }
        }
    );

    // Toolbar State - 从localStorage恢复状态
    const [pickEnabled, setPickEnabled] = usePersistentState<boolean>('3dbrowser_pickEnabled', false, {
        serializer: (value) => String(value),
        parser: (raw) => raw === 'true'
    });
    const [showStats, setShowStats] = usePersistentState<boolean>('3dbrowser_showStats', propShowStats ?? true, {
        serializer: (value) => String(value),
        parser: (raw) => raw === 'true'
    });
    const [showOutline, setShowOutline] = usePersistentState<boolean>('3dbrowser_showOutline', propShowOutline ?? true, {
        serializer: (value) => String(value),
        parser: (raw) => raw === 'true'
    });
    const [showProps, setShowProps] = usePersistentState<boolean>('3dbrowser_showProps', propShowProperties ?? true, {
        serializer: (value) => String(value),
        parser: (raw) => raw === 'true'
    });

    // Settings State (mirrors SceneManager) - 从localStorage恢复
    const [sceneSettings, setSceneSettings] = usePersistentState<SceneSettings>('3dbrowser_sceneSettings', () => {
        const baseSettings: SceneSettings = {
            ambientInt: 2.0,
            dirInt: 1.0,
            bgColor: theme.canvasBg,
            viewCubeSize: 100,
            colorSpace: 'srgb',
            toneMapping: 'aces',
            exposure: 1,
            shadowQuality: 'medium',
            adaptiveQuality: true,
            minPixelRatio: 0.8,
            maxPixelRatio: 2,
            targetFps: 50,
            sunEnabled: false,
            sunLatitude: 0,
            sunLongitude: 0,
            sunTime: 12,
            sunShadow: false,
            clip: {
                helperVisible: initialSettings?.clip?.helperVisible ?? false,
                helperOpacity: initialSettings?.clip?.helperOpacity ?? 0.12,
            },
        };
        const merged = initialSettings ? { ...baseSettings, ...initialSettings } : baseSettings;
        return sceneBgFollowsTheme
            ? { ...merged, bgColor: theme.canvasBg }
            : merged;
    });

    useEffect(() => {
        if (propShowStats !== undefined) setShowStats(propShowStats);
    }, [propShowStats, setShowStats]);

    useEffect(() => {
        if (propShowOutline !== undefined) setShowOutline(propShowOutline);
    }, [propShowOutline, setShowOutline]);

    useEffect(() => {
        if (propShowProperties !== undefined) setShowProps(propShowProperties);
    }, [propShowProperties, setShowProps]);

    // Confirmation Modal State
    const [confirmState, setConfirmState] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        action: () => void;
    }>({ isOpen: false, title: "", message: "", action: () => {} });

    // About Modal State
    const [isAboutOpen, setIsAboutOpen] = useState(false);

    // Layout State (Resizable Panels)
    const [leftWidth, setLeftWidth] = useState(260);
    const [rightWidth, setRightWidth] = useState(300);
    const resizingLeft = useRef(false);
    const resizingRight = useRef(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const sceneMgr = useRef<SceneManager | null>(null);
    const [mgrInstance, setMgrInstance] = useState<SceneManager | null>(null);
    const pointerDownRef = useRef<{ x: number; y: number; moved: boolean; button: number } | null>(null);

    const handleThemeModeChange = useCallback((nextThemeMode: 'dark' | 'light') => {
        setThemeMode(nextThemeMode);
        const nextTheme = themes[nextThemeMode];

        setSceneSettings((prevSettings) => {
            const merged = sceneBgFollowsTheme
                ? { ...prevSettings, bgColor: nextTheme.canvasBg }
                : prevSettings;

            if (sceneMgr.current && sceneBgFollowsTheme) {
                sceneMgr.current.updateSettings(merged);
            }
            return merged;
        });
    }, [sceneBgFollowsTheme, setSceneSettings, setThemeMode]);

    useEffect(() => {
        if (defaultTheme && defaultTheme !== themeMode) {
            handleThemeModeChange(defaultTheme);
        }
    }, [defaultTheme, themeMode, handleThemeModeChange]);

    useEffect(() => {
        if (!sceneBgFollowsTheme) return;

        setSceneSettings((prevSettings) => {
            if (prevSettings.bgColor === theme.canvasBg) return prevSettings;
            const merged = { ...prevSettings, bgColor: theme.canvasBg };
            if (sceneMgr.current) {
                sceneMgr.current.updateSettings(merged);
            }
            return merged;
        });
    }, [sceneBgFollowsTheme, setSceneSettings, theme.canvasBg]);

    useEffect(() => {
        const normalizedOpacity = Math.min(0.35, Math.max(0.05, clipHelperOpacity));
        if (normalizedOpacity !== clipHelperOpacity) {
            setClipHelperOpacity(normalizedOpacity);
            return;
        }

        if (sceneMgr.current) {
            sceneMgr.current.setClipHelperOptions({
                visible: clipHelperVisible,
                opacity: normalizedOpacity
            });
        }
    }, [clipHelperVisible, clipHelperOpacity, setClipHelperOpacity]);
    
    // 是否加载了模型（基于treeRoot判断）
    const hasModels = treeRoot.length > 0;
    
    // 跟踪已完成首次加载的文件集,避免重复toast提示
    const completedFileSetsRef = useRef<Set<string>>(new Set());

    // Error State
    const [errorState, setErrorState] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        detail?: string;
    }>({ isOpen: false, title: "", message: "" });

    // Toast Message State
    const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);
    
    // 右键菜单状态
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        visible: boolean;
    }>({ x: 0, y: 0, visible: false });

    // 隐藏对象记录
    const [hiddenUuids, setHiddenUuids] = useState<Set<string>>(new Set());
    // 隔离对象记录
    const [isolatedUuids, setIsolatedUuids] = useState<Set<string>>(new Set());
    const [contextMenuOpacity, setContextMenuOpacity] = useState(1.0);
    
    // Visibility undo stack
    const visibilityStackRef = useRef<{uuid: string, visible: boolean}[][]>([]);
    
    // 隐藏选中的对象
    const handleHideSelected = useCallback(() => {
        if (selectedUuids.length === 0 || !sceneMgr.current) return;

        const stateToRestore = selectedUuids.map(uuid => {
            const obj = sceneMgr.current?.contentGroup.getObjectByProperty('uuid', uuid);
            return { uuid, visible: obj ? obj.visible : true };
        });
        visibilityStackRef.current.push(stateToRestore);

        const newHiddenUuids = new Set(hiddenUuids);
        const newIsolatedUuids = new Set(isolatedUuids);
        selectedUuids.forEach(uuid => {
            sceneMgr.current?.setObjectVisibility(uuid, false);
            newHiddenUuids.add(uuid);
            newIsolatedUuids.delete(uuid);
        });
        setHiddenUuids(newHiddenUuids);
        setIsolatedUuids(newIsolatedUuids);
        setSelectedUuids([]);
        setSelectedProps(null);
        sceneMgr.current?.highlightObjects([]);
        updateTree();
    }, [selectedUuids, hiddenUuids, isolatedUuids]);

    // 显示全部对象
    const handleShowAll = useCallback(() => {
        if (!sceneMgr.current) return;

        if (hiddenUuids.size > 0 || isolatedUuids.size > 0) {
            sceneMgr.current.setAllVisibility(true);
            setHiddenUuids(new Set());
            setIsolatedUuids(new Set());
            updateTree();
        }
    }, [hiddenUuids, isolatedUuids]);
    
    const t = useCallback((key: string) => getTranslation(lang, key), [lang]);

    // 全局错误捕获
    useEffect(() => {
        const handleError = (event: ErrorEvent) => {
            // Ignore empty errors or ResizeObserver loop limit errors
            const message = event.message || "";
            if (!message && !event.error) return;
            if (message.includes("ResizeObserver loop completed") || 
                message.includes("ResizeObserver loop limit") ||
                message.includes("texImage3D: FLIP_Y or PREMULTIPLY_ALPHA")) {
                return;
            }
            
            console.error("Global Error:", event.error || message);
            setErrorState({
                isOpen: true,
                title: t("failed"),
                message: message || "An unexpected error occurred",
                detail: event.error?.stack || ""
            });
        };
        const handleRejection = (event: PromiseRejectionEvent) => {
            if (!event.reason) return;
            
            const message = event.reason?.message || String(event.reason);
            if (message.includes("ResizeObserver loop completed") || 
                message.includes("ResizeObserver loop limit") ||
                message.includes("texImage3D: FLIP_Y or PREMULTIPLY_ALPHA")) {
                return;
            }

            console.error("Unhandled Rejection:", event.reason);
            setErrorState({
                isOpen: true,
                title: t("failed"),
                message: message || "A promise was rejected without reason",
                detail: event.reason?.stack || ""
            });
        };
        window.addEventListener('error', handleError);
        window.addEventListener('unhandledrejection', handleRejection);
        return () => {
            window.removeEventListener('error', handleError);
            window.removeEventListener('unhandledrejection', handleRejection);
        };
    }, [lang, t]);

    // Update status when lang changes if status is "Ready" (or equivalent)
    useEffect(() => {
        const prevLang = lang === 'zh' ? 'en' : 'zh';
        if (status === getTranslation(prevLang, 'ready')) {
            setStatus(getTranslation(lang, 'ready'));
        }
    }, [lang]);

    // --- 面板尺寸调整逻辑 ---
    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            if (resizingLeft.current) {
                setLeftWidth(Math.max(150, Math.min(500, e.clientX)));
            }
            if (resizingRight.current) {
                const newW = window.innerWidth - e.clientX;
                setRightWidth(Math.max(200, Math.min(600, newW)));
            }
        };
        const handleUp = () => {
            resizingLeft.current = false;
            resizingRight.current = false;
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, []);

    // --- 格式化辅助函数 ---
    const formatNumber = (num: number) => {
        if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    };

    const formatMemory = (mb: number) => {
        if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
        return mb.toFixed(1) + ' MB';
    };

    // --- 视点管理逻辑 ---
    useEffect(() => {
        if (!currentFileSetId) {
            setViewpoints([]);
            return;
        }
        try {
            const key = `viewpoints_${currentFileSetId}`;
            const saved = localStorage.getItem(key);
            if (saved) {
                setViewpoints(JSON.parse(saved));
            } else {
                setViewpoints([]);
            }
        } catch (e) {
            console.error("Failed to load viewpoints", e);
            setViewpoints([]);
        }
    }, [currentFileSetId]);

    const persistViewpoints = useCallback((nextViewpoints: any[]) => {
        if (!currentFileSetId) return;
        setViewpoints(nextViewpoints);
        try {
            localStorage.setItem(`viewpoints_${currentFileSetId}`, JSON.stringify(nextViewpoints));
        } catch (e) {
            console.error("Failed to persist viewpoints", e);
        }
    }, [currentFileSetId]);

    const captureViewThumbnail = useCallback(() => {
        if (!sceneMgr.current) return "";

        let image = "";
        try {
            sceneMgr.current.renderer.render(sceneMgr.current.scene, sceneMgr.current.camera);
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = 64;
            tempCanvas.height = 48;
            const ctx = tempCanvas.getContext("2d");
            if (ctx) {
                ctx.drawImage(sceneMgr.current.canvas, 0, 0, 64, 48);
                image = tempCanvas.toDataURL("image/jpeg", 0.7);
            }
        } catch (e) {
            console.error("Failed to capture thumbnail", e);
        }
        return image;
    }, []);

    const handleSaveViewpoint = useCallback((customName?: string, replaceId?: string) => {
        if (!sceneMgr.current || !currentFileSetId) {
            setToast({ message: t("no_models"), type: 'info' });
            return;
        }

        // 检查场景中是否有模型
        const hasModels = sceneMgr.current.contentGroup.children.length > 0;
        if (!hasModels) {
            setToast({ message: t("no_models"), type: 'info' });
            return;
        }

        const name = customName || `${t("viewpoint_title")} ${viewpoints.length + 1}`;
        const cameraState = sceneMgr.current.getCameraState();
        const image = captureViewThumbnail();

        const nextViewpoints = replaceId
            ? viewpoints.map((vp) => vp.id === replaceId ? { ...vp, name, cameraState, image } : vp)
            : [
                ...viewpoints,
                {
                    id: Date.now().toString(),
                    name,
                    cameraState,
                    image
                }
            ];

        persistViewpoints(nextViewpoints);
        setToast({ message: t("success"), type: 'success' });
    }, [captureViewThumbnail, currentFileSetId, persistViewpoints, t, viewpoints]);

    const handleUpdateViewpointName = useCallback((id: string, newName: string) => {
        const nextViewpoints = viewpoints.map(v => v.id === id ? { ...v, name: newName } : v);
        persistViewpoints(nextViewpoints);
    }, [persistViewpoints, viewpoints]);

    const handleLoadViewpoint = useCallback((vp: any) => {
        if (!sceneMgr.current || !vp.cameraState) return;
        sceneMgr.current.setCameraState(vp.cameraState);
        setToast({ message: `${t("viewpoint_loading")}: ${vp.name}`, type: 'info' });
    }, [t]);

    const handleOverwriteViewpoint = useCallback((id: string) => {
        const viewpoint = viewpoints.find((vp) => vp.id === id);
        if (!viewpoint) return;
        handleSaveViewpoint(viewpoint.name, id);
    }, [handleSaveViewpoint, viewpoints]);

    const handleDeleteViewpoint = useCallback((id: string) => {
        const viewpoint = viewpoints.find((vp) => vp.id === id);
        setConfirmState({
            isOpen: true,
            title: t("viewpoint_title"),
            message: `${t("confirm_delete")} "${viewpoint?.name || "Viewpoint"}"?`,
            action: () => {
                const nextViewpoints = viewpoints.filter(v => v.id !== id);
                persistViewpoints(nextViewpoints);
            }
        });
    }, [persistViewpoints, t, viewpoints]);

    // 1. 使用 ResizeObserver 处理容器尺寸变化
    useEffect(() => {
        if (!viewportRef.current || !mgrInstance) return;
        
        const observer = new ResizeObserver((entries) => {
             if (!entries || entries.length === 0) return;
             
             const { width, height } = entries[0].contentRect;
             if (width === 0 || height === 0) return;

             requestAnimationFrame(() => {
                if (mgrInstance) {
                    mgrInstance.resize(width, height);
                }
             });
        });
        
        observer.observe(viewportRef.current);

        // 额外的 window resize 监听作为兜底
        const handleWindowResize = () => {
            if (mgrInstance && viewportRef.current) {
                const rect = viewportRef.current.getBoundingClientRect();
                mgrInstance.resize(rect.width, rect.height);
            }
        };
        window.addEventListener('resize', handleWindowResize);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', handleWindowResize);
        };
    }, [mgrInstance]);

    // 2. 全局拖拽支持
    useEffect(() => {
        const handleDragOver = (e: DragEvent) => {
            if (!allowDragOpen) return;
            e.preventDefault();
            e.stopPropagation();
        };

        const handleDrop = async (e: DragEvent) => {
            if (!allowDragOpen) return;
            e.preventDefault();
            e.stopPropagation();
            
            if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                const files = Array.from(e.dataTransfer.files);
                // 检查格式支持
                const supportedExtensions = ['.lmb', '.glb', '.gltf', '.ifc', '.nbim', '.fbx', '.obj', '.stl', '.ply', '.3ds', '.dae', '.stp', '.step', '.igs', '.iges'];
                const unsupportedFiles = files.filter(f => {
                    const ext = '.' + f.name.split('.').pop()?.toLowerCase();
                    return !supportedExtensions.includes(ext);
                });

                if (unsupportedFiles.length > 0) {
                    setToast({ 
                        message: `${t("failed")}: 不支持的格式 - ${unsupportedFiles.map(f => f.name).join(', ')}`, 
                        type: 'error' 
                    });
                }

                const supportedFiles = files.filter(f => {
                    const ext = '.' + f.name.split('.').pop()?.toLowerCase();
                    return supportedExtensions.includes(ext);
                });

                if (supportedFiles.length > 0) {
                    // 调用加载逻辑
                    await processFiles(supportedFiles);
                }
            }
        };

        window.addEventListener('dragover', handleDragOver);
        window.addEventListener('drop', handleDrop);

        return () => {
            window.removeEventListener('dragover', handleDragOver);
            window.removeEventListener('drop', handleDrop);
        };
    }, [lang, allowDragOpen, t]);

    // 3. 当布局状态变化时强制触发一次 resize
    useEffect(() => {
        if (mgrInstance) {
            // Use requestAnimationFrame to ensure the DOM reflow has completed
            requestAnimationFrame(() => {
                mgrInstance.resize();
            });
        }
    }, [mgrInstance, showOutline, showProps, leftWidth, rightWidth]);

    // 树结构更新
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => {
                setToast(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const updateTree = useCallback(() => {
        if (!sceneMgr.current) return;
        
        const root = sceneMgr.current.structureRoot;
        if (!root) {
            setTreeRoot([]);
            return;
        }

        const expandedMap = new Map<string, boolean>();
        const collectExpanded = (nodes: any[]) => {
            const stack = (nodes || []).slice();
            while (stack.length) {
                const n = stack.pop();
                if (!n) continue;
                if (typeof n.uuid === 'string') expandedMap.set(n.uuid, !!n.expanded);
                if (Array.isArray(n.children) && n.children.length) {
                    for (const child of n.children) {
                        stack.push(child);
                    }
                }
            }
        };

        const convertNode = (node: any, depth = 0, isFileNode = false): any => {
            const stack: {node: any, depth: number, isFileNode: boolean}[] = [{node, depth, isFileNode}];
            const nodeMap = new Map<any, any>();
            const childrenMap = new Map<any, any[]>();
            const order: any[] = [];

            // 第一遍：收集所有节点
            while (stack.length) {
                const {node: curr, depth: currDepth, isFileNode: currIsFileNode} = stack.pop()!;
                if (nodeMap.has(curr)) continue; // 避免循环引用
                const uuid = curr.id;
                const converted = {
                    uuid,
                    name: curr.name,
                    type: curr.type === 'Mesh' ? 'MESH' : 'GROUP',
                    depth: currDepth,
                    children: [], // 暂空
                    expanded: expandedMap.get(uuid) ?? false,
                    visible: curr.visible !== false,
                    object: curr,
                    isFileNode: currIsFileNode
                };
                nodeMap.set(curr, converted);
                order.push(curr);
                const children = curr.children || [];
                childrenMap.set(curr, children);
                // 子节点压栈，深度加1，isFileNode 为 false
                for (let i = children.length - 1; i >= 0; i--) {
                    stack.push({node: children[i], depth: currDepth + 1, isFileNode: false});
                }
            }

            // 第二遍：构建 children 引用
            for (const curr of order) {
                const converted = nodeMap.get(curr);
                const children = childrenMap.get(curr) || [];
                converted.children = children.map(child => nodeMap.get(child)).filter(Boolean);
            }

            return nodeMap.get(node);
        };

        // 只显示 Root 的子节点，从而移除 Root 和 ImportedModels 这一层
        setTreeRoot(prev => {
            collectExpanded(prev);
            const roots: any[] = [];
            (root.children || []).forEach((c: any) => {
                if (c.name === "ImportedModels" || c.name === "Tilesets") {
                    (c.children || []).forEach((child: any) => {
                        roots.push(convertNode(child, 0, true));
                    });
                } else {
                    roots.push(convertNode(c, 0, true));
                }
            });
            return roots;
        });
    }, [])

    const setAllTreeExpanded = useCallback((expanded: boolean) => {
        const update = (nodes: any[]): any[] => {
            return nodes.map(n => ({
                ...n,
                expanded,
                children: n.children && n.children.length > 0 ? update(n.children) : n.children
            }));
        };
        setTreeRoot(prev => update(prev));
    }, []);

    const handleToggleVisibility = (uuid: string, visible: boolean) => {
        if (!sceneMgr.current) return;
        
        visibilityStackRef.current.push([{ uuid, visible: !visible }]);
        
        sceneMgr.current.setObjectVisibility(uuid, visible);

        if (visible) {
            const next = new Set(hiddenUuids);
            next.delete(uuid);
            setHiddenUuids(next);
        } else {
            const next = new Set(hiddenUuids);
            next.add(uuid);
            setHiddenUuids(next);
        }

        // 使用 updateTree 同步最新的结构树状态
        updateTree();
    };

    const handleHideObject = useCallback((uuid: string) => {
        if (!sceneMgr.current) return;
        visibilityStackRef.current.push([{ uuid, visible: true }]);
        sceneMgr.current.setObjectVisibility(uuid, false);
        setHiddenUuids((prev) => new Set(prev).add(uuid));
        setSelectedUuids((prev) => prev.filter((id) => id !== uuid));
        updateTree();
    }, [updateTree]);

    const handleIsolateObject = useCallback((uuid: string) => {
        if (!sceneMgr.current) return;
        sceneMgr.current.isolateObjects([uuid]);
        setHiddenUuids(new Set());
        setIsolatedUuids(new Set([uuid]));
        setSelectedUuids([uuid]);
        sceneMgr.current.highlightObjects([uuid]);
        updateTree();
    }, [updateTree]);

    const handleUndoVisibility = useCallback(() => {
        if (visibilityStackRef.current.length === 0 || !sceneMgr.current) return;
        const lastAction = visibilityStackRef.current.pop();
        if (!lastAction) return;
        
        const nextHidden = new Set(hiddenUuids);
        lastAction.forEach(change => {
            sceneMgr.current?.setObjectVisibility(change.uuid, change.visible);
            if (change.visible) nextHidden.delete(change.uuid);
            else nextHidden.add(change.uuid);
        });
        setHiddenUuids(nextHidden);
        updateTree();
    }, [hiddenUuids]);

    const handleDeleteObject = (uuid: string) => {
        if (!sceneMgr.current) return;
        
        const obj = sceneMgr.current.contentGroup.getObjectByProperty("uuid", uuid);
        const nodes = sceneMgr.current.getStructureNodes(uuid);

        if (obj || nodes) {
            const name = (obj as any)?.name || nodes?.[0]?.name || "Item";
            
            setConfirmState({
                isOpen: true,
                title: t("delete_item"),
                message: `${t("confirm_delete")} "${name}"?`,
                action: async () => {
                    setLoading(true);
                    setStatus(t("delete_item") + "...");
                    
                    try {
                        // 使用 SceneManager 的 removeModel 进行清理
                        await sceneMgr.current?.removeModel(uuid);

                        // If selected, deselect
                        setSelectedUuids(prev => {
                            const next = prev.filter(id => id !== uuid);
                            sceneMgr.current?.highlightObjects(next);
                            if (next.length === 0) setSelectedProps(null);
                            return next;
                        });

                        // Refresh tree
                        updateTree();
                        setStatus(t("ready"));
                        // Add success notification
                        setToast({ message: t("success"), type: 'success' });
                    } catch (error) {
                        console.error("删除对象失败:", error);
                        setToast({ message: t("failed") + ": " + (error instanceof Error ? error.message : String(error)), type: 'error' });
                    } finally {
                        setLoading(false);
                    }
                }
            });
        }
    };

    const handleFocusObject = (obj: any) => {
        if (!sceneMgr.current || !obj) return;
        const uuid = obj.uuid || obj.id;
        if (!uuid) return;
        sceneMgr.current.fitViewToObject(uuid);
        void handleSelect(obj);
    };

    const handleClearSelection = () => {
        setSelectedUuids([]);
        sceneMgr.current?.highlightObjects([]);
    };

    // --- Scene Initialization ---
    useEffect(() => {
        if (!canvasRef.current) return;
        
        const manager = new SceneManager(canvasRef.current);
        sceneMgr.current = manager;
        setMgrInstance(manager);
        
        if (onLoad) onLoad(manager);

        // Initial setup
        manager.updateSettings(sceneSettings);
        manager.setClipHelperOptions({
            visible: clipHelperVisible,
            opacity: clipHelperOpacity
        });
        requestAnimationFrame(() => {
            manager.resize();
        });

        // 监听分块加载进度
        let clearProgressTimer: any = null;

        manager.onChunkProgress = (loaded, total) => {
            setChunkProgress({ loaded, total });
            
            if (loaded === total && total > 0 && currentFileSetId) {
                // 只在首次完成加载时显示toast
                if (!completedFileSetsRef.current.has(currentFileSetId)) {
                    setToast({ message: t("all_chunks_loaded"), type: 'success' });
                    completedFileSetsRef.current.add(currentFileSetId);
                    
                    // 加载完成后，立即清空进度信息，不再显示3秒
                    setChunkProgress({ loaded: 0, total: 0 });
                }
            } else {
                if (clearProgressTimer) {
                    clearTimeout(clearProgressTimer);
                    clearProgressTimer = null;
                }
            }
        };

        manager.onMeasureUpdate = (records) => {
            setMeasureHistory(records.map(r => ({ id: r.id, type: r.type, val: r.val })));
        };

        manager.onStructureUpdate = () => {
            updateTree();
        };

        // 监听瓦片更新（防抖刷新树）
        let debounceTimer: any;
        manager.onTilesUpdate = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                 updateTree();
            }, 500);
        };

        return () => {
            if (clearProgressTimer) clearTimeout(clearProgressTimer);
            manager.dispose();
        };
    }, []); 

    useEffect(() => {
        if (!mgrInstance || !showStats) return;

        const updateStats = () => {
            if (document.visibilityState !== 'visible') return;
            setStats(mgrInstance.getStats());
        };

        updateStats();
        const statsInterval = window.setInterval(updateStats, 1000);
        document.addEventListener('visibilitychange', updateStats);

        return () => {
            window.clearInterval(statsInterval);
            document.removeEventListener('visibilitychange', updateStats);
        };
    }, [mgrInstance, showStats]);

    // --- Effect for Initial Files ---
    useEffect(() => {
        if (!mgrInstance || !initialFiles) return;

        const loadInitial = async () => {
            const itemsToProcess: (File | string)[] = Array.isArray(initialFiles) ? initialFiles : [initialFiles];
            console.log("[ThreeViewer] loadInitial with items:", itemsToProcess);
            
            // 分离 3D Tiles 和其他模型
            const modelItems: (File | string)[] = [];
            
            for (const item of itemsToProcess) {
                if (typeof item === 'string') {
                    const urlPath = item.split('?')[0].split('#')[0];
                    if (urlPath.toLowerCase().endsWith('.json') || urlPath.includes('tileset')) {
                        console.log("[ThreeViewer] Initial URL detected as 3D Tiles:", item);
                        mgrInstance.addTileset(item, (p, msg) => {
                            setProgress(p);
                            if(msg) setStatus(cleanLoadingStatus(msg));
                        });
                        updateTree();
                        setStatus(t("tileset_loaded"));
                        setTimeout(() => mgrInstance?.fitView(true), 500);
                    } else {
                        modelItems.push(item);
                    }
                } else {
                    modelItems.push(item);
                }
            }

            if (modelItems.length > 0) {
                await processFiles(modelItems);
            }
        };

        loadInitial();
    }, [mgrInstance, initialFiles]);

    // --- 逻辑事件挂钩 ---

    useEffect(() => {
        const mgr = sceneMgr.current;
        if (!mgr) return;
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        const clickMoveThreshold = 6;

        const handleMouseDown = (e: MouseEvent) => {
            pointerDownRef.current = {
                x: e.clientX,
                y: e.clientY,
                moved: false,
                button: e.button
            };
        };

        const handleClick = (e: MouseEvent) => {
            const pointerState = pointerDownRef.current;
            if (!pointerState || pointerState.button !== 0 || pointerState.moved) {
                pointerDownRef.current = null;
                return;
            }
            pointerDownRef.current = null;

            // 框选模式下不处理 click（由 pointer 事件处理）
            if (activeTool === 'boxSelect') return;

            // 测量点击
            if (activeTool === 'measure') {
                if (measureType !== 'none') {
                    // 如果选择了测量类型，优先进行测量点拾取
                    const intersect = mgr.getRayIntersects(e.clientX, e.clientY);
                    if (intersect) {
                        // 体积测量：记录模型 UUID
                        const modelUuid = (intersect.object as any).uuid;
                        const record = mgr.addMeasurePoint(intersect.point, modelUuid);
                        return; // 已经处理了测量点，不再尝试选中旧测量线
                    }
                }

                // 只有在没点中模型点，或者没选择测量类型时，才尝试选中已有的测量线进行高亮或操作
                const mId = mgr.pickMeasurement(e.clientX, e.clientY);
                if (mId) {
                    setHighlightedMeasureId(mId);
                    mgr.highlightMeasurement(mId);
                    return;
                }

                // 如果什么都没点中，清除高亮
                setHighlightedMeasureId(null);
                mgr.highlightMeasurement(null);
                return;
            }
            if(pickEnabled) {
                const result = mgr.pick(e.clientX, e.clientY);
                handleSelect(result ? result.object : null, result ? result.intersect : null, e.ctrlKey);
            }
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (pointerDownRef.current && !pointerDownRef.current.moved) {
                const dx = e.clientX - pointerDownRef.current.x;
                const dy = e.clientY - pointerDownRef.current.y;
                if ((dx * dx + dy * dy) > (clickMoveThreshold * clickMoveThreshold)) {
                    pointerDownRef.current.moved = true;
                }
            }
            if (activeTool === 'measure') {
                mgr.updateMeasureHover(e.clientX, e.clientY);
                setMousePos(null);
                return;
            }
            const intersect = mgr.getRayIntersects(e.clientX, e.clientY);
            if (intersect) {
                setMousePos(intersect.point);
            } else {
                setMousePos(null);
            }
        };

        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            
            let initialOpacity = 1.0;
            if (selectedUuids.length > 0 && mgr) {
                const obj = mgr.contentGroup.getObjectByProperty('uuid', selectedUuids[0]);
                if (obj) {
                    let found = false;
                    obj.traverse((child: any) => {
                        if (!found && child.isMesh && child.material) {
                            const m = Array.isArray(child.material) ? child.material[0] : child.material;
                            if (m.opacity !== undefined) {
                                initialOpacity = m.opacity;
                                found = true;
                            }
                        }
                    });
                }
            }
            setContextMenuOpacity(initialOpacity);
            
            // 显示右键菜单
            setContextMenu({
                x: e.clientX,
                y: e.clientY,
                visible: true
            });
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
                handleUndoVisibility();
                return;
            }
            if (e.key === 'Escape') {
                if (activeTool === 'measure' && measureType !== 'none') {
                    setMeasureType('none');
                    mgr.startMeasurement('none');
                }
                if (activeTool === 'boxSelect') {
                    mgr.cancelBoxSelect();
                    setActiveTool('none');
                }
                setSelectedUuids([]);
                setSelectedProps(null);
                mgr.highlightObjects([]);
            }
        };

        canvas.addEventListener("mousedown", handleMouseDown);
        canvas.addEventListener("click", handleClick);
        canvas.addEventListener("mousemove", handleMouseMove);
        canvas.addEventListener("contextmenu", handleContextMenu);
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            canvas.removeEventListener("mousedown", handleMouseDown);
            canvas.removeEventListener("click", handleClick);
            canvas.removeEventListener("mousemove", handleMouseMove);
            canvas.removeEventListener("contextmenu", handleContextMenu);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [pickEnabled, selectedUuids, activeTool, measureType]);

    // 框选事件处理
    useEffect(() => {
        const mgr = sceneMgr.current;
        if (!mgr || activeTool !== 'boxSelect') return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // 进入框选模式：禁用左键旋转
        mgr.controls.mouseButtons.LEFT = undefined as any;

        const onPointerDown = (e: PointerEvent) => {
            if (e.button !== 0) return; // 仅左键
            mgr.startBoxSelect(e.clientX, e.clientY);
        };

        const onPointerMove = (e: PointerEvent) => {
            mgr.updateBoxSelect(e.clientX, e.clientY);
        };

        const onPointerUp = (e: PointerEvent) => {
            if (e.button !== 0) return;
            const uuids = mgr.endBoxSelect();
            if (uuids.length > 0) {
                const nextUuids = e.shiftKey
                    ? [...new Set([...selectedUuids, ...uuids])]
                    : uuids;
                setSelectedUuids(nextUuids);
                mgr.highlightObjects(nextUuids);
            }
        };

        canvas.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);

        return () => {
            canvas.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            // 恢复左键旋转
            if (mgr.controls) {
                mgr.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
            }
            mgr.cancelBoxSelect();
        };
    }, [activeTool]);

    // 工具状态同步
    useEffect(() => {
        const mgr = sceneMgr.current;
        if (!mgr) return;

        // 清理非当前工具的状态
        if (activeTool !== 'measure') {
            mgr.clearMeasurementPreview();
            mgr.highlightMeasurement(null);
            setHighlightedMeasureId(null);
            setMeasureType('none');
        }

        if (activeTool !== 'clip') {
            mgr.setClippingEnabled(false);
            setClipEnabled(false);
        }
    }, [activeTool]);

    // 设置同步
    const handleSettingsUpdate = (newSettings: Partial<SceneSettings>) => {
        const merged = {
            ...sceneSettings,
            ...newSettings,
            ...(sceneBgFollowsTheme && newSettings.bgColor === undefined ? { bgColor: theme.canvasBg } : {})
        };
        setSceneSettings(merged);
        if (sceneMgr.current) {
            sceneMgr.current.updateSettings(merged);
        }
    };


    // 剖切参数更新
    useEffect(() => {
        if (activeTool === 'clip' && sceneMgr.current) {
            sceneMgr.current.setClippingEnabled(clipEnabled);
            if (clipEnabled) {
                // 使用当前场景中可见物体的包围盒，这样剖切范围会随着场景内容自动调整
                // 如果没有可见物体，则回退到完整包围盒
                let box = sceneMgr.current.computeTotalBounds(true);
                if (box.isEmpty()) {
                    box = sceneMgr.current.computeTotalBounds(false);
                }
                
                if (!box.isEmpty()) {
                    sceneMgr.current.updateClippingPlanes(box, clipValues, clipActive);
                }
            }
        }
    }, [clipEnabled, clipValues, clipActive, activeTool]);

    // 测量类型同步
    useEffect(() => {
        if (sceneMgr.current) {
            sceneMgr.current.startMeasurement(measureType);
        }
    }, [measureType]);


    // --- 处理函数 ---

    const handleSelect = async (obj: any, _intersect?: THREE.Intersection | null, isMultiSelect: boolean = false) => {
        if (!sceneMgr.current) return;
        
        if (!obj) {
            setSelectedUuids([]);
            setSelectedProps(null);
            sceneMgr.current.highlightObjects([]);
            return;
        }

        // 统一处理 UUID (兼容 Object3D 和 StructureTreeNode)
        const uuid = obj.uuid || obj.id;
        if (!uuid) return;

        const nextUuids = isMultiSelect
            ? (selectedUuids.includes(uuid) ? selectedUuids.filter(id => id !== uuid) : [...selectedUuids, uuid])
            : [uuid];
        setSelectedUuids(nextUuids);
        sceneMgr.current.highlightObjects(nextUuids);
        
        const focusUuid = nextUuids.length > 0 ? nextUuids[nextUuids.length - 1] : null;
        if (!focusUuid) {
            setSelectedProps(null);
            return;
        }
        
        if (propOnSelect) propOnSelect(focusUuid, obj);
        
        // 尝试获取真实的 Object3D 以获得更多几何信息
        let realObj = focusUuid === uuid && obj instanceof THREE.Object3D
            ? obj
            : sceneMgr.current.contentGroup.getObjectByProperty("uuid", focusUuid);
        if (!realObj) {
            const nodes = sceneMgr.current.getStructureNodes(focusUuid);
            if (nodes && nodes.length > 0) realObj = nodes[0] as any;
        }
        
        // 如果还是没找到，可能是优化后的对象，尝试从 SceneManager 获取
        if (!realObj && sceneMgr.current) {
            // 如果是 NBIM 模式，可能只能得到一个代理对象
            // 我们在 getRayIntersects 中已经处理了代理对象的创建
        }

        const target = realObj || obj; // 优先使用真实对象，否则使用传入的对象（可能是 StructureTreeNode）

        const basicProps: any = {};
        const geoProps: any = {};
        const ifcProps: any = {};

        basicProps[t("prop_name")] = target.name || "Unnamed";
        basicProps[t("prop_type")] = target.type || (target.children ? "Group" : "Mesh");
        basicProps[t("prop_id")] = focusUuid; 
        
        if (target.getWorldPosition) {
            const worldPos = new THREE.Vector3();
            target.getWorldPosition(worldPos);
            geoProps[t("prop_pos")] = `${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)}`;
        }
        
        if (target.isMesh || target.type === 'Mesh') {
             // 几何信息
             if (target instanceof THREE.Mesh) {
                const box = new THREE.Box3().setFromObject(target);
                const size = new THREE.Vector3();
                box.getSize(size);
                geoProps[t("prop_dim")] = `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;
                
                if (target.geometry) {
                    geoProps[t("prop_vert")] = (target.geometry.attributes.position?.count || 0).toLocaleString();
                    if(target.geometry.index) {
                        geoProps[t("prop_tri")] = (target.geometry.index.count / 3).toLocaleString();
                    } else {
                        geoProps[t("prop_tri")] = ((target.geometry.attributes.position?.count || 0) / 3).toLocaleString();
                    }
                }
             } else if (target.userData?.boundingBox) {
                const size = new THREE.Vector3();
                target.userData.boundingBox.getSize(size);
                geoProps[t("prop_dim")] = `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;
             }
             
             if (target.isInstancedMesh) {
                 geoProps[t("prop_inst")] = target.count.toLocaleString();
             }

            // --- 面积和体积计算 ---            
            const geometryData = sceneMgr.current.getObjectGeometryData(focusUuid);
            if (geometryData.area > 0) {
                geoProps[t("prop_area")] = geometryData.area.toFixed(3);
            }
            if (geometryData.volume > 0) {
                geoProps[t("prop_volume")] = geometryData.volume.toFixed(3);
            }

            // --- IFC 属性获取逻辑 ---
            // 检查 userData 或 parent.userData
            const userData = target.userData || {};
            const parentUserData = target.parent?.userData || {};

            if (userData.isIFC || parentUserData.isIFC) {
                const ifcTarget = userData.isIFC ? target : target.parent;
                if (ifcTarget && ifcTarget.userData.ifcAPI && ifcTarget.userData.modelID !== undefined) {
                    const expressID = userData.expressID;
                    if (expressID) {
                        try {
                            const ifcMgr = ifcTarget.userData.ifcManager;
                            const flatProps = await ifcMgr.getItemProperties(ifcTarget.userData.modelID, expressID);
                            if (flatProps) {
                                Object.assign(ifcProps, flatProps);
                            }
                        } catch(e) { console.error("IFC Props Error", e); }
                    }
                }
            }
        } else if (target.userData?.boundingBox) {
             const size = new THREE.Vector3();
             target.userData.boundingBox.getSize(size);
             geoProps[t("prop_dim")] = `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;
        }

        // 属性分组
        const finalProps: any = {
            [t("pg_basic")]: basicProps,
            [t("pg_geo")]: geoProps
        };

        if (Object.keys(ifcProps).length > 0) {
            finalProps["IFC Properties"] = ifcProps;
        }

        const nbimProps = sceneMgr.current.getNbimProperties(focusUuid);
        if (nbimProps) {
            finalProps["BIM 属性"] = nbimProps;
        }

        setSelectedProps(finalProps);
    };

    const processFiles = async (items: (File | string)[]) => {
        if (!items.length || !sceneMgr.current) return;
        
        // Update current file set ID
        const setId = createFileSetId(items);
        setCurrentFileSetId(setId);
        
        console.log("[ThreeViewer] processFiles called with", items.length, "items");
        (sceneMgr.current as any).setChunkLoadingEnabled?.(true);
        (sceneMgr.current as any).setContentVisible?.(true);
        setLoading(true);
        setStatus(t("loading"));
        setProgress(0);
        
        try {
            await loadItemsIntoScene(items);
            
            updateTree();
            setStatus(t("success"));
            console.log("[ThreeViewer] processFiles completed successfully");
            sceneMgr.current?.fitView(true);
        } catch (err) {
            console.error("[ThreeViewer] processFiles error:", err); 
            setStatus(t("failed")); 
            setToast({ message: `${t("failed")}: ${(err as Error).message}`, type: 'error' });
        } finally { 
            setLoading(false); 
        }
    };

    const loadItemsIntoScene = async (items: (File | string)[]) => {
        if (!items.length || !sceneMgr.current) return;

        await loadSceneItems({
            items,
            manager: sceneMgr.current,
            sceneSettings,
            libPath,
            t,
            onProgress: (p, msg) => {
                setProgress(p);
                if (msg) setStatus(cleanLoadingStatus(msg));
            }
        });
    };

    const handleOpenFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        await processFiles(Array.from(e.target.files) as File[]);
        e.target.value = ""; 
    };

    const handleBatchConvert = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length || !sceneMgr.current) return;
        const files = Array.from(e.target.files) as File[];
        e.target.value = "";

        const invalid = files.filter(f => f.name.toLowerCase().endsWith('.nbim'));
        if (invalid.length > 0) {
            setToast({ message: t("unsupported_format"), type: 'info' });
            return;
        }

        (sceneMgr.current as any).setChunkLoadingEnabled?.(false);
        (sceneMgr.current as any).setContentVisible?.(false);

        setLoading(true);
        setStatus(t("processing") + "...");
        setProgress(0);
        setActiveTool('none');

        try {
            await sceneMgr.current.clear();
            setSelectedUuids([]);
            setSelectedProps(null);
            setMeasureHistory([]);
            updateTree();

            await loadItemsIntoScene(files);
            updateTree();

            setStatus(t("processing") + "...");
            await sceneMgr.current.exportNbim();
            setStatus(t("success"));
            setToast({ message: t("success"), type: 'success' });
        } catch (err) {
            console.error("[ThreeViewer] handleBatchConvert error:", err);
            setStatus(t("failed"));
            setToast({ message: `${t("failed")}: ${(err as Error).message}`, type: 'error' });
        } finally {
            try {
                await sceneMgr.current?.clear();
                updateTree();
            } catch {}
            (sceneMgr.current as any).setChunkLoadingEnabled?.(true);
            (sceneMgr.current as any).setContentVisible?.(true);
            setLoading(false);
        }
    };

    const handleOpenUrl = async () => {
        const url = window.prompt(t("menu_open_url"), "http://");
        if (!url || !url.startsWith("http")) return;
        
        console.log("[ThreeViewer] handleOpenUrl called with:", url);
        setLoading(true);
        setStatus(t("processing") + "...");
        try {
            const urlPath = url.split('?')[0].split('#')[0];
            console.log("[ThreeViewer] Parsed path:", urlPath);
            if (urlPath.toLowerCase().endsWith('.json') || urlPath.includes('tileset')) {
                console.log("[ThreeViewer] Detected as 3D Tiles");
                // Assume 3D Tiles
                if (sceneMgr.current) {
                    sceneMgr.current.addTileset(url, (p, msg) => {
                        setProgress(p);
                        if(msg) setStatus(cleanLoadingStatus(msg));
                    });
                    updateTree();
                    setStatus(t("tileset_loaded"));
                    sceneMgr.current?.fitView(true);
                }
            } else {
                // 直接传递 URL 到 processFiles，让其内部处理或传递给加载器
                await processFiles([url]);
            }
        } catch (err) {
            console.error("[ThreeViewer] handleOpenUrl error:", err);
            setStatus(t("failed"));
            setToast({ message: `${t("failed")}: ${(err as Error).message}`, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const files = Array.from(e.dataTransfer.files) as File[];
            const supportedExtensions = ['.lmb', '.glb', '.gltf', '.ifc', '.nbim', '.fbx', '.obj', '.stl', '.ply', '.3mf', '.stp', '.step', '.igs', '.iges'];
            
            const validFiles = files.filter((file: File) => {
                const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
                return supportedExtensions.includes(ext);
            });

            if (validFiles.length < files.length) {
                setToast({ message: t("unsupported_format"), type: 'info' });
            }

            if (validFiles.length > 0) {
                await processFiles(validFiles);
            }
        }
    };

    const handleOpenFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length || !sceneMgr.current) return;
        setLoading(true);
        setProgress(0);
        try {
            const url = await parseTilesetFromFolder(
                e.target.files, 
                (p, msg) => {
                    setProgress(p);
                    if(msg) setStatus(cleanLoadingStatus(msg));
                }, 
                t
            );
            if (url) {
                sceneMgr.current.addTileset(url, (p, msg) => {
                    setProgress(p);
                    if(msg) setStatus(cleanLoadingStatus(msg));
                });
                updateTree(); // Tileset root added to tree
                setStatus(t("tileset_loaded"));
                sceneMgr.current?.fitView(true);
            }
        } catch (err) { console.error(err); setStatus(t("failed") + ": " + (err as Error).message); } 
        finally { setLoading(false); }
    };

    // New unified Export Handler
    const handleExport = async (format: string) => {
        if (!sceneMgr.current) return;
        
        const content = sceneMgr.current.contentGroup;
        
        // NBIM 导出直接由 SceneManager 处理
        if (format === 'nbim') {
            if (content.children.length === 0) { 
                setToast({ message: t("no_models"), type: 'info' });
                return; 
            }
            setLoading(true);
            setStatus(t("processing") + "...");
            setActiveTool('none');
            setTimeout(async () => {
                try {
                    await sceneMgr.current?.exportNbim();
                    setToast({ message: t("success"), type: 'success' });
                } catch (e) {
                    console.error(e);
                    setToast({ message: t("failed") + ": " + (e as Error).message, type: 'error' });
                } finally {
                    setLoading(false);
                }
            }, 100);
            return;
        }

        // 收集所有原始模型进行导出（非优化组）
        const modelsToExport = content.children.filter((c: THREE.Object3D) => !c.userData.isOptimizedGroup && c.name !== "TilesRenderer");
        if (modelsToExport.length === 0) { 
            setToast({ message: t("no_models"), type: 'info' });
            return; 
        }

        // 创建一个临时组用于导出，包含所有要导出的模型
        const exportGroup = new THREE.Group();
        modelsToExport.forEach((m: THREE.Object3D) => exportGroup.add(m.clone()));
        
        setLoading(true);
        setProgress(0);
        setStatus(t("processing") + "...");
        setActiveTool('none'); // Close panel

        setTimeout(async () => {
            try {
                let blob: Blob | null = null;
                let filename = `export.${format}`;

                if (format === '3dtiles') {
                    // 强制选择输出目录并直接写入
                    // @ts-ignore
                    if (!window.showDirectoryPicker) {
                        setToast({ message: t("select_output"), type: 'info' });
                        throw new Error("Browser does not support directory picker");
                    }
                    // @ts-ignore
                    const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
                    const filesMap = await convertLMBTo3DTiles(exportGroup, (msg) => {
                        if (msg.includes('%')) {
                            const p = parseInt(msg.match(/(\d+)%/)?.[1] || "0");
                            setProgress(p);
                        }
                        setStatus(cleanLoadingStatus(msg));
                    });
                setStatus(t("writing"));
                    let writeCount = 0;
                    for (const [name, b] of filesMap) {
                        // @ts-ignore
                        const fileHandle = await dirHandle.getFileHandle(name, { create: true });
                        // @ts-ignore
                        const writable = await fileHandle.createWritable();
                        await writable.write(b);
                        await writable.close();
                        writeCount++;
                        if (writeCount % 5 === 0) setProgress(Math.floor((writeCount / filesMap.size) * 100));
                    }
                    setToast({ message: t("success"), type: 'success' });
                    return;
                } else if (format === 'glb') {
                    blob = await exportGLB(exportGroup);
                } else if (format === 'lmb') {
                    blob = await exportLMB(exportGroup, (msg) => setStatus(cleanLoadingStatus(msg)));
                }

                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = filename;
                    a.click();
                    URL.revokeObjectURL(url);
                    setToast({ message: t("success"), type: 'success' });
                }
            } catch(e) {
                console.error(e); 
                setToast({ message: t("failed") + ": " + (e as Error).message, type: 'error' });
            } finally {
                setLoading(false);
                setProgress(0);
            }
        }, 100);
    };

    const handleView = (v: any) => { sceneMgr.current?.setView(v); };
    
    const handleClear = async () => {
        if (!sceneMgr.current) return;
        
        setConfirmState({
            isOpen: true,
            title: t("op_clear"),
            message: t("confirm_clear"),
            action: async () => {
                setLoading(true);
                setProgress(0);
                setStatus(t("op_clear") + "...");
                
                try {
                    await sceneMgr.current?.clear();
                    setSelectedUuids([]);
                    setSelectedProps(null);
                    setMeasureHistory([]);
                    setChunkProgress({ loaded: 0, total: 0 }); // 重置分片进度
                    completedFileSetsRef.current.clear(); // 清除已完成的文件集记录
                    updateTree();
                    setStatus(t("ready"));
                } catch (error) {
                    console.error("清空场景失败:", error);
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    const handleScreenshot = (mode: 'scene' | 'transparent' = 'scene') => {
        if (!sceneMgr.current) return;
        try {
            const renderer = sceneMgr.current.renderer;
            const scene = sceneMgr.current.scene;
            const previousBackground = scene.background;

            if (mode === 'transparent') {
                scene.background = null;
                renderer.setClearAlpha(0);
            } else {
                renderer.setClearAlpha(1);
            }

            renderer.render(scene, sceneMgr.current.camera);
            const dataUrl = sceneMgr.current.canvas.toDataURL("image/png");
            const a = document.createElement("a");
            a.href = dataUrl;
            a.download = mode === 'transparent' ? "screenshot-transparent.png" : "screenshot.png";
            a.click();

            scene.background = previousBackground;
            renderer.setClearAlpha(1);
            renderer.render(scene, sceneMgr.current.camera);
            setToast({ message: t("success"), type: 'success' });
        } catch (e) {
            console.error(e);
            setToast({ message: t("failed"), type: 'error' });
        }
    };

    const handleDisplayModeChange = (mode: 'solid' | 'transparent') => {
        if (!sceneMgr.current) return;
        setDisplayMode(mode);
        sceneMgr.current.contentGroup.traverse((child: any) => {
            if (child.isMesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((m: any) => {
                    if (mode === 'transparent') {
                        m.wireframe = false;
                        m.transparent = true;
                        m.opacity = 0.5;
                    } else {
                        m.wireframe = false;
                        m.transparent = false;
                        m.opacity = 1;
                    }
                });
            }
        });
    };

    return (
        <ErrorBoundary t={t} theme={theme}>
            <div
                className={`ui-container ${themeMode} font-${sceneSettings.fontSize || 'medium'}`}
                style={{
                    display: "flex", flexDirection: "column", height: "100%", width: "100%", 
                    backgroundColor: "var(--bg-primary)", color: "var(--text-primary)", 
                    fontSize: "var(--font-size-base)", fontFamily: "inherit", 
                    userSelect: "none", overflow: "hidden", position: "relative"
                }}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
             

             {/* Top Toolbar */}
             <Toolbar
                 t={t}
                 themeType={themeMode}
                 setThemeType={setThemeMode}
                 handleOpenFiles={handleOpenFiles}
                 handleBatchConvert={handleBatchConvert}
                 handleOpenFolder={handleOpenFolder}
                 handleOpenUrl={handleOpenUrl}
                 handleView={handleView}
                 handleClear={handleClear}
                 openScreenshotPanel={() => setActiveTool('screenshot')}
                 handleDisplayModeChange={handleDisplayModeChange}
                 displayMode={displayMode}
                 pickEnabled={pickEnabled}
                 setPickEnabled={setPickEnabled}
                 activeTool={activeTool}
                 setActiveTool={setActiveTool}
                 showOutline={showOutline}
                 setShowOutline={setShowOutline}
                 showProps={showProps}
                 setShowProps={setShowProps}
                 showStats={showStats}
                 setShowStats={setShowStats}
                 sceneMgr={sceneMgr.current}
                 theme={theme}
                 hiddenMenus={hiddenMenus}
                 onOpenAbout={() => setIsAboutOpen(true)}
                 hasModels={hasModels}
             />

             {/* Main Content Area */}
             <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
                
                 {/* Left Sidebar: Outline */}
                {showOutline && (
                    <div className="ui-sidebar" style={{ 
                        width: `${leftWidth}px`, 
                        borderRight: '1px solid var(--border-color)',
                    }}>
                        <div className="ui-sidebar-header">
                            <span>{t("interface_outline")}</span>
                            <button 
                                className="ui-sidebar-close"
                                onClick={() => setShowOutline(false)} 
                            >
                                <IconClose width={16} height={16} />
                            </button>
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <SceneTree
                                t={t}
                                treeRoot={treeRoot}
                                setTreeRoot={setTreeRoot}
                                selectedUuid={selectedUuid}
                                onSelect={(_uuid, obj) => handleSelect(obj)}
                                onToggleVisibility={handleToggleVisibility}
                                onDelete={(obj) => {
                                    const uuid = obj?.uuid || obj?.id;
                                    if (uuid) handleDeleteObject(uuid);
                                }}
                                onFocus={(obj) => handleFocusObject(obj)}
                                onHide={handleHideObject}
                                onIsolate={handleIsolateObject}
                                onShowAll={handleShowAll}
                            />
                        </div>
                        {/* Resize handle */}
                        <div 
                            className="ui-sidebar-resize"
                            style={{ right: -2 }}
                            onMouseDown={() => resizingLeft.current = true}
                        />
                    </div>
                )}

                {/* Center Viewport */}
                <div ref={viewportRef} style={{ 
                    flex: 1, 
                    position: 'relative', 
                    backgroundColor: theme.canvasBg,
                    overflow: 'hidden'
                }}>
                    <canvas ref={canvasRef} style={{width: '100%', height: '100%', outline: 'none'}} />


                    
                    <ViewCube sceneMgr={mgrInstance} theme={theme} lang={lang} />

                    {/* 右键菜单 */}
                    {contextMenu.visible && (
                        <ContextMenu
                            x={contextMenu.x}
                            y={contextMenu.y}
                            items={[
                                {
                                    label: t("hide_selected") || "隐藏选中",
                                    onClick: handleHideSelected,
                                    disabled: selectedUuids.length === 0
                                },
                                {
                                    label: t("isolate_selection") || "隔离选中",
                                    onClick: () => {
                                        if (selectedUuids.length > 0 && sceneMgr.current) {
                                            const newIsolated = selectedUuids.filter(id => !isolatedUuids.has(id));
                                            if (newIsolated.length > 0) {
                                                sceneMgr.current.isolateObjects(selectedUuids);
                                                setIsolatedUuids(new Set([...isolatedUuids, ...newIsolated]));
                                            }
                                        }
                                    },
                                    disabled: selectedUuids.length === 0
                                },
                                {
                                    label: t("clear_selection") || "清空选择",
                                    onClick: handleClearSelection,
                                    disabled: selectedUuids.length === 0
                                },
                                {
                                    label: t("show_all") || "显示全部",
                                    onClick: handleShowAll
                                }
                            ]}
                            onClose={() => setContextMenu(prev => ({ ...prev, visible: false }))}
                            theme={theme}
                        />
                    )}

                    {/* Toast Notification */}
                    {toast && (
                        <div className="ui-toast">
                            <div className="ui-toast-dot" style={{
                                backgroundColor: toast.type === 'error' ? 'var(--error)' : (toast.type === 'success' ? 'var(--success)' : 'var(--info)')
                            }} />
                            <span style={{ fontWeight: 500 }}>{toast.message}</span>
                            <button
                                className="ui-toast-close"
                                onClick={() => setToast(null)}
                            >
                                <IconClose size={12} />
                            </button>
                        </div>
                    )}

                    <LoadingOverlay t={t} loading={loading} status={status} progress={progress} theme={theme} />

                    {/* Overlay Panels for Tools */}
                    {activeTool === 'measure' && (
                        <MeasurePanel 
                            t={t} sceneMgr={sceneMgr.current} 
                            measureType={measureType} setMeasureType={setMeasureType}
                            measureHistory={measureHistory}
                            highlightedId={highlightedMeasureId}
                            onHighlight={(id: string) => {
                                setHighlightedMeasureId(id);
                                sceneMgr.current?.highlightMeasurement(id);
                                if (id) sceneMgr.current?.locateMeasurement(id);
                            }}
                            onDelete={(id: string) => { 
                                sceneMgr.current?.removeMeasurement(id); 
                                setMeasureHistory(prev => prev.filter(i => i.id !== id)); 
                                if (highlightedMeasureId === id) {
                                    setHighlightedMeasureId(null);
                                    sceneMgr.current?.highlightMeasurement(null);
                                }
                            }}
                            onClear={() => { 
                                sceneMgr.current?.clearAllMeasurements(); 
                                setMeasureHistory([]); 
                                setHighlightedMeasureId(null);
                                setMeasureType('none');
                            }}
                            onClose={() => setActiveTool('none')}
                            theme={theme}
                        />
                    )}

                    {activeTool === 'clip' && (
                        <ClipPanel 
                            t={t} sceneMgr={sceneMgr.current} onClose={() => setActiveTool('none')}
                            clipEnabled={clipEnabled} setClipEnabled={setClipEnabled}
                            clipValues={clipValues} setClipValues={setClipValues}
                            clipActive={clipActive} setClipActive={setClipActive}
                            clipHelperVisible={clipHelperVisible}
                            setClipHelperVisible={setClipHelperVisible}
                            clipHelperOpacity={clipHelperOpacity}
                            setClipHelperOpacity={setClipHelperOpacity}
                            theme={theme}
                        />
                    )}

                    {activeTool === 'export' && (
                        <ExportPanel t={t} onClose={() => setActiveTool('none')} onExport={handleExport} theme={theme} />
                    )}

                    {activeTool === 'screenshot' && (
                        <ScreenshotPanel
                            t={t}
                            onClose={() => setActiveTool('none')}
                            onCapture={(mode) => {
                                handleScreenshot(mode);
                                setActiveTool('none');
                            }}
                            theme={theme}
                        />
                    )}

                    {activeTool === 'settings' && (
                        <SettingsPanel 
                            t={t} onClose={() => setActiveTool('none')} settings={sceneSettings} onUpdate={handleSettingsUpdate}
                            currentLang={lang} setLang={setLang} themeMode={themeMode} setThemeMode={handleThemeModeChange}
                            showStats={showStats} setShowStats={setShowStats}
                            theme={theme}
                        />
                    )}

                    {activeTool === 'viewpoint' && (
                        <ViewpointPanel 
                            t={t} 
                            viewpoints={viewpoints}
                            onSave={handleSaveViewpoint}
                            onUpdateName={handleUpdateViewpointName}
                            onLoad={handleLoadViewpoint}
                            onDelete={handleDeleteViewpoint}
                            onOverwrite={handleOverwriteViewpoint}
                            onClose={() => setActiveTool('none')}
                            theme={theme} 
                        />
                    )}

                    {activeTool === 'sun' && (
                        <SunPanel 
                            t={t}
                            settings={sceneSettings}
                            onUpdate={handleSettingsUpdate}
                            onClose={() => setActiveTool('none')}
                            theme={theme}
                        />
                    )}
                </div>

                {/* Right Sidebar: Properties */}
                {showProps && (
                    <div className="ui-sidebar" style={{ 
                        width: `${rightWidth}px`, 
                        borderLeft: `1px solid ${theme.border}`,
                    }}>
                        <div className="ui-sidebar-header">
                            <span>{t("interface_props")}</span>
                            <button
                                className="ui-sidebar-close"
                                onClick={() => setShowProps(false)} 
                            >
                                <IconClose width={16} height={16} />
                            </button>
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <PropertiesPanel t={t} selectedProps={selectedProps} theme={theme} />
                        </div>
                        {/* Resize handle */}
                        <div 
                            onMouseDown={() => resizingRight.current = true}
                            className="ui-sidebar-resize"
                            style={{ left: -2 }}
                        />
                    </div>
                )}
             </div>

             {/* Bottom Status Bar */}
             <div className="ui-statusbar">
                <div className="ui-statusbar-left">
                    <span>{status}</span>
                    {loading && <span>{progress}%</span>}
                    {selectedUuid && selectedUuids.length > 1 && (
                        <span style={{ opacity: 0.8, paddingLeft: '8px', borderLeft: `1px solid ${theme.border}` }}>
                            {t("selected_count") || "已选择"}: {selectedUuids.length}
                        </span>
                    )}
                    {chunkProgress.total > 0 && chunkProgress.loaded < chunkProgress.total && (
                        <div className="ui-chunk-progress">
                            <span>
                                {t("chunk_loading") || "分片加载"}: {chunkProgress.loaded}/{chunkProgress.total}
                            </span>
                            <div className="ui-progress-bar" style={{ width: '80px' }}>
                                <div
                                    className="ui-progress-fill"
                                    style={{ width: `${(chunkProgress.loaded / chunkProgress.total) * 100}%` }}
                                />
                            </div>
                        </div>
                    )}
                    {(hiddenUuids.size > 0 || isolatedUuids.size > 0) && (
                        <button className="ui-statusbar-tag" onClick={handleShowAll}>
                            {hiddenUuids.size > 0 ? `${t("hide_selected") || "隐藏选中"} ${hiddenUuids.size}` : `${t("isolate_selection") || "隔离选中"} ${isolatedUuids.size}`}
                        </button>
                    )}
                </div>
                <div className="ui-statusbar-right">
                    {mousePos && (
                        <div style={{ opacity: 0.85 }}>
                            {mousePos.x.toFixed(2)}, {mousePos.y.toFixed(2)}, {mousePos.z.toFixed(2)}
                        </div>
                    )}
                    <div className="ui-tips">
                        <span>{t("tips_rotate")}</span>
                        <span>{t("tips_pan")}</span>
                        <span>{t("tips_zoom")}</span>
                    </div>
                    {showStats && (
                        <div className="ui-stats-group">
                            <div className="ui-stats-item" title="Original Meshes">
                                <IconBox width={14} height={14} />
                                <span>{formatNumber(stats.meshes)}</span>
                            </div>
                            <div className="ui-stats-item" title="Triangles">
                                <IconGrid width={14} height={14} />
                                <span>{formatNumber(stats.faces)}</span>
                            </div>
                            <div className="ui-stats-item">
                                <IconActivity width={14} height={14} />
                                <span>{formatMemory(stats.memory)}</span>
                            </div>
                            <div style={{ opacity: 0.75, fontVariantNumeric: 'tabular-nums' }} title="FPS">
                                {stats.fps} FPS
                            </div>
                            {stats.chunksTotal > 0 && (
                                <div style={{ opacity: 0.75, fontVariantNumeric: 'tabular-nums' }} title="Chunks">
                                    CH {stats.chunksLoaded}/{stats.chunksTotal}
                                </div>
                            )}
                            <div style={{ opacity: 0.75, fontVariantNumeric: 'tabular-nums' }} title="Pixel Ratio">
                                DPR {stats.pixelRatio}
                            </div>
                        </div>
                    )}
                    <button
                        className="ui-statusbar-btn"
                        onClick={() => handleThemeModeChange(themeMode === 'dark' ? 'light' : 'dark')}
                        title={themeMode === 'dark' ? t("theme_light") : t("theme_dark")}
                    >
                        {themeMode === 'dark' ? <IconSun width={16} height={16} /> : <IconMoon width={16} height={16} />}
                    </button>
                    <button
                        className="ui-statusbar-tag"
                        onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
                    >
                        {lang === 'zh' ? 'EN' : '中文'}
                    </button>
                    <div className="ui-divider-vertical" style={{ height: '12px' }} />
                    <div className="ui-statusbar-tag">
                        <span style={{ fontWeight: '600', letterSpacing: '0.5px' }}>3D BROWSER</span>
                    </div>
                </div>
             </div>

             <ConfirmModal 
                isOpen={confirmState.isOpen} title={confirmState.title} message={confirmState.message}
                onConfirm={() => { confirmState.action(); setConfirmState({...confirmState, isOpen: false}); }}
                onCancel={() => setConfirmState({...confirmState, isOpen: false})}
                t={t} theme={theme}
             />

             <AboutModal 
                isOpen={isAboutOpen} 
                onClose={() => setIsAboutOpen(false)} 
                t={t} theme={theme} 
             />

             {/* Error Modal */}
             {errorState.isOpen && (
                <div className="ui-error-overlay">
                    <div className="ui-error-content" style={{ width: '450px' }}>
                        <div className="ui-error-header" style={{ backgroundColor: 'var(--error)', color: 'white' }}>
                            <span>{errorState.title}</span>
                            <div 
                                onClick={() => setErrorState(prev => ({ ...prev, isOpen: false }))} 
                                style={{ cursor: 'pointer', display: 'flex', padding: 2, borderRadius: '50%' }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <IconClose width={18} height={18} />
                            </div>
                        </div>
                        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ fontWeight: '600', fontSize: '15px', color: theme.text }}>{errorState.message}</div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                                <button 
                                    className="ui-btn ui-btn-primary"
                                    style={{ padding: '8px 24px' }}
                                    onClick={() => setErrorState(prev => ({ ...prev, isOpen: false }))}
                                >
                                    {t("confirm") || "确定"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </ErrorBoundary>
    );
};

export default ThreeViewer;
