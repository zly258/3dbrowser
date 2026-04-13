import React, { Component, useState, useRef, useEffect, useCallback, useMemo } from "react";
// @ts-ignore
import * as THREE from "three";
import "./styles/index.css";
import { SceneManager, SceneSettings, PerformancePreset, SceneChunkOptions } from "./utils/scene-manager/SceneManager";
import { themes, ThemeColors } from "./theme/styles";
import { getTranslation, Lang } from "./theme/locales";

// 组件
import { Toolbar } from "./components/menu-bar";
import { SceneTree } from "./components/SceneTree";
import { MeasurePanel, ClipPanel, ExportPanel, ScreenshotPanel, ViewpointPanel, SettingsPanel, ExplodePanel, SearchPanel, ClashPanel } from "./components/tool-panels";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { ConfirmModal } from "./components/ConfirmModal";
import { AboutModal } from "./components/AboutModal";
import { ViewCube } from "./components/ViewCube";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ContextMenu } from "./components/ContextMenu";
import { IconClose, IconSun, IconMoon, IconActivity, IconBox, IconGrid } from "./theme/Icons";
import { usePersistentState } from "./hooks/usePersistentState";
import { useChunkProgress } from "./hooks/useChunkProgress";
import { useFileLoadingFlow } from "./hooks/useFileLoadingFlow";
import { useSceneStats } from "./hooks/useSceneStats";
import { useSceneSelection } from "./hooks/useSceneSelection";
import { useViewerSelection } from "./hooks/useViewerSelection";
import { useViewerActions } from "./hooks/useViewerActions";
import { useViewerCanvasInteractions } from "./hooks/useViewerCanvasInteractions";
import { useViewerFileActions } from "./hooks/useViewerFileActions";
import { useViewerLayout } from "./hooks/useViewerLayout";
import { useViewerTools } from "./hooks/useViewerTools";
import { useViewerVisibility } from "./hooks/useViewerVisibility";
import { useViewpoints } from "./hooks/useViewpoints";
import { useViewportLifecycle } from "./hooks/useViewportLifecycle";
import { sanitizeFileStem, stripFileExtension } from "./viewer/exportNaming";
import type { PropertyGroupInput, PropertyGroups } from "./viewer/propertyIndex";
import type { ViewpointSaveOptions, ViewpointStateSnapshot, ViewerConfirmState, ViewerErrorState, ViewerToast } from "./viewer/types";
import { usePropertySearch } from "./hooks/usePropertySearch";
import { useClashCheck } from "./hooks/useClashCheck";
import { useClashSummary } from "./hooks/useClashSummary";
import { useFocusInView } from "./hooks/useFocusInView";

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
            viewCubeSize: 120,
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
        clashClearanceDistance,
        clashUseNarrowPhase,
        clashUseTrianglePhase,
        clashIncludeSameModel,
        clashPairsScanned,
        clashResultFilter,
        clashTypeFilter,
        setClashSetA,
        setClashSetB,
        setClashTolerance,
        setClashMinOverlapVolume,
        setClashClearanceDistance,
        setClashUseNarrowPhase,
        setClashUseTrianglePhase,
        setClashIncludeSameModel,
        setClashResultFilter,
        setClashTypeFilter,
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

    const { focusObjectsInView } = useFocusInView({
        sceneMgrRef: sceneMgr,
        setSelectedUuids,
        setSelectedProps
    });

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

    const resetLocateStateRef = useRef<() => void>(() => {});

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

    function captureViewpointStateSnapshot(options: ViewpointSaveOptions): ViewpointStateSnapshot {
        const snapshot: ViewpointStateSnapshot = {};

        if (options.visibility) {
            snapshot.hiddenUuids = Array.from(hiddenUuids);
            snapshot.isolatedUuids = Array.from(isolatedUuids);
        }

        if (options.selection) {
            snapshot.selectedUuids = [...selectedUuids];
        }

        if (options.clip) {
            snapshot.clip = {
                enabled: clipEnabled,
                values: {
                    x: [...clipValues.x],
                    y: [...clipValues.y],
                    z: [...clipValues.z]
                },
                active: { ...clipActive },
                helperVisible: clipHelperVisible,
                helperOpacity: clipHelperOpacity
            };
        }

        if (options.explode) {
            snapshot.explode = {
                enabled: explodeEnabled,
                strength: explodeStrength,
                mode: explodeMode
            };
        }

        return snapshot;
    }

    async function restoreViewpointStateSnapshot(snapshot?: ViewpointStateSnapshot) {
        const manager = sceneMgr.current;
        if (!manager || !snapshot) return;

        resetLocateStateRef.current?.();
        manager.clearLocateFocus();

        if (snapshot.clip) {
            setClipEnabled(snapshot.clip.enabled);
            setClipValues(snapshot.clip.values);
            setClipActive(snapshot.clip.active);
            setClipHelperVisible(snapshot.clip.helperVisible);
            setClipHelperOpacity(snapshot.clip.helperOpacity);
        }

        if (snapshot.explode) {
            setExplodeEnabled(snapshot.explode.enabled);
            setExplodeStrength(snapshot.explode.strength);
            setExplodeMode(snapshot.explode.mode);
        }

        if (snapshot.hiddenUuids !== undefined || snapshot.isolatedUuids !== undefined) {
            manager.setAllVisibility(true);
            const nextHidden = snapshot.hiddenUuids || [];
            const nextIsolated = snapshot.isolatedUuids || [];
            if (nextIsolated.length > 0) {
                manager.isolateObjects(nextIsolated);
                setHiddenUuids(new Set());
                setIsolatedUuids(new Set(nextIsolated));
            } else {
                nextHidden.forEach((uuid) => manager.setObjectVisibility(uuid, false));
                setHiddenUuids(new Set(nextHidden));
                setIsolatedUuids(new Set());
            }
            updateTree();
        }

        if (snapshot.selectedUuids !== undefined) {
            setSelectedUuids(snapshot.selectedUuids);
            setSelectedProps(null);
            manager.highlightObjects(snapshot.selectedUuids);
            if (snapshot.selectedUuids.length === 1) {
                const target = manager.contentGroup.getObjectByProperty("uuid", snapshot.selectedUuids[0]);
                if (target) {
                    await handleSelect(target);
                }
            }
        }
    }

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
        t,
        captureStateSnapshot: captureViewpointStateSnapshot,
        restoreStateSnapshot: restoreViewpointStateSnapshot
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

    const {
        contextMenu,
        hiddenUuids,
        isolatedUuids,
        setHiddenUuids,
        setIsolatedUuids,
        handleContextMenu,
        closeContextMenu,
        handleHideSelected,
        handleShowAll,
        handleToggleVisibility,
        handleHideObject,
        handleIsolateObject,
        handleIsolateSelection,
        handleUndoVisibility
    } = useViewerVisibility({
        sceneMgrRef: sceneMgr,
        selectedUuids,
        setSelectedUuids,
        setSelectedProps,
        updateTree,
        resetLocateState: () => resetLocateStateRef.current()
    });

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
        setSelectedProps(null);
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

    useEffect(() => {
        const resultSet = new Set(searchResults.map((item) => item.uuid));
        setCheckedSearchResultUuids((prev) => prev.filter((uuid) => resultSet.has(uuid)));
    }, [searchResults]);

    const checkedSearchResults = useMemo(
        () => searchResults.filter((item) => checkedSearchResultUuids.includes(item.uuid)),
        [checkedSearchResultUuids, searchResults]
    );

    const handleToggleSearchResultChecked = useCallback((uuid: string, checked: boolean) => {
        setCheckedSearchResultUuids((prev) => checked
            ? (prev.includes(uuid) ? prev : [...prev, uuid])
            : prev.filter((item) => item !== uuid)
        );
    }, []);

    const handleSelectAllSearchResults = useCallback(() => {
        setCheckedSearchResultUuids(searchResults.map((item) => item.uuid));
    }, [searchResults]);

    const handleClearCheckedSearchResults = useCallback(() => {
        setCheckedSearchResultUuids([]);
    }, []);

    const handleBatchHighlightSearchResults = useCallback(() => {
        if (!sceneMgr.current || checkedSearchResultUuids.length === 0) return;
        sceneMgr.current.highlightObjects(checkedSearchResultUuids);
        setToast({ message: `${t("search_batch_highlight") || "批量高亮"}: ${checkedSearchResultUuids.length}`, type: "info" });
    }, [checkedSearchResultUuids, setToast, t]);

    const handleBatchLocateSearchResults = useCallback(() => {
        if (!sceneMgr.current || checkedSearchResultUuids.length === 0) return;
        sceneMgr.current.highlightObjects(checkedSearchResultUuids);
        sceneMgr.current.fitViewToObjects(checkedSearchResultUuids);
        setSelectedUuids(checkedSearchResultUuids);
        setSelectedProps(null);
    }, [checkedSearchResultUuids, setSelectedUuids]);

    const handleBatchHideSearchResults = useCallback(() => {
        if (!sceneMgr.current || checkedSearchResultUuids.length === 0) return;
        checkedSearchResultUuids.forEach((uuid) => sceneMgr.current?.setObjectVisibility(uuid, false));
        setHiddenUuids((prev) => new Set([...prev, ...checkedSearchResultUuids]));
        setIsolatedUuids(new Set());
        setSelectedUuids((prev) => prev.filter((uuid) => !checkedSearchResultUuids.includes(uuid)));
        setSelectedProps(null);
        sceneMgr.current.highlightObjects([]);
        updateTree();
    }, [checkedSearchResultUuids, setSelectedUuids, updateTree]);

    const handleBatchIsolateSearchResults = useCallback(() => {
        if (!sceneMgr.current || checkedSearchResultUuids.length === 0) return;
        sceneMgr.current.clearLocateFocus();
        sceneMgr.current.isolateObjects(checkedSearchResultUuids);
        sceneMgr.current.fitViewToObjects(checkedSearchResultUuids);
        sceneMgr.current.highlightObjects(checkedSearchResultUuids);
        setSelectedUuids(checkedSearchResultUuids);
        setSelectedProps(null);
        setHiddenUuids(new Set());
        setIsolatedUuids(new Set(checkedSearchResultUuids));
        updateTree();
    }, [checkedSearchResultUuids, setSelectedUuids, updateTree]);

    const handleAddSearchResultsToSelection = useCallback(() => {
        if (!sceneMgr.current || checkedSearchResultUuids.length === 0) return;
        const nextSelection = Array.from(new Set([...selectedUuids, ...checkedSearchResultUuids]));
        setSelectedUuids(nextSelection);
        sceneMgr.current.highlightObjects(nextSelection);
        setSelectedProps(null);
    }, [checkedSearchResultUuids, selectedUuids, setSelectedUuids]);

    const handleExportSearchResults = useCallback(() => {
        if (checkedSearchResults.length === 0) return;
        const lines = [
            ["uuid", "name", "type", "modelId", "source", "matchedBy"].join(","),
            ...checkedSearchResults.map((item) => [
                item.uuid,
                `"${String(item.name || "").replace(/"/g, '""')}"`,
                `"${String(item.type || "").replace(/"/g, '""')}"`,
                `"${String(item.modelId || "").replace(/"/g, '""')}"`,
                `"${String(item.source || "").replace(/"/g, '""')}"`,
                `"${item.matchedBy.join(" | ").replace(/"/g, '""')}"`
            ].join(","))
        ];
        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${stripFileExtension(currentFileSetId || "search-results") || "search-results"}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    }, [checkedSearchResults, currentFileSetId]);

    const modeTrayItems = useMemo(() => {
        const items: Array<{ key: string; label: string; onClear: () => void }> = [];

        if (measureType !== "none") {
            items.push({
                key: "measure",
                label: t("mode_measure"),
                onClear: () => {
                    setMeasureType("none");
                    setActiveTool("none");
                    sceneMgr.current?.clearMeasurementPreview();
                }
            });
        }

        if (clipEnabled) {
            items.push({
                key: "clip",
                label: t("mode_clip"),
                onClear: () => {
                    setClipEnabled(false);
                    setActiveTool("none");
                }
            });
        }

        if (searchResults.length > 0) {
            items.push({
                key: "search",
                label: `${t("mode_search")} ${searchResults.length}`,
                onClear: handleClearSearchResult
            });
        }

        if (hiddenUuids.size > 0) {
            items.push({
                key: "hidden",
                label: `${t("mode_hidden")} ${hiddenUuids.size}`,
                onClear: handleShowAll
            });
        }

        if (isolatedUuids.size > 0) {
            items.push({
                key: "isolated",
                label: `${t("mode_isolated")} ${isolatedUuids.size}`,
                onClear: handleShowAll
            });
        }

        if (activeTool === "boxSelect") {
            items.push({
                key: "boxSelect",
                label: t("mode_box_select"),
                onClear: () => setActiveTool("none")
            });
        }

        if (clashResults.length > 0) {
            items.push({
                key: "clash",
                label: `${t("mode_clash")} ${clashResults.length}`,
                onClear: handleClearClashResults
            });
        }

        return items;
    }, [
        activeTool,
        clashResults.length,
        clipEnabled,
        handleClearClashResults,
        handleClearSearchResult,
        handleShowAll,
        hiddenUuids.size,
        isolatedUuids.size,
        measureType,
        searchResults.length,
        t
    ]);

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

    useViewerCanvasInteractions({
        sceneMgrRef: sceneMgr,
        canvasRef,
        activeTool,
        setActiveTool: setActiveTool as React.Dispatch<React.SetStateAction<string>>,
        measureType,
        setMeasureType,
        pickEnabled,
        selectedUuids,
        setSelectedUuids,
        setSelectedProps,
        setMousePos,
        setHighlightedMeasureId,
        handleSelect,
        handleContextMenu,
        handleUndoVisibility,
        clearSelectionState: handleClearSelection
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
                className={`ui-container ui-app-shell ${themeMode} font-medium`}
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
             <div className="ui-main-layout">
                
                 {/* Left Sidebar: Outline */}
                {showOutline && (
                    <div className="ui-sidebar ui-sidebar-left" style={{ width: `${leftWidth}px` }}>
                        <div className="ui-sidebar-header">
                            <span>{t("interface_outline")}</span>
                            <button 
                                className="ui-sidebar-close"
                                onClick={() => setShowOutline(false)} 
                            >
                                <IconClose width={16} height={16} />
                            </button>
                        </div>
                        <div className="ui-sidebar-content">
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
                            className="ui-sidebar-resize ui-sidebar-resize-left"
                            onMouseDown={() => resizingLeft.current = true}
                        />
                    </div>
                )}

                {/* Center Viewport */}
                <div ref={viewportRef} className="ui-viewport-shell" style={{ backgroundColor: theme.canvasBg }}>
                    <canvas ref={canvasRef} className="ui-viewport-canvas" />


                    
                    <ViewCube sceneMgr={mgrInstance} theme={theme} lang={lang} />

                    {/* 右键菜单 */}
                    {contextMenu.visible && (
                        <ContextMenu
                            x={contextMenu.x}
                            y={contextMenu.y}
                            items={[
                                {
                                    label: t("hide_selected"),
                                    onClick: handleHideSelected,
                                    disabled: selectedUuids.length === 0
                                },
                                {
                                    label: t("isolate_selection"),
                                    onClick: handleIsolateSelection,
                                    disabled: selectedUuids.length === 0
                                },
                                {
                                    label: t("clear_selection"),
                                    onClick: handleClearSelection,
                                    disabled: selectedUuids.length === 0
                                },
                                {
                                    label: t("show_all"),
                                    onClick: handleShowAll
                                }
                            ]}
                            onClose={closeContextMenu}
                            theme={theme}
                        />
                    )}

                    {/* Toast Notification */}
                    {toast && (
                        <div className="ui-toast">
                            <div className={`ui-toast-dot ${toast.type === 'error' ? 'ui-toast-dot-error' : toast.type === 'success' ? 'ui-toast-dot-success' : 'ui-toast-dot-info'}`} />
                            <span className="ui-toast-message">{toast.message}</span>
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
                            checkedResultUuids={checkedSearchResultUuids}
                            onToggleResultChecked={handleToggleSearchResultChecked}
                            onSelectAllResults={handleSelectAllSearchResults}
                            onClearCheckedResults={handleClearCheckedSearchResults}
                            onBatchHighlight={handleBatchHighlightSearchResults}
                            onBatchLocate={handleBatchLocateSearchResults}
                            onBatchHide={handleBatchHideSearchResults}
                            onBatchIsolate={handleBatchIsolateSearchResults}
                            onBatchAddToSelection={handleAddSearchResultsToSelection}
                            onExportSelectedResults={handleExportSearchResults}
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
                            clearanceDistance={clashClearanceDistance}
                            useNarrowPhase={clashUseNarrowPhase}
                            useTrianglePhase={clashUseTrianglePhase}
                            includeSameModel={clashIncludeSameModel}
                            onSetAChange={setClashSetA}
                            onSetBChange={setClashSetB}
                            onToleranceChange={setClashTolerance}
                            onMinOverlapVolumeChange={setClashMinOverlapVolume}
                            onClearanceDistanceChange={setClashClearanceDistance}
                            onUseNarrowPhaseChange={setClashUseNarrowPhase}
                            onUseTrianglePhaseChange={setClashUseTrianglePhase}
                            onIncludeSameModelChange={setClashIncludeSameModel}
                            onRun={() => void handleRunClashCheck()}
                            onCancel={handleCancelClashCheck}
                            onClear={handleClearClashResults}
                            onExportCsv={handleExportClashCsv}
                            onIsolateByStatus={handleIsolateClashByStatus}
                            onRestoreVisibility={handleShowAll}
                            onResultFilterChange={setClashResultFilter}
                            typeFilter={clashTypeFilter}
                            onTypeFilterChange={setClashTypeFilter}
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
                    <div className="ui-sidebar ui-sidebar-right" style={{ width: `${rightWidth}px` }}>
                        <div className="ui-sidebar-header">
                            <span>{t("interface_props")}</span>
                            <button
                                className="ui-sidebar-close"
                                onClick={() => setShowProps(false)} 
                            >
                                <IconClose width={16} height={16} />
                            </button>
                        </div>
                        <div className="ui-sidebar-content">
                            <PropertiesPanel t={t} selectedProps={selectedProps} theme={theme} />
                        </div>
                        {/* Resize handle */}
                        <div
                            onMouseDown={() => resizingRight.current = true}
                            className="ui-sidebar-resize ui-sidebar-resize-right"
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
                        <span className="ui-statusbar-meta">
                            {t("selected_count")}: {selectedUuids.length}
                        </span>
                    )}
                    {chunkProgress.total > 0 && chunkProgress.loaded < chunkProgress.total && (
                        <div className="ui-chunk-progress">
                            <span>
                                {t("chunk_loading")}: {chunkProgress.loaded}/{chunkProgress.total}
                            </span>
                            <div className="ui-progress-bar ui-progress-bar-compact">
                                <div
                                    className="ui-progress-fill"
                                    style={{ width: `${(chunkProgress.loaded / chunkProgress.total) * 100}%` }}
                                />
                            </div>
                        </div>
                    )}
                    {modeTrayItems.length > 0 && (
                        <div className="ui-mode-tray">
                            {modeTrayItems.map((item) => (
                                <div key={item.key} className="ui-mode-pill">
                                    <span>{item.label}</span>
                                    <button onClick={item.onClear}>
                                        {t("mode_clear")}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="ui-statusbar-right">
                    {mousePos && (
                        <div className="ui-statusbar-coords">
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
                            <div className="ui-stats-item" title={t("stats_original_meshes")}>
                                <IconBox width={14} height={14} />
                                <span>{formatNumber(stats.meshes)}</span>
                            </div>
                            <div className="ui-stats-item" title={t("stats_triangles")}>
                                <IconGrid width={14} height={14} />
                                <span>{formatNumber(stats.faces)}</span>
                            </div>
                            <div className="ui-stats-item">
                                <IconActivity width={14} height={14} />
                                <span>{formatMemory(stats.memory)}</span>
                            </div>
                            {stats.chunksTotal > 0 && (
                                <div className="ui-statusbar-metric" title={t("stats_chunks")}>
                                    CH {stats.chunksLoaded}/{stats.chunksTotal}
                                </div>
                            )}
                            <div className="ui-statusbar-metric" title={t("stats_pixel_ratio")}>
                                DPR {stats.pixelRatio}
                            </div>
                        </div>
                    )}
                    <div className="ui-divider-vertical ui-divider-vertical-compact ui-divider-vertical-short" />
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
                    <div className="ui-divider-vertical ui-divider-vertical-compact ui-divider-vertical-short" />
                    <div className="ui-statusbar-tag ui-statusbar-tag-compact ui-statusbar-brand">
                        <span className="ui-statusbar-brand-label">3D BROWSER</span>
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
                    <div className="ui-error-content ui-error-content-wide">
                        <div className="ui-error-header ui-error-header-danger">
                            <span>{errorState.title}</span>
                            <div 
                                onClick={() => setErrorState(prev => ({ ...prev, isOpen: false }))} 
                                className="ui-error-close"
                            >
                                <IconClose width={18} height={18} />
                            </div>
                        </div>
                        <div className="ui-error-body">
                            <div className="ui-error-message">{errorState.message}</div>
                            <div className="ui-error-actions">
                                <button 
                                    className="ui-btn ui-btn-primary ui-btn-modal-confirm"
                                    onClick={() => setErrorState(prev => ({ ...prev, isOpen: false }))}
                                >
                                    {t("confirm")}
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


