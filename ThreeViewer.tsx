import React, { Component, useState, useRef, useEffect, useCallback, useMemo } from "react";
import * as THREE from "three";
import { createRoot } from "react-dom/client";
import { SceneManager, MeasureType, SceneSettings } from "./src/utils/SceneManager";
import { loadModelFiles, parseTilesetFromFolder } from "./src/loader/LoaderUtils";
import { convertLMBTo3DTiles, exportGLB, exportLMB } from "./src/utils/converter";
import { createStyles, createGlobalStyle, themes, ThemeColors } from "./src/theme/Styles";
import { getTranslation, Lang } from "./src/theme/Locales";

// 组件
import { MenuBar } from "./src/components/MenuBar";
import { SceneTree, buildTree } from "./src/components/SceneTree";
import { MeasurePanel, ClipPanel, ExportPanel, FloatingPanel } from "./src/components/ToolPanels";
import { SettingsPanel } from "./src/components/SettingsPanel";
import { LoadingOverlay } from "./src/components/LoadingOverlay";
import { PropertiesPanel } from "./src/components/PropertiesPanel";
import { ConfirmModal } from "./src/components/ConfirmModal";
import { AboutModal } from "./src/components/AboutModal";
import { ViewCube } from "./src/components/ViewCube";
import { IconClose } from "./src/theme/Icons";

interface ErrorBoundaryProps {
    children: React.ReactNode;
    t: any;
    styles: any;
    theme: any;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

// --- 错误边界组件 ---
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    public state: ErrorBoundaryState;
    public props: ErrorBoundaryProps;

    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("ErrorBoundary caught an error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            const { t, styles, theme } = this.props;
            return (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    height: '100vh', width: '100vw', backgroundColor: theme.bg, color: theme.text,
                    fontFamily: "'Microsoft YaHei', sans-serif", gap: '20px', padding: '40px', textAlign: 'center'
                }}>
                    <div style={{ fontSize: '64px' }}>⚠️</div>
                    <h1 style={{ fontSize: '24px', margin: 0 }}>应用发生错误</h1>
                    <p style={{ color: theme.textMuted, maxWidth: '600px', lineHeight: '1.6' }}>
                        抱歉，程序运行过程中遇到了未预期的错误。您可以尝试重新加载页面，或联系开发人员。
                    </p>
                    <button 
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '10px 24px', backgroundColor: theme.accent, color: '#fff',
                            border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
                        }}
                    >
                        重新加载页面
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

// --- 全局样式注入 ---
const GlobalStyle = ({ theme, fontFamily }: { theme: ThemeColors, fontFamily: string }) => (
    <style dangerouslySetInnerHTML={{ __html: createGlobalStyle(theme, fontFamily) }} />
);

// --- 全局样式注入 ---

export interface ThreeViewerProps {
    allowDragOpen?: boolean;
    disabledMenus?: string[];
    hiddenMenus?: string[];
    libPath?: string;
    defaultTheme?: 'dark' | 'light';
    defaultLang?: Lang;
    accentColor?: string;
    showStats?: boolean;
    showOutline?: boolean;
    showProperties?: boolean;
    initialSettings?: Partial<SceneSettings>;
    initialFiles?: (string | File) | (string | File)[];
    onSelect?: (uuid: string, object: any) => void;
    onLoad?: (manager: SceneManager) => void;
}

// --- 主应用 ---
export const ThreeViewer = ({ 
    allowDragOpen = true, 
    disabledMenus = [],
    hiddenMenus = [],
    libPath = './libs',
    defaultTheme,
    defaultLang,
    accentColor: propAccentColor,
    showStats: propShowStats,
    showOutline: propShowOutline,
    showProperties: propShowProperties,
     initialSettings,
     initialFiles,
     onSelect: propOnSelect,
     onLoad
 }: ThreeViewerProps) => {
    // 主题状态 - 从localStorage恢复或使用prop
    const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => {
        if (defaultTheme) return defaultTheme;
        try {
            const saved = localStorage.getItem('3dbrowser_themeMode');
            return (saved === 'dark' || saved === 'light') ? saved : 'light';
        } catch {
            return 'light';
        }
    });

    // 主题颜色状态
    const [accentColor, setAccentColor] = useState(() => {
        if (propAccentColor) return propAccentColor;
        try {
            const saved = localStorage.getItem('3dbrowser_accentColor');
            return saved || "#0078D4";
        } catch {
            return "#0078D4";
        }
    });

    const theme = useMemo(() => {
        const baseTheme = themes[themeMode];
        return { ...baseTheme, accent: accentColor };
    }, [themeMode, accentColor]);

    // 字体设置状态 - 从localStorage恢复
    const [fontFamily, setFontFamily] = useState(() => {
        try {
            const saved = localStorage.getItem('3dbrowser_fontFamily');
            return saved || "'Microsoft YaHei', sans-serif";
        } catch {
            return "'Microsoft YaHei', sans-serif";
        }
    });

    const styles = useMemo(() => createStyles(theme, fontFamily), [theme, fontFamily]);

    // 语言状态 - 从localStorage恢复
    const [lang, setLang] = useState<Lang>(() => {
        if (defaultLang) return defaultLang;
        try {
            const saved = localStorage.getItem('3dbrowser_lang');
            return (saved === 'zh' || saved === 'en') ? saved : 'zh';
        } catch {
            return 'zh';
        }
    });

    // 状态
    const [treeRoot, setTreeRoot] = useState<any[]>([]);
    const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
    const [selectedProps, setSelectedProps] = useState<any>(null);
    const [status, setStatus] = useState(getTranslation(lang, 'ready'));
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [stats, setStats] = useState({ meshes: 0, faces: 0, memory: 0, drawCalls: 0 });
    const [chunkProgress, setChunkProgress] = useState({ loaded: 0, total: 0 });
    
    // 工具状态
    const [activeTool, setActiveTool] = useState<'none' | 'measure' | 'clip' | 'settings' | 'export'>('none');
    
    // Measure State
    const [measureType, setMeasureType] = useState<MeasureType>('none');
    // 存储历史记录: { id, type, val }
    const [measureHistory, setMeasureHistory] = useState<any[]>([]);

    const [clipEnabled, setClipEnabled] = useState(false);
    const [clipValues, setClipValues] = useState({ x: [0, 100], y: [0, 100], z: [0, 100] });
    const [clipActive, setClipActive] = useState({ x: false, y: false, z: false });

    // Toolbar State - 从localStorage恢复状态
    const [pickEnabled, setPickEnabled] = useState(() => {
        try {
            return localStorage.getItem('3dbrowser_pickEnabled') === 'true';
        } catch {
            return false;
        }
    });
    const [showStats, setShowStats] = useState(() => {
        if (propShowStats !== undefined) return propShowStats;
        try {
            const saved = localStorage.getItem('3dbrowser_showStats');
            return saved !== null ? saved === 'true' : true;
        } catch {
            return true;
        }
    });
    const [showOutline, setShowOutline] = useState(() => {
        if (propShowOutline !== undefined) return propShowOutline;
        try {
            const saved = localStorage.getItem('3dbrowser_showOutline');
            return saved !== null ? saved === 'true' : true;
        } catch {
            return true;
        }
    });
    const [showProps, setShowProps] = useState(() => {
        if (propShowProperties !== undefined) return propShowProperties;
        try {
            const saved = localStorage.getItem('3dbrowser_showProps');
            return saved !== null ? saved === 'true' : true;
        } catch {
            return true;
        }
    });

    // Settings State (mirrors SceneManager) - 从localStorage恢复
    const [sceneSettings, setSceneSettings] = useState<SceneSettings>(() => {
        let baseSettings = {
            ambientInt: 2.0,
            dirInt: 1.0,
            bgColor: theme.canvasBg,
            enableInstancing: true,
            viewCubeSize: 100,
        };
        try {
            const saved = localStorage.getItem('3dbrowser_sceneSettings');
            if (saved) {
                const parsed = JSON.parse(saved);
                baseSettings = {
                    ambientInt: typeof parsed.ambientInt === 'number' ? parsed.ambientInt : 2.0,
                    dirInt: typeof parsed.dirInt === 'number' ? parsed.dirInt : 1.0,
                    bgColor: typeof parsed.bgColor === 'string' ? parsed.bgColor : theme.canvasBg,
                    enableInstancing: typeof parsed.enableInstancing === 'boolean' ? parsed.enableInstancing : true,
                    viewCubeSize: typeof parsed.viewCubeSize === 'number' ? parsed.viewCubeSize : 100,
                };
            }
        } catch (e) { console.error("Failed to load sceneSettings", e); }
        
        return initialSettings ? { ...baseSettings, ...initialSettings } : baseSettings;
    });

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
    const visibilityDebounce = useRef<any>(null);

    // Error State
    const [errorState, setErrorState] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        detail?: string;
    }>({ isOpen: false, title: "", message: "" });

    // Toast Message State
    const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);
    
    // 状态清理工具
    const cleanStatus = (msg: string) => {
        if (!msg) return "";
        return msg.replace(/:\s*\d+%/g, '').replace(/\(\d+%\)/g, '').replace(/\d+%/g, '').trim();
    };
    
    // 全局错误捕获
    useEffect(() => {
        const handleError = (event: ErrorEvent) => {
            console.error("Global Error:", event.error);
            setErrorState({
                isOpen: true,
                title: t("failed"),
                message: event.message || "An unexpected error occurred"
            });
        };
        const handleRejection = (event: PromiseRejectionEvent) => {
            console.error("Unhandled Rejection:", event.reason);
            setErrorState({
                isOpen: true,
                title: t("failed"),
                message: event.reason?.message || String(event.reason) || "A promise was rejected without reason"
            });
        };
        window.addEventListener('error', handleError);
        window.addEventListener('unhandledrejection', handleRejection);
        return () => {
            window.removeEventListener('error', handleError);
            window.removeEventListener('unhandledrejection', handleRejection);
        };
    }, [lang]);

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const t = useCallback((key: string) => getTranslation(lang, key), [lang]);

    // 持久化主题和语言设置
    useEffect(() => {
        try {
            localStorage.setItem('3dbrowser_themeMode', themeMode);
        } catch (e) { console.error("Failed to save themeMode", e); }
    }, [themeMode]);

    useEffect(() => {
        try {
            localStorage.setItem('3dbrowser_lang', lang);
        } catch (e) { console.error("Failed to save lang", e); }
    }, [lang]);

    useEffect(() => {
        try {
            localStorage.setItem('3dbrowser_fontFamily', fontFamily);
        } catch (e) { console.error("Failed to save fontFamily", e); }
    }, [fontFamily]);

    // 持久化场景设置
    useEffect(() => {
        try {
            localStorage.setItem('3dbrowser_sceneSettings', JSON.stringify(sceneSettings));
        } catch (e) { console.error("Failed to save sceneSettings", e); }
    }, [sceneSettings]);

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

    // --- 视口稳健自适应 ---
    // 1. 使用 ResizeObserver 处理容器尺寸变化
    useEffect(() => {
        if (!viewportRef.current || !sceneMgr.current) return;
        
        const observer = new ResizeObserver(() => {
             sceneMgr.current?.resize();
        });
        
        observer.observe(viewportRef.current);

        // 全局拖拽支持
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
                const supportedExtensions = ['.lmb', '.lmbz', '.glb', '.gltf', '.ifc', '.nbim', '.fbx', '.obj', '.stl', '.ply', '.3ds', '.dae', '.stp', '.step', '.igs', '.iges'];
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
            observer.disconnect();
            window.removeEventListener('dragover', handleDragOver);
            window.removeEventListener('drop', handleDrop);
        };
    }, [lang, allowDragOpen]);

    // 2. 当布局状态变化时强制触发一次 resize（修复“场景未占满剩余空间”的问题）
    useEffect(() => {
        if (sceneMgr.current) {
            // Use requestAnimationFrame to ensure the DOM reflow has completed
            requestAnimationFrame(() => {
                sceneMgr.current?.resize();
            });
        }
    }, [showOutline, showProps, leftWidth, rightWidth]);

    // 当主题变化时更新场景背景色
    useEffect(() => {
        // If user hasn't manually overridden bg, follow theme
        if (sceneSettings.bgColor === themes[themeMode === 'light' ? 'dark' : 'light'].canvasBg) {
             const newBg = theme.canvasBg;
             handleSettingsUpdate({ bgColor: newBg });
        }
    }, [themeMode]);

    // 界面状态保存
    useEffect(() => {
        try {
            localStorage.setItem('3dbrowser_pickEnabled', String(pickEnabled));
        } catch (e) {
            console.warn('无法保存pickEnabled状态', e);
        }
    }, [pickEnabled]);

    useEffect(() => {
        try {
            localStorage.setItem('3dbrowser_showStats', String(showStats));
        } catch (e) {
            console.warn('无法保存showStats状态', e);
        }
    }, [showStats]);

    useEffect(() => {
        try {
            localStorage.setItem('3dbrowser_showOutline', String(showOutline));
        } catch (e) {
            console.warn('无法保存showOutline状态', e);
        }
    }, [showOutline]);

    useEffect(() => {
        try {
            localStorage.setItem('3dbrowser_showProps', String(showProps));
        } catch (e) {
            console.warn('无法保存showProps状态', e);
        }
    }, [showProps]);

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

        const convertNode = (node: any, depth = 0, isFileNode = false): any => {
            return {
                uuid: node.id,
                name: node.name,
                type: node.type === 'Mesh' ? 'MESH' : 'GROUP',
                depth,
                children: (node.children || []).map((c: any) => convertNode(c, depth + 1, isFileNode)),
                expanded: depth < 1,
                visible: node.visible !== false,
                object: node,
                isFileNode
            };
        };

        // 只显示 Root 的子节点，从而移除 Root 和 ImportedModels 这一层
        const roots: any[] = [];
        (root.children || []).forEach((c: any) => {
            if (c.name === "ImportedModels" || c.name === "Tilesets") {
                // 如果是这两个容器，则将其子节点作为顶级节点，从而移除容器层
                (c.children || []).forEach((child: any) => {
                    roots.push(convertNode(child, 0, true));
                });
            } else {
                roots.push(convertNode(c, 0, true));
            }
        });
        
        setTreeRoot(roots);
    }, [])

    const handleToggleVisibility = (uuid: string, visible: boolean) => {
        if (!sceneMgr.current) return;
        
        sceneMgr.current.setObjectVisibility(uuid, visible);

        // 使用 updateTree 同步最新的结构树状态
        updateTree();
    };

    const handleDeleteObject = (uuid: string) => {
        if (!sceneMgr.current) return;
        
        const obj = sceneMgr.current.contentGroup.getObjectByProperty("uuid", uuid);
        const node = sceneMgr.current.nodeMap.get(uuid);

        if (obj || node) {
            const name = (obj as any)?.name || (node as any)?.name || "Item";
            
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
                        if (selectedUuid === uuid) {
                            setSelectedUuid(null);
                            setSelectedProps(null);
                            sceneMgr.current?.highlightObject(null);
                        }

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

    // --- Scene Initialization ---
    useEffect(() => {
        if (!canvasRef.current) return;
        
        const manager = new SceneManager(canvasRef.current);
        sceneMgr.current = manager;
        setMgrInstance(manager);
        
        if (onLoad) onLoad(manager);

        // Initial setup
        manager.updateSettings(sceneSettings);
        manager.resize();

        // 监听分块加载进度
        let lastReportedSuccess = false;
        manager.onChunkProgress = (loaded, total) => {
            setChunkProgress({ loaded, total });
            if (loaded === total && total > 0) {
                if (!lastReportedSuccess) {
                    setToast({ message: t("all_chunks_loaded"), type: 'success' });
                    lastReportedSuccess = true;
                }
            } else {
                lastReportedSuccess = false;
            }
        };

        // 监听瓦片更新（防抖刷新树）
        let debounceTimer: any;
        manager.onTilesUpdate = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                 updateTree();
            }, 500);
        };

        const statsInterval = setInterval(() => {
            if(manager) setStats(manager.getStats());
        }, 1000);

        return () => {
            clearInterval(statsInterval);
            manager.dispose();
        };
    }, []); 

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
                            if(msg) setStatus(cleanStatus(msg));
                        });
                        updateTree();
                        setStatus(t("tileset_loaded"));
                        setTimeout(() => mgrInstance?.fitView(), 500);
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

        const handleClick = (e: MouseEvent) => {
            // 测量点击
            if (activeTool === 'measure' && measureType !== 'none') {
                const intersect = mgr.getRayIntersects(e.clientX, e.clientY);
                if (intersect) {
                    const record = mgr.addMeasurePoint(intersect.point);
                    if (record) {
                        // 当前段测量完成
                        const localizedRecord = {...record, type: (t as any)[`measure_${record.type}`] || record.type };
                        setMeasureHistory(prev => [localizedRecord, ...prev]);
                    }
                }
                return;
            }
            if(pickEnabled) {
                const result = mgr.pick(e.clientX, e.clientY);
                handleSelect(result ? result.object : null, result ? result.intersect : null);
            }
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (activeTool === 'measure') {
                mgr.updateMeasureHover(e.clientX, e.clientY);
                return;
            }
            mgr.highlightObject(selectedUuid);
        };

        canvas.addEventListener("click", handleClick);
        canvas.addEventListener("mousemove", handleMouseMove);

        return () => {
            canvas.removeEventListener("click", handleClick);
            canvas.removeEventListener("mousemove", handleMouseMove);
        };
    }, [pickEnabled, selectedUuid, activeTool, measureType]);

    // 工具状态同步
    useEffect(() => {
        const mgr = sceneMgr.current;
        if (!mgr) return;

        // 清理非当前工具的状态
        if (activeTool !== 'measure') {
            mgr.clearMeasurementPreview();
            setMeasureType('none');
        }

        if (activeTool !== 'clip') {
            mgr.setClippingEnabled(false);
            setClipEnabled(false);
        }
    }, [activeTool]);

    // 设置同步
    const handleSettingsUpdate = (newSettings: Partial<SceneSettings>) => {
        const merged = { ...sceneSettings, ...newSettings };
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
                const box = sceneMgr.current.computeTotalBounds();
                if (!box.isEmpty()) {
                    sceneMgr.current.updateClippingPlanes(box, clipValues, clipActive);
                }
            }
        }
    }, [clipEnabled, clipValues, clipActive, activeTool]);


    // --- 处理函数 ---

    const handleSelect = async (obj: any, intersect?: THREE.Intersection | null) => {
        if (!sceneMgr.current) return;
        
        if (!obj) {
            setSelectedUuid(null);
            setSelectedProps(null);
            sceneMgr.current.highlightObject(null);
            return;
        }

        // 统一处理 UUID (兼容 Object3D 和 StructureTreeNode)
        const uuid = obj.uuid || obj.id;
        if (!uuid) return;

        setSelectedUuid(uuid);
        sceneMgr.current.highlightObject(uuid);
        
        if (propOnSelect) propOnSelect(uuid, obj);
        
        // 尝试获取真实的 Object3D 以获得更多几何信息
        let realObj = obj instanceof THREE.Object3D ? obj : sceneMgr.current.contentGroup.getObjectByProperty("uuid", uuid);
        
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
        basicProps[t("prop_id")] = uuid.substring(0, 8) + "..."; 
        
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

        setSelectedProps(finalProps);
    };

    const processFiles = async (items: (File | string)[]) => {
        if (!items.length || !sceneMgr.current) return;
        console.log("[ThreeViewer] processFiles called with", items.length, "items");
        setLoading(true);
        setStatus(t("loading"));
        setProgress(0);
        
        try {
            // 分离 nbim 和其他文件
            const nbimItems: (File | string)[] = [];
            const otherItems: (File | string)[] = [];

            for (const item of items) {
                const path = typeof item === 'string' ? item.split('?')[0].split('#')[0] : item.name;
                if (path.toLowerCase().endsWith('.nbim')) {
                    nbimItems.push(item);
                } else {
                    otherItems.push(item);
                }
            }
            
            console.log("[ThreeViewer] nbimItems:", nbimItems.length, "otherItems:", otherItems.length);

            // 处理 nbim 文件
            for (const item of nbimItems) {
                if (sceneMgr.current) {
                    if (typeof item === 'string') {
                        console.log("[ThreeViewer] Fetching NBIM URL:", item);
                        const response = await fetch(item);
                        if (!response.ok) throw new Error(`HTTP ${response.status} when fetching NBIM`);
                        const blob = await response.blob();
                        const fileName = item.split('?')[0].split('#')[0].split('/').pop() || 'model.nbim';
                        const file = new File([blob], fileName);
                        await (sceneMgr.current as any).loadNbim(file, (p: number, msg: string) => {
                            setProgress(p);
                            if(msg) setStatus(cleanStatus(msg));
                        });
                    } else {
                        console.log("[ThreeViewer] Loading NBIM File:", item.name);
                        await (sceneMgr.current as any).loadNbim(item, (p: number, msg: string) => {
                            setProgress(p);
                            if(msg) setStatus(cleanStatus(msg));
                        });
                    }
                }
            }

            // 处理其他模型文件 (glb, ifc, etc.)
            if (otherItems.length > 0) {
                console.log("[ThreeViewer] Loading other model files via loadModelFiles...");
                const loadedObjects = await loadModelFiles(
                    otherItems, 
                    (p, msg) => {
                        setProgress(p);
                        if(msg) setStatus(cleanStatus(msg));
                    }, 
                    t,
                    sceneSettings, // Pass settings
                    libPath
                );
                console.log("[ThreeViewer] loadModelFiles returned", loadedObjects.length, "objects");
                for (const obj of loadedObjects) {
                    await sceneMgr.current.addModel(obj);
                }
            }
            
            updateTree();
            setStatus(t("success"));
            console.log("[ThreeViewer] processFiles completed successfully");
            setTimeout(() => sceneMgr.current?.fitView(), 100);
        } catch (err) {
            console.error("[ThreeViewer] processFiles error:", err); 
            setStatus(t("failed")); 
            setToast({ message: `${t("failed")}: ${(err as Error).message}`, type: 'error' });
        } finally { 
            setLoading(false); 
        }
    };

    const handleOpenFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        await processFiles(Array.from(e.target.files));
        e.target.value = ""; 
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
                        if(msg) setStatus(cleanStatus(msg));
                    });
                    updateTree();
                    setStatus(t("tileset_loaded"));
                    setTimeout(() => sceneMgr.current?.fitView(), 500);
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
            const supportedExtensions = ['.lmb', '.lmbz', '.glb', '.gltf', '.ifc', '.nbim', '.fbx', '.obj', '.stl', '.ply', '.3mf', '.stp', '.step', '.igs', '.iges'];
            
            const validFiles = files.filter((file: File) => {
                const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
                return supportedExtensions.includes(ext);
            });

            if (validFiles.length < files.length) {
                setToast({ message: t("unsupported_format"), type: 'warning' });
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
                    if(msg) setStatus(cleanStatus(msg));
                }, 
                t
            );
            if (url) {
                sceneMgr.current.addTileset(url, (p, msg) => {
                    setProgress(p);
                    if(msg) setStatus(cleanStatus(msg));
                });
                updateTree(); // Tileset root added to tree
                setStatus(t("tileset_loaded"));
                setTimeout(() => sceneMgr.current?.fitView(), 500);
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
        const modelsToExport = content.children.filter(c => !c.userData.isOptimizedGroup && c.name !== "TilesRenderer");
        if (modelsToExport.length === 0) { 
            setToast({ message: t("no_models"), type: 'info' });
            return; 
        }

        // 创建一个临时组用于导出，包含所有要导出的模型
        const exportGroup = new THREE.Group();
        modelsToExport.forEach(m => exportGroup.add(m.clone()));
        
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
                        setStatus(cleanStatus(msg));
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
                    blob = await exportLMB(exportGroup, (msg) => setStatus(cleanStatus(msg)));
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
                    setSelectedUuid(null);
                    setSelectedProps(null);
                    setMeasureHistory([]);
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

    return (
        <ErrorBoundary t={t} styles={styles} theme={theme}>
            <div 
                style={styles.container}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
             <GlobalStyle theme={theme} fontFamily={fontFamily} />

             <MenuBar 
                t={t}
                themeType={themeMode}
                setThemeType={setThemeMode}
                handleOpenFiles={handleOpenFiles}
                handleOpenFolder={handleOpenFolder}
                handleOpenUrl={handleOpenUrl}
                handleView={handleView}
                handleClear={handleClear}
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
                styles={styles}
                theme={theme}
                disabledMenus={disabledMenus}
                hiddenMenus={hiddenMenus}
                onOpenAbout={() => setIsAboutOpen(true)}
             />

             {/* Main Content Area: Flex Row */}
             <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
                
                {/* Left Sidebar: Outline */}
                {showOutline && (
                    <div style={{ 
                        width: `${leftWidth}px`, 
                        backgroundColor: theme.panelBg, 
                        borderRight: `1px solid ${theme.border}`,
                        display: 'flex',
                        flexDirection: 'column',
                        zIndex: 10,
                        position: 'relative'
                    }}>
                        <div style={styles.floatingHeader}>
                            <span>{t("interface_outline")}</span>
                            <div 
                                onClick={() => setShowOutline(false)} 
                                style={{ cursor: 'pointer', opacity: 0.6, display:'flex', padding: 2, borderRadius: '50%' }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <IconClose width={16} height={16} />
                            </div>
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <SceneTree 
                                t={t}
                                sceneMgr={sceneMgr.current} 
                                treeRoot={treeRoot} 
                                setTreeRoot={setTreeRoot} 
                                selectedUuid={selectedUuid}
                                onSelect={(uuid, obj) => handleSelect(obj)}
                                onToggleVisibility={handleToggleVisibility}
                                onDelete={handleDeleteObject}
                                styles={styles}
                                theme={theme}
                            />
                        </div>
                        {/* Resize handle */}
                        <div 
                            onMouseDown={() => resizingLeft.current = true}
                            style={{ 
                                position: 'absolute', right: -2, top: 0, bottom: 0, width: 4, 
                                cursor: 'col-resize', zIndex: 20 
                            }} 
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
                    
                    <ViewCube sceneMgr={mgrInstance} theme={theme} />

                    {/* Toast Notification */}
                    {toast && (
                        <div style={{
                            position: 'fixed',
                            top: '140px', // 位于菜单栏下方
                            left: '50%',
                            transform: 'translateX(-50%)',
                            backgroundColor: toast.type === 'error' ? theme.danger : (toast.type === 'success' ? theme.accent : theme.panelBg),
                            color: toast.type === 'info' ? theme.text : '#fff',
                            padding: '12px 20px 12px 24px',
                            borderRadius: '4px', // 稍微增加一点圆角，更现代
                            boxShadow: `0 8px 24px rgba(0,0,0,0.25)`,
                            zIndex: 10000,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            fontSize: '14px',
                            borderLeft: `4px solid rgba(255,255,255,0.4)`, 
                            animation: 'fadeInDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
                        }}>
                            <span>{toast.message}</span>
                            <div 
                                onClick={() => setToast(null)}
                                style={{ 
                                    cursor: 'pointer', 
                                    padding: '4px', 
                                    display: 'flex', 
                                    borderRadius: '50%',
                                    marginLeft: '8px',
                                    backgroundColor: 'rgba(255,255,255,0.1)'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                            >
                                <IconClose size={14} />
                            </div>
                        </div>
                    )}

                    <LoadingOverlay t={t} loading={loading} status={status} progress={progress} styles={styles} theme={theme} />

                    {/* Overlay Panels for Tools */}
                    {activeTool === 'measure' && (
                        <MeasurePanel 
                            t={t} sceneMgr={sceneMgr.current} 
                            measureType={measureType} setMeasureType={setMeasureType}
                            measureHistory={measureHistory}
                            onDelete={(id: string) => { sceneMgr.current?.removeMeasurement(id); setMeasureHistory(prev => prev.filter(i => i.id !== id)); }}
                            onClear={() => { sceneMgr.current?.clearAllMeasurements(); setMeasureHistory([]); }}
                            onClose={() => setActiveTool('none')}
                            styles={styles} theme={theme}
                        />
                    )}

                    {activeTool === 'clip' && (
                        <ClipPanel 
                            t={t} sceneMgr={sceneMgr.current} onClose={() => setActiveTool('none')}
                            clipEnabled={clipEnabled} setClipEnabled={setClipEnabled}
                            clipValues={clipValues} setClipValues={setClipValues}
                            clipActive={clipActive} setClipActive={setClipActive}
                            styles={styles} theme={theme}
                        />
                    )}

                    {activeTool === 'export' && (
                        <ExportPanel t={t} onClose={() => setActiveTool('none')} onExport={handleExport} styles={styles} theme={theme} />
                    )}

                    {activeTool === 'settings' && (
                        <SettingsPanel 
                            t={t} onClose={() => setActiveTool('none')} settings={sceneSettings} onUpdate={handleSettingsUpdate}
                            currentLang={lang} setLang={setLang} themeMode={themeMode} setThemeMode={setThemeMode}
                            accentColor={accentColor} setAccentColor={setAccentColor}
                            showStats={showStats} setShowStats={setShowStats}
                            fontFamily={fontFamily} setFontFamily={setFontFamily}
                            styles={styles} theme={theme}
                        />
                    )}
                </div>

                {/* Right Sidebar: Properties */}
                {showProps && (
                    <div style={{ 
                        width: `${rightWidth}px`, 
                        backgroundColor: theme.panelBg, 
                        borderLeft: `1px solid ${theme.border}`,
                        display: 'flex',
                        flexDirection: 'column',
                        zIndex: 10,
                        position: 'relative'
                    }}>
                        <div style={styles.floatingHeader}>
                            <span>{t("interface_props")}</span>
                            <div 
                                onClick={() => setShowProps(false)} 
                                style={{ cursor: 'pointer', opacity: 0.6, display:'flex', padding: 2, borderRadius: '50%' }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <IconClose width={16} height={16} />
                            </div>
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <PropertiesPanel t={t} selectedProps={selectedProps} styles={styles} theme={theme} />
                        </div>
                        {/* Resize handle */}
                        <div 
                            onMouseDown={() => resizingRight.current = true}
                            style={{ 
                                position: 'absolute', left: -2, top: 0, bottom: 0, width: 4, 
                                cursor: 'col-resize', zIndex: 20 
                            }} 
                        />
                    </div>
                )}
             </div>

             {/* Bottom Status Bar */}
             <div style={{
                height: '24px',
                backgroundColor: theme.accent,
                color: 'white', 
                display: 'flex',
                alignItems: 'center',
                padding: '0 12px',
                fontSize: '11px',
                zIndex: 1000,
                justifyContent: 'space-between'
             }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span>{status}</span>
                    {loading && <span>{progress}%</span>}
                    {chunkProgress.total > 0 && (
                        <span style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px',
                            paddingLeft: '8px', 
                            borderLeft: '1px solid rgba(255,255,255,0.3)' 
                        }}>
                            {t("loading_chunks")}: {chunkProgress.loaded} / {chunkProgress.total}
                            {chunkProgress.loaded < chunkProgress.total && (
                                <div style={{ 
                                    width: '40px', 
                                    height: '4px', 
                                    backgroundColor: 'rgba(255,255,255,0.2)', 
                                    borderRadius: '2px',
                                    overflow: 'hidden'
                                }}>
                                    <div style={{ 
                                        width: `${(chunkProgress.loaded / chunkProgress.total) * 100}%`, 
                                        height: '100%', 
                                        backgroundColor: '#fff' 
                                    }} />
                                </div>
                            )}
                        </span>
                    )}
                    {selectedUuid && (
                        <span style={{ opacity: 0.8, paddingLeft: '8px', borderLeft: '1px solid rgba(255,255,255,0.3)' }}>
                            {t("prop_id")}: {selectedUuid.substring(0, 8)}...
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    {showStats && (
                        <>
                            <span>{formatNumber(stats.meshes)} {t("monitor_meshes")}</span>
                            <span>{formatNumber(stats.faces)} {t("monitor_faces")}</span>
                            <span>{formatMemory(stats.memory)}</span>
                            <span>{stats.drawCalls} {t("monitor_calls")}</span>
                        </>
                    )}
                    <div style={{ width: '1px', height: '12px', backgroundColor: 'rgba(255,255,255,0.3)' }} />
                    <div style={{ opacity: 0.9 }}>{lang === 'zh' ? '简体中文' : 'English'}</div>
                    
                    {/* Website Title/Logo */}
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        marginLeft: '8px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(255,255,255,0.1)'
                    }}>
                        <span style={{ fontWeight: '600', letterSpacing: '0.5px' }}>3D BROWSER</span>
                    </div>
                </div>
             </div>

             <ConfirmModal 
                isOpen={confirmState.isOpen} title={confirmState.title} message={confirmState.message}
                onConfirm={() => { confirmState.action(); setConfirmState({...confirmState, isOpen: false}); }}
                onCancel={() => setConfirmState({...confirmState, isOpen: false})}
                t={t} styles={styles} theme={theme}
             />

             <AboutModal 
                isOpen={isAboutOpen} 
                onClose={() => setIsAboutOpen(false)} 
                t={t} styles={styles} theme={theme} 
             />

             {/* Error Modal */}
             {errorState.isOpen && (
                <div style={styles.modalOverlay}>
                    <div style={{ ...styles.modalContent, width: '450px' }}>
                        <div style={{ ...styles.floatingHeader, backgroundColor: theme.danger, color: 'white' }}>
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
                                    style={{ ...styles.btn, backgroundColor: theme.accent, color: 'white', borderColor: theme.accent, padding: '8px 24px' }}
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
