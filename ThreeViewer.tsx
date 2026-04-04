import React, { Component, useState, useRef, useEffect, useCallback, useMemo } from "react";
// @ts-ignore
import * as THREE from "three";
import "./src/styles/index.css";
import { SceneManager, SceneSettings, PerformancePreset, SceneChunkOptions } from "./src/utils/SceneManager";
import { themes, ThemeColors } from "./src/theme/Styles";
import { getTranslation, Lang } from "./src/theme/Locales";

// 组件
import { Toolbar } from "./src/components/MenuBar";
import { SceneTree } from "./src/components/SceneTree";
import { MeasurePanel, ClipPanel, ExportPanel, ScreenshotPanel, ViewpointPanel, SettingsPanel, ExplodePanel, SearchPanel, ClashPanel } from "./src/components/ToolPanels";
import { LoadingOverlay } from "./src/components/LoadingOverlay";
import { PropertiesPanel } from "./src/components/PropertiesPanel";
import { ConfirmModal } from "./src/components/ConfirmModal";
import { AboutModal } from "./src/components/AboutModal";
import { ViewCube } from "./src/components/ViewCube";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { ContextMenu } from "./src/components/ContextMenu";
import { IconClose, IconSun, IconMoon, IconActivity, IconBox, IconGrid } from "./src/theme/Icons";
import { usePersistentState } from "./src/hooks/usePersistentState";
import { useChunkProgress } from "./src/hooks/useChunkProgress";
import { useFileLoadingFlow } from "./src/hooks/useFileLoadingFlow";
import { useSceneStats } from "./src/hooks/useSceneStats";
import { useSceneSelection } from "./src/hooks/useSceneSelection";
import { useViewerSelection } from "./src/hooks/useViewerSelection";
import { useViewerActions } from "./src/hooks/useViewerActions";
import { useViewerFileActions } from "./src/hooks/useViewerFileActions";
import { useViewerLayout } from "./src/hooks/useViewerLayout";
import { useViewerTools } from "./src/hooks/useViewerTools";
import { useViewpoints } from "./src/hooks/useViewpoints";
import { useViewportLifecycle } from "./src/hooks/useViewportLifecycle";
import { sanitizeFileStem, stripFileExtension } from "./src/viewer/exportNaming";
import type { PropertyGroupInput, PropertyGroups } from "./src/viewer/propertyIndex";
import type { ViewerConfirmState, ViewerErrorState, ViewerToast } from "./src/viewer/types";
import { usePropertySearch } from "./src/viewer/usePropertySearch";
import { useClashCheck } from "./src/viewer/useClashCheck";
import { useClashSummary } from "./src/viewer/useClashSummary";

const IS_DEV = typeof window !== "undefined" && (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
);

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
    performancePreset?: PerformancePreset;
    chunkOptions?: SceneChunkOptions;
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
     hideDeleteModel = false,
     performancePreset = 'quality',
     chunkOptions
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

    const effectiveChunkOptions = useMemo<SceneChunkOptions>(() => ({
        chunkReadCacheSize: chunkOptions?.chunkReadCacheSize ?? 128,
        chunkPrefetchWindow: chunkOptions?.chunkPrefetchWindow ?? 0,
        targetMinFps: chunkOptions?.targetMinFps ?? 20,
        ghostMode: chunkOptions?.ghostMode,
        loadProfile: chunkOptions?.loadProfile ?? "max-speed",
        deferIfcProperties: chunkOptions?.deferIfcProperties ?? true,
        preferWorkerOctree: chunkOptions?.preferWorkerOctree ?? true,
        fastGeometrySanitize: chunkOptions?.fastGeometrySanitize ?? true
    }), [chunkOptions]);

    

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

    const t = useCallback((key: string) => getTranslation(lang, key), [lang]);

    // 全站禁用原生右键菜单与常见鼠标手势（保留应用内自定义右键逻辑）
    useEffect(() => {
        const preventDefault = (event: Event) => {
            event.preventDefault();
        };
        const preventBrowserNavigation = (event: MouseEvent) => {
            // button 3/4: 浏览器后退/前进侧键
            if (event.button === 3 || event.button === 4) {
                event.preventDefault();
                event.stopPropagation();
            }
        };

        document.addEventListener("contextmenu", preventDefault, { capture: true });
        document.addEventListener("gesturestart", preventDefault as EventListener, { capture: true } as AddEventListenerOptions);
        window.addEventListener("auxclick", preventDefault as EventListener, { capture: true });
        window.addEventListener("mousedown", preventBrowserNavigation, { capture: true });

        return () => {
            document.removeEventListener("contextmenu", preventDefault, { capture: true } as EventListenerOptions);
            document.removeEventListener("gesturestart", preventDefault as EventListener, { capture: true } as EventListenerOptions);
            window.removeEventListener("auxclick", preventDefault as EventListener, { capture: true } as EventListenerOptions);
            window.removeEventListener("mousedown", preventBrowserNavigation, { capture: true } as EventListenerOptions);
        };
    }, []);

    // 状态
    const [treeRoot, setTreeRoot] = useState<any[]>([]);
    const {
        selectedUuids,
        selectedUuid,
        setSelectedUuids,
        clearSelection
    } = useSceneSelection();
    const [selectedProps, setSelectedProps] = useState<PropertyGroups | null>(null);
    const [status, setStatus] = useState(getTranslation(lang, 'ready'));
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [stats, setStats] = useState({
        meshes: 0,
        faces: 0,
        memory: 0,
        textureMemory: 0,
        drawCalls: 0,
        chunksLoaded: 0,
        chunksTotal: 0,
        chunksQueued: 0,
        pixelRatio: 1
    });
    const [chunkProgress, setChunkProgress] = useState({ loaded: 0, total: 0 });
    const [mgrInstance, setMgrInstance] = useState<SceneManager | null>(null);
    
    // Viewport coords
    const [mousePos, setMousePos] = useState<THREE.Vector3 | null>(null);
    // 显示模式：solid-着色, transparent-透明
    const [displayMode, setDisplayMode] = useState<'solid' | 'transparent'>('solid');
    
    // Viewpoint State
    const [currentFileSetId, setCurrentFileSetId] = useState<string>("");
    
    const {
        activeTool,
        setActiveTool,
        explodeEnabled,
        setExplodeEnabled,
        explodeStrength,
        setExplodeStrength,
        explodeMode,
        setExplodeMode,
        resetExplodeState,
        measureType,
        setMeasureType,
        measureHistory,
        setMeasureHistory,
        highlightedMeasureId,
        setHighlightedMeasureId,
        resetMeasurementState,
        handleMeasureUpdate,
        clipEnabled,
        setClipEnabled,
        clipValues,
        setClipValues,
        clipActive,
        setClipActive,
        clipHelperVisible,
        setClipHelperVisible,
        clipHelperOpacity,
        setClipHelperOpacity
    } = useViewerTools({
        initialSettings,
        mgrInstance
    });

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
            performanceMode: 'balanced',
            backLightInt: 0.5,
            highlightColor: "#ff9f1c",
            highlightShowBox: false,
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

    // Confirmation Modal State
    const [confirmState, setConfirmState] = useState<ViewerConfirmState>({ isOpen: false, title: "", message: "", action: () => {} });

    // About Modal State
    const [isAboutOpen, setIsAboutOpen] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const sceneMgr = useRef<SceneManager | null>(null);
    const ifcPropertyCacheRef = useRef<Map<string, Record<string, PropertyGroupInput>>>(new Map());
    const pointerDownRef = useRef<{ x: number; y: number; moved: boolean; button: number } | null>(null);
    const mouseMoveRafRef = useRef<number | null>(null);
    const pendingMousePointRef = useRef<{ x: number; y: number } | null>(null);

    const {
        leftWidth,
        rightWidth,
        resizingLeft,
        resizingRight
    } = useViewerLayout({
        propShowOutline,
        propShowProperties,
        setShowOutline,
        setShowProps
    });

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
        const manager = sceneMgr.current;
        if (!manager) return;
        manager.setChunkOptions(effectiveChunkOptions);
        manager.updateSettings({
            ...sceneSettings,
            performanceMode: performancePreset,
            targetFps: effectiveChunkOptions.targetMinFps ?? sceneSettings.targetFps
        });
    }, [effectiveChunkOptions, performancePreset, sceneSettings]);
    
    // 是否加载了模型（基于treeRoot判断）
    const hasModels = treeRoot.length > 0;
    const clashModelOptions = useMemo(() => {
        const options: Array<{ id: string; name: string }> = [];
        const seen = new Set<string>();
        (treeRoot || []).forEach((node: any) => {
            const id = String(node?.object?.userData?.originalUuid || node?.uuid || "");
            if (!id || seen.has(id)) return;
            seen.add(id);
            options.push({ id, name: String(node?.name || id) });
        });
        return options;
    }, [treeRoot]);
    const {
        clashResults,
        clashRunning,
        clashProgress,
        clashStatus,
        clashScannedCount,
        clashSetA,
        clashSetB,
        clashTolerance,
        clashMinOverlapVolume,
        clashUseNarrowPhase,
        clashUseTrianglePhase,
        clashPairsScanned,
        clashResultFilter,
        setClashSetA,
        setClashSetB,
        setClashTolerance,
        setClashMinOverlapVolume,
        setClashUseNarrowPhase,
        setClashUseTrianglePhase,
        setClashResultFilter,
        handleRunClashCheck,
        handleCancelClashCheck,
        handleClearClashResults,
        handleFocusClashResult,
        handleUpdateClashResultStatus,
        handleMarkFilteredClashStatus,
        handleExportClashCsv,
        resetClashState,
        applyClashModelOptionBounds
    } = useClashCheck({
        sceneMgrRef: sceneMgr,
        treeRoot,
        clashModelOptions,
        selectedUuids,
        setSelectedUuids,
        t
    });
    const clashSummaryByUuid = useClashSummary(sceneMgr, clashResults);
    
    // 跟踪已完成首次加载的文件集,避免重复toast提示
    const completedFileSetsRef = useRef<Set<string>>(new Set());
    const currentFileSetIdRef = useRef("");

    useEffect(() => {
        currentFileSetIdRef.current = currentFileSetId;
    }, [currentFileSetId]);

    // Error State
    const [errorState, setErrorState] = useState<ViewerErrorState>({ isOpen: false, title: "", message: "" });

    // Toast Message State
    const [toast, setToast] = useState<ViewerToast | null>(null);

    const { onManagerChunkProgress } = useChunkProgress({
        fileSetIdRef: currentFileSetIdRef,
        completedFileSetsRef,
        onProgress: setChunkProgress,
        onCompleted: () => {
            setToast({ message: t("all_chunks_loaded"), type: 'success' });
            setChunkProgress({ loaded: 0, total: 0 });
        }
    });

    const handleManagerChunkProgress = useCallback((loaded: number, total: number) => {
        onManagerChunkProgress(loaded, total);
    }, [onManagerChunkProgress]);

    useSceneStats({
        mgrInstance,
        showStats,
        setStats
    });

    useEffect(() => {
        applyClashModelOptionBounds();
    }, [applyClashModelOptionBounds]);

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
    const resetLocateStateRef = useRef<() => void>(() => {});
    
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
        resetLocateStateRef.current();
        sceneMgr.current.clearLocateFocus();
    }, [hiddenUuids, isolatedUuids]);

    // Update status when lang changes if status is "Ready" (or equivalent)
    useEffect(() => {
        const prevLang = lang === 'zh' ? 'en' : 'zh';
        if (status === getTranslation(prevLang, 'ready')) {
            setStatus(getTranslation(lang, 'ready'));
        }
    }, [lang]);

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

    const {
        viewpoints,
        handleSaveViewpoint,
        handleUpdateViewpointName,
        handleLoadViewpoint,
        handleOverwriteViewpoint,
        handleDeleteViewpoint
    } = useViewpoints({
        currentFileSetId,
        sceneMgrRef: sceneMgr,
        setToast,
        setConfirmState,
        t
    });

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
        const loadedMap = new Map<string, boolean>();
        const collectExpanded = (nodes: any[]) => {
            const stack = (nodes || []).slice();
            while (stack.length) {
                const n = stack.pop();
                if (!n) continue;
                if (typeof n.uuid === 'string') {
                    expandedMap.set(n.uuid, !!n.expanded);
                    loadedMap.set(n.uuid, n.childrenLoaded !== false);
                }
                if (Array.isArray(n.children) && n.children.length) {
                    for (const child of n.children) {
                        stack.push(child);
                    }
                }
            }
        };

        const convertNode = (node: any, depth = 0, isFileNode = false, forceLoadChildren = false): any => {
            const uuid = node.id;
            const rawChildren = Array.isArray(node.children) ? node.children : [];
            const hasChildren = rawChildren.length > 0;
            const shouldLoadChildren = forceLoadChildren || loadedMap.get(uuid) === true;

            return {
                uuid,
                name: node.name,
                type: node.type === 'Mesh' ? 'MESH' : 'GROUP',
                depth,
                children: shouldLoadChildren
                    ? rawChildren.map((child: any) => convertNode(child, depth + 1, false, false))
                    : [],
                expanded: expandedMap.get(uuid) ?? false,
                visible: node.visible !== false,
                object: node,
                isFileNode,
                hasChildren,
                childrenLoaded: shouldLoadChildren
            };
        };

        // 只显示 Root 的子节点，从而移除 Root 和 ImportedModels 这一层
        setTreeRoot(prev => {
            collectExpanded(prev);
            const roots: any[] = [];
            (root.children || []).forEach((c: any) => {
                if (c.name === "ImportedModels" || c.name === "Tilesets") {
                    (c.children || []).forEach((child: any) => {
                        roots.push(convertNode(child, 0, true, true));
                    });
                } else {
                    roots.push(convertNode(c, 0, true, true));
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

    const handleClearSelection = () => {
        clearSelection();
        sceneMgr.current?.highlightObjects([]);
    };

    // --- Scene Initialization ---
    useEffect(() => {
        if (!canvasRef.current) return;
        
        const manager = new SceneManager(canvasRef.current, {
            performancePreset,
            chunkOptions: effectiveChunkOptions
        });
        sceneMgr.current = manager;
        setMgrInstance(manager);
        
        if (onLoad) onLoad(manager);

        // Initial setup
        manager.updateSettings(sceneSettings);
        requestAnimationFrame(() => {
            manager.resize();
        });

        manager.onChunkProgress = handleManagerChunkProgress;

        manager.onMeasureUpdate = handleMeasureUpdate;

        manager.onStructureUpdate = () => {
            updateTree();
        };

        return () => {
            manager.dispose();
        };
    }, []); 

    // --- Effect for Initial Files ---
    useEffect(() => {
        if (!mgrInstance || !initialFiles) return;

        const loadInitial = async () => {
            const itemsToProcess: (File | string)[] = Array.isArray(initialFiles) ? initialFiles : [initialFiles];
            console.log("[ThreeViewer] loadInitial with items:", itemsToProcess);
            
            await processFiles(itemsToProcess);
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
            // 拖拽浏览时跳过射线检测，减少卡顿与抖动。
            if (e.buttons !== 0) {
                pendingMousePointRef.current = null;
                if (mouseMoveRafRef.current !== null) {
                    cancelAnimationFrame(mouseMoveRafRef.current);
                    mouseMoveRafRef.current = null;
                }
                setMousePos(null);
                return;
            }

            pendingMousePointRef.current = { x: e.clientX, y: e.clientY };
            if (mouseMoveRafRef.current !== null) return;

            mouseMoveRafRef.current = requestAnimationFrame(() => {
                mouseMoveRafRef.current = null;
                const pending = pendingMousePointRef.current;
                if (!pending) return;
                const intersect = mgr.getRayIntersects(pending.x, pending.y);
                if (intersect) {
                    setMousePos(intersect.point);
                } else {
                    setMousePos(null);
                }
            });
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
            if (mouseMoveRafRef.current !== null) {
                cancelAnimationFrame(mouseMoveRafRef.current);
                mouseMoveRafRef.current = null;
            }
            pendingMousePointRef.current = null;
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


    // --- 处理函数 ---
    const {
        locatedUuid,
        locateResultUuids,
        resetLocateState,
        handleSelect,
        handleLocateObject,
        handleLocateResultsChange,
        handleClearLocate
    } = useViewerSelection({
        sceneMgrRef: sceneMgr,
        selectedUuids,
        setSelectedUuids,
        setSelectedProps,
        setHiddenUuids,
        setIsolatedUuids,
        updateTree,
        propOnSelect,
        ifcPropertyCacheRef,
        clashSummaryByUuid,
        t,
        isDev: IS_DEV
    });
    resetLocateStateRef.current = resetLocateState;

    const {
        searchConditions,
        setSearchConditions,
        searchResults,
        searching,
        searchProgress,
        searchStatus,
        handleRunPropertySearch,
        handleApplySearchResultHighlight,
        handleClearSearchResult,
        handleCancelSearch
    } = usePropertySearch({
        sceneMgrRef: sceneMgr,
        selectedUuids,
        setSelectedUuids,
        onSelectObject: handleSelect,
        t,
        setToast
    });

    const handleIsolateClashByStatus = useCallback((status: "new" | "confirmed") => {
        if (!sceneMgr.current) return;
        const uuids = Array.from(new Set(
            clashResults
                .filter((item) => item.status === status)
                .flatMap((item) => [item.aUuid, item.bUuid])
                .filter(Boolean)
        ));
        if (uuids.length === 0) return;
        sceneMgr.current.clearLocateFocus();
        sceneMgr.current.isolateObjects(uuids);
        setHiddenUuids(new Set());
        setIsolatedUuids(new Set(uuids));
        updateTree();
        sceneMgr.current.fitViewToObjects(uuids);
    }, [clashResults, updateTree]);

    const { processFiles, loadItemsIntoScene } = useFileLoadingFlow({
        managerRef: sceneMgr,
        sceneSettings,
        libPath,
        t,
        setCurrentFileSetId,
        setLoading,
        setStatus,
        setProgress,
        setToast,
        updateTree
    });

    useViewportLifecycle({
        allowDragOpen,
        mgrInstance,
        viewportRef,
        t,
        processFiles,
        setToast,
        setErrorState
    });

    const {
        getDefaultExportFileName,
        handleExport,
        handleClear,
        handleScreenshot
    } = useViewerActions({
        sceneMgrRef: sceneMgr,
        t,
        setLoading,
        setProgress,
        setStatus,
        setToast,
        setActiveTool,
        setConfirmState,
        setSelectedUuids,
        setSelectedProps,
        setChunkProgress,
        resetLocateState,
        clearSearchResult: handleClearSearchResult,
        resetClashState,
        resetMeasurementState,
        resetExplodeState,
        updateTree,
        ifcPropertyCacheRef: ifcPropertyCacheRef as React.MutableRefObject<Map<string, Record<string, unknown>>>,
        completedFileSetsRef
    });

    const {
        handleOpenFiles,
        handleBatchConvert,
        handleOpenUrl,
        handleDragOver,
        handleDrop
    } = useViewerFileActions({
        sceneMgrRef: sceneMgr,
        t,
        processFiles,
        loadItemsIntoScene,
        setLoading,
        setStatus,
        setProgress,
        setToast,
        setActiveTool,
        setSelectedUuids,
        setSelectedProps,
        resetMeasurementState,
        updateTree,
        isDev: IS_DEV
    });

    const handleView = (v: any) => { sceneMgr.current?.setView(v); };

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
        sceneMgr.current.requestRender();
    };

    return (
        <ErrorBoundary t={t} theme={theme}>
            <div
                className={`ui-container ${themeMode} font-medium`}
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
                                locatedUuid={locatedUuid}
                                onSelect={(_uuid, obj) => handleSelect(obj)}
                                onToggleVisibility={handleToggleVisibility}
                                onDelete={(obj) => {
                                    const uuid = obj?.uuid || obj?.id;
                                    if (uuid) handleDeleteObject(uuid);
                                }}
                                onHide={handleHideObject}
                                onIsolate={handleIsolateObject}
                                onShowAll={handleShowAll}
                                onLocate={handleLocateObject}
                                onClearLocate={handleClearLocate}
                                onLocateResultsChange={handleLocateResultsChange}
                                locateResultUuids={locateResultUuids}
                                clashSummaryByUuid={clashSummaryByUuid}
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
                                resetMeasurementState();
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
                        <ExportPanel
                            t={t}
                            onClose={() => setActiveTool('none')}
                            onExport={handleExport}
                            getDefaultFileName={getDefaultExportFileName}
                            theme={theme}
                        />
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

                    {activeTool === 'search' && (
                        <SearchPanel
                            t={t}
                            onClose={() => setActiveTool('none')}
                            conditions={searchConditions}
                            results={searchResults}
                            searching={searching}
                            searchProgress={searchProgress}
                            searchStatus={searchStatus}
                            onConditionsChange={setSearchConditions}
                            onSearch={() => void handleRunPropertySearch()}
                            onCancelSearch={handleCancelSearch}
                            onApplyResultHighlight={handleApplySearchResultHighlight}
                            onClearResult={handleClearSearchResult}
                            theme={theme}
                        />
                    )}

                    {activeTool === 'clash' && (
                        <ClashPanel
                            t={t}
                            onClose={() => setActiveTool('none')}
                            running={clashRunning}
                            progress={clashProgress}
                            status={clashStatus}
                            scannedCount={clashScannedCount}
                            pairsScanned={clashPairsScanned}
                            results={clashResults}
                            resultFilter={clashResultFilter}
                            modelOptions={clashModelOptions}
                            setA={clashSetA}
                            setB={clashSetB}
                            tolerance={clashTolerance}
                            minOverlapVolume={clashMinOverlapVolume}
                            useNarrowPhase={clashUseNarrowPhase}
                            useTrianglePhase={clashUseTrianglePhase}
                            onSetAChange={setClashSetA}
                            onSetBChange={setClashSetB}
                            onToleranceChange={setClashTolerance}
                            onMinOverlapVolumeChange={setClashMinOverlapVolume}
                            onUseNarrowPhaseChange={setClashUseNarrowPhase}
                            onUseTrianglePhaseChange={setClashUseTrianglePhase}
                            onRun={() => void handleRunClashCheck()}
                            onCancel={handleCancelClashCheck}
                            onClear={handleClearClashResults}
                            onExportCsv={handleExportClashCsv}
                            onIsolateByStatus={handleIsolateClashByStatus}
                            onRestoreVisibility={handleShowAll}
                            onResultFilterChange={setClashResultFilter}
                            onUpdateResultStatus={handleUpdateClashResultStatus}
                            onMarkFilteredStatus={handleMarkFilteredClashStatus}
                            onSetASelectAll={() => setClashSetA(clashModelOptions.map((item) => item.id))}
                            onSetAClear={() => setClashSetA([])}
                            onSetBSelectAll={() => setClashSetB(clashModelOptions.map((item) => item.id))}
                            onSetBClear={() => setClashSetB([])}
                            onFocusResult={handleFocusClashResult}
                            theme={theme}
                        />
                    )}

                    {activeTool === 'explode' && (
                        <ExplodePanel
                            t={t}
                            onClose={() => setActiveTool('none')}
                            enabled={explodeEnabled}
                            strength={explodeStrength}
                            mode={explodeMode}
                            onEnabledChange={setExplodeEnabled}
                            onStrengthChange={setExplodeStrength}
                            onModeChange={setExplodeMode}
                            onReset={() => {
                                resetExplodeState();
                                sceneMgr.current?.resetExplode();
                            }}
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
                    <div className="ui-divider-vertical ui-divider-vertical-compact" style={{ height: '12px' }} />
                    <button
                        className="ui-statusbar-btn ui-statusbar-btn-compact"
                        onClick={() => handleThemeModeChange(themeMode === 'dark' ? 'light' : 'dark')}
                        title={themeMode === 'dark' ? t("theme_light") : t("theme_dark")}
                    >
                        {themeMode === 'dark' ? <IconSun width={16} height={16} /> : <IconMoon width={16} height={16} />}
                    </button>
                    <button
                        className="ui-statusbar-tag ui-statusbar-tag-compact"
                        onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
                    >
                        {lang === 'zh' ? 'EN' : '中文'}
                    </button>
                    <div className="ui-divider-vertical ui-divider-vertical-compact" style={{ height: '12px' }} />
                    <div className="ui-statusbar-tag ui-statusbar-tag-compact ui-statusbar-brand">
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


