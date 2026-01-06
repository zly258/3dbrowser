import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
import { MeasurePanel, ClipPanel, ExplodePanel, ExportPanel, ViewsPanel, FloatingPanel } from "./src/components/ToolPanels";
import { SettingsPanel } from "./src/components/SettingsPanel";
import { LoadingOverlay } from "./src/components/LoadingOverlay";
import { PropertiesPanel } from "./src/components/PropertiesPanel";
import { ConfirmModal } from "./src/components/ConfirmModal";
import { IconClose } from "./src/theme/Icons";

// --- 全局样式注入 ---
const GlobalStyle = ({ theme }: { theme: ThemeColors }) => (
    <style dangerouslySetInnerHTML={{ __html: createGlobalStyle(theme) }} />
);

// --- 主应用 ---
const App = () => {
    // 主题状态 - 从localStorage恢复
    const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => {
        try {
            const saved = localStorage.getItem('3dbrowser_themeMode');
            return (saved === 'dark' || saved === 'light') ? saved : 'dark';
        } catch {
            return 'dark';
        }
    });
    const theme = themes[themeMode];
    const styles = useMemo(() => createStyles(theme), [themeMode]);

    // 语言状态 - 从localStorage恢复
    const [lang, setLang] = useState<Lang>(() => {
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
    
    // 工具状态
    const [activeTool, setActiveTool] = useState<'none' | 'measure' | 'clip' | 'explode' | 'settings' | 'export' | 'views'>('none');
    
    // Measure State
    const [measureType, setMeasureType] = useState<MeasureType>('none');
    // 存储历史记录: { id, type, val }
    const [measureHistory, setMeasureHistory] = useState<any[]>([]);

    const [clipEnabled, setClipEnabled] = useState(false);
    const [clipValues, setClipValues] = useState({ x: [0, 100], y: [0, 100], z: [0, 100] });
    const [clipActive, setClipActive] = useState({ x: false, y: false, z: false });
    const [explodeFactor, setExplodeFactor] = useState(0);

    // Toolbar State - 从localStorage恢复状态
    const [pickEnabled, setPickEnabled] = useState(() => {
        try {
            return localStorage.getItem('3dbrowser_pickEnabled') === 'true';
        } catch {
            return false;
        }
    });
    const [showStats, setShowStats] = useState(() => {
        try {
            const saved = localStorage.getItem('3dbrowser_showStats');
            return saved !== null ? saved === 'true' : true;
        } catch {
            return true;
        }
    });
    const [showOutline, setShowOutline] = useState(() => {
        try {
            const saved = localStorage.getItem('3dbrowser_showOutline');
            return saved !== null ? saved === 'true' : true;
        } catch {
            return true;
        }
    });
    const [showProps, setShowProps] = useState(() => {
        try {
            const saved = localStorage.getItem('3dbrowser_showProps');
            return saved !== null ? saved === 'true' : true;
        } catch {
            return true;
        }
    });

    // Settings State (mirrors SceneManager) - 从localStorage恢复
    const [sceneSettings, setSceneSettings] = useState<SceneSettings>(() => {
        try {
            const saved = localStorage.getItem('3dbrowser_sceneSettings');
            if (saved) {
                const parsed = JSON.parse(saved);
                return {
                    ambientInt: typeof parsed.ambientInt === 'number' ? parsed.ambientInt : 2.0,
                    dirInt: typeof parsed.dirInt === 'number' ? parsed.dirInt : 1.0,
                    bgColor: typeof parsed.bgColor === 'string' ? parsed.bgColor : theme.canvasBg,
                    wireframe: typeof parsed.wireframe === 'boolean' ? parsed.wireframe : false,
                    progressive: typeof parsed.progressive === 'boolean' ? parsed.progressive : true,
                    hideRatio: typeof parsed.hideRatio === 'number' ? parsed.hideRatio : 0.6,
                    progressiveThreshold: typeof parsed.progressiveThreshold === 'number' ? parsed.progressiveThreshold : 15000,
                    sse: typeof parsed.sse === 'number' ? parsed.sse : 16,
                    maxMemory: typeof parsed.maxMemory === 'number' ? parsed.maxMemory : 500,
                    importAxisGLB: typeof parsed.importAxisGLB === 'string' ? parsed.importAxisGLB : '+y',
                    importAxisIFC: typeof parsed.importAxisIFC === 'string' ? parsed.importAxisIFC : '+z',
                };
            }
        } catch (e) { console.error("Failed to load sceneSettings", e); }
        return {
            ambientInt: 2.0,
            dirInt: 1.0,
            bgColor: theme.canvasBg,
            wireframe: false,
            progressive: true,
            hideRatio: 0.6,
            progressiveThreshold: 15000,
            sse: 16,
            maxMemory: 500,
            importAxisGLB: '+y',
            importAxisIFC: '+z',
        };
    });

    // Confirmation Modal State
    const [confirmState, setConfirmState] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        action: () => void;
    }>({ isOpen: false, title: "", message: "", action: () => {} });

    // Layout State (Resizable Panels)
    const [leftWidth, setLeftWidth] = useState(260);
    const [rightWidth, setRightWidth] = useState(300);
    const resizingLeft = useRef(false);
    const resizingRight = useRef(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const sceneMgr = useRef<SceneManager | null>(null);
    const visibilityDebounce = useRef<any>(null);

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

    // --- 视口稳健自适应 ---
    // 1. 使用 ResizeObserver 处理容器尺寸变化
    useEffect(() => {
        if (!viewportRef.current || !sceneMgr.current) return;
        
        const observer = new ResizeObserver(() => {
             sceneMgr.current?.resize();
        });
        
        observer.observe(viewportRef.current);
        return () => observer.disconnect();
    }, []);

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
    const updateTree = useCallback(() => {
        if (!sceneMgr.current) return;
        
        // 使用 SceneManager 中维护的结构树
        const root = sceneMgr.current.structureRoot;
        if (!root) {
            setTreeRoot([]);
            return;
        }

        // 将 StructureTreeNode 转换为 SceneTree 需要的 TreeNode 格式
        const convertNode = (node: any, depth = 0): any => {
            return {
                uuid: node.id,
                name: node.name,
                type: node.type === 'Mesh' ? 'MESH' : 'GROUP',
                depth,
                children: (node.children || []).map((c: any) => convertNode(c, depth + 1)),
                expanded: depth < 2,
                visible: node.visible !== false,
                object: node // 这里的 object 引用 StructureTreeNode
            };
        };

        setTreeRoot([convertNode(root)]);
    }, []);

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
                action: () => {
                    // Use SceneManager's removeObject for clean removal
                    // SceneManager 内部会处理资源释放和结构树同步
                    sceneMgr.current?.removeObject(uuid);

                    // If it's the tiles renderer logic wrapped
                    if (sceneMgr.current?.tilesRenderer && sceneMgr.current.tilesRenderer.group === obj) {
                        sceneMgr.current.tilesRenderer.dispose();
                        sceneMgr.current.tilesRenderer = null;
                    }
                    
                    // If selected, deselect
                    if (selectedUuid === uuid) {
                        setSelectedUuid(null);
                        setSelectedProps(null);
                        sceneMgr.current?.highlightObject(null);
                    }

                    // Refresh tree
                    updateTree();
                }
            });
        }
    };

    // --- Scene Initialization ---
    useEffect(() => {
        if (!canvasRef.current) return;
        
        const manager = new SceneManager(canvasRef.current);
        sceneMgr.current = manager;
        // Initial setup
        manager.updateSettings(sceneSettings);
        manager.resize();

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

        if (activeTool !== 'explode') {
            mgr.setExplodeFactor(0);
            setExplodeFactor(0);
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

    // 爆炸参数更新
    useEffect(() => {
        if (activeTool === 'explode' && sceneMgr.current) {
            sceneMgr.current.setExplodeFactor(explodeFactor / 100);
        }
    }, [explodeFactor, activeTool]);


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

    const handleOpenFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length || !sceneMgr.current) return;
        const files = Array.from(e.target.files) as File[];
        setLoading(true);
        setStatus(t("loading"));
        setProgress(0);
        
        try {
            // 分离 nbim 和其他文件
            const nbimFiles = files.filter(f => f.name.toLowerCase().endsWith('.nbim'));
            const otherFiles = files.filter(f => !f.name.toLowerCase().endsWith('.nbim'));

            // 处理 nbim 文件
            for (const file of nbimFiles) {
                if (sceneMgr.current) {
                    await (sceneMgr.current as any).loadNbim(file, (p: number, msg: string) => {
                        setProgress(p);
                        if(msg) setStatus(msg);
                    });
                }
            }

            // 处理其他模型文件 (glb, ifc, etc.)
            if (otherFiles.length > 0) {
                const group = await loadModelFiles(
                    otherFiles, 
                    (p, msg) => {
                        setProgress(p);
                        if(msg) setStatus(msg);
                    }, 
                    t,
                    sceneSettings // Pass settings
                );
                sceneMgr.current.addModel(group);
            }
            
            updateTree();
            setStatus(t("success"));
            setTimeout(() => sceneMgr.current?.fitView(), 100);
        } catch (err) {
            console.error(err); 
            setStatus(t("failed")); 
        } finally { 
            setLoading(false); 
            e.target.value = ""; 
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
                    if(msg) setStatus(msg);
                }, 
                t
            );
            if (url) {
                sceneMgr.current.addTileset(url);
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
        const models = content.getObjectByName("ImportedModels");
        
        // NBIM 导出直接由 SceneManager 处理
        if (format === 'nbim') {
            if (content.children.length === 0) { alert(t("no_models")); return; }
            setLoading(true);
            setStatus(t("processing") + "...");
            setActiveTool('none');
            setTimeout(async () => {
                try {
                    await sceneMgr.current?.exportNbim();
                    setStatus(t("success"));
                } catch (e) {
                    console.error(e);
                    setStatus(t("failed") + ": " + (e as Error).message);
                } finally {
                    setLoading(false);
                }
            }, 100);
            return;
        }

        if (!models || models.children.length === 0) { alert(t("no_models")); return; }
        
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
                        alert(t("select_output"));
                        throw new Error("Browser does not support directory picker");
                    }
                    // @ts-ignore
                    const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
                    const filesMap = await convertLMBTo3DTiles(models, (msg) => {
                        setStatus(msg);
                        if (msg.includes('%')) {
                            const p = parseInt(msg.match(/(\d+)%/)?.[1] || "0");
                            setProgress(p);
                        }
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
                    alert(t("success"));
                    return;
                } else if (format === 'glb') {
                    blob = await exportGLB(models);
                } else if (format === 'lmb') {
                    blob = await exportLMB(models, (msg) => setStatus(msg));
                }

                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = filename;
                    a.click();
                    URL.revokeObjectURL(url);
                    setStatus(t("success"));
                }
            } catch(e) {
                console.error(e); 
                setStatus(t("failed") + ": " + (e as Error).message);
            } finally {
                setLoading(false);
                setProgress(0);
            }
        }, 100);
    };

    const handleView = (v: any) => { sceneMgr.current?.setView(v); };
    
    // Update handleClear to use custom modal
    const handleClear = () => {
        setConfirmState({
            isOpen: true,
            title: t("op_clear"),
            message: t("confirm_clear"),
            action: () => {
                sceneMgr.current?.clear();
                setTreeRoot([]);
                setSelectedUuid(null);
                setSelectedProps(null);
                setMeasureHistory([]);
            }
        });
    };

    const confirmAction = () => {
        confirmState.action();
        setConfirmState({...confirmState, isOpen: false});
    };

    return (
        <div style={styles.container}>
             <GlobalStyle theme={theme} />

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
                        <div style={{ 
                            padding: '12px 16px', 
                            borderBottom: `1px solid ${theme.border}`, 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            fontWeight: '600'
                        }}>
                            <span>{t("interface_outline")}</span>
                            <div 
                                onClick={() => setShowOutline(false)} 
                                style={{ cursor: 'pointer', opacity: 0.6, display:'flex', padding: 2, borderRadius: 4 }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <IconClose width={20} height={20} />
                            </div>
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <SceneTree 
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
                    
                    {/* Stats HUD (Top Center) */}
                    {showStats && (
                        <div style={styles.statsOverlay}>
                            <div style={styles.statsRow}>
                                <span style={{color: theme.textMuted}}>{t("monitor_meshes")}:</span>
                                <span style={{fontWeight: 600}}>{stats.meshes}</span>
                            </div>
                            <div style={styles.statsDivider}></div>
                            <div style={styles.statsRow}>
                                <span style={{color: theme.textMuted}}>{t("monitor_faces")}:</span>
                                <span style={{fontWeight: 600}}>{(stats.faces/1000).toFixed(1)}k</span>
                            </div>
                            <div style={styles.statsDivider}></div>
                            <div style={styles.statsRow}>
                                <span style={{color: theme.textMuted}}>{t("monitor_mem")}:</span>
                                <span style={{fontWeight: 600}}>{stats.memory} MB</span>
                            </div>
                            <div style={styles.statsDivider}></div>
                            <div style={styles.statsRow}>
                                <span style={{color: theme.textMuted}}>{t("monitor_calls")}:</span>
                                <span style={{fontWeight: 600}}>{stats.drawCalls}</span>
                            </div>
                        </div>
                    )}

                    <LoadingOverlay loading={loading} status={status} progress={progress} styles={styles} theme={theme} />

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

                    {activeTool === 'explode' && (
                        <ExplodePanel t={t} onClose={() => setActiveTool('none')} explodeFactor={explodeFactor} setExplodeFactor={setExplodeFactor} styles={styles} theme={theme} />
                    )}

                    {activeTool === 'export' && (
                        <ExportPanel t={t} onClose={() => setActiveTool('none')} onExport={handleExport} styles={styles} theme={theme} />
                    )}

                    {activeTool === 'views' && (
                        <ViewsPanel t={t} onClose={() => setActiveTool('none')} handleView={handleView} styles={styles} theme={theme} />
                    )}

                    {activeTool === 'settings' && (
                        <SettingsPanel 
                            t={t} onClose={() => setActiveTool('none')} settings={sceneSettings} onUpdate={handleSettingsUpdate}
                            currentLang={lang} setLang={setLang} themeMode={themeMode} setThemeMode={setThemeMode}
                            showStats={showStats} setShowStats={setShowStats}
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
                        <div style={{ 
                            padding: '12px 16px', 
                            borderBottom: `1px solid ${theme.border}`, 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            fontWeight: '600'
                        }}>
                            <span>{t("interface_props")}</span>
                            <div 
                                onClick={() => setShowProps(false)} 
                                style={{ cursor: 'pointer', opacity: 0.6, display:'flex', padding: 2, borderRadius: 4 }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <IconClose width={20} height={20} />
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

             <ConfirmModal 
                isOpen={confirmState.isOpen} title={confirmState.title} message={confirmState.message}
                onConfirm={() => { confirmState.action(); setConfirmState({...confirmState, isOpen: false}); }}
                onCancel={() => setConfirmState({...confirmState, isOpen: false})}
                t={t} styles={styles} theme={theme}
             />

             {/* Bottom Dock Toolbar */}
             <MenuBar 
                t={t}
                handleOpenFiles={handleOpenFiles}
                handleOpenFolder={handleOpenFolder}
                handleConvert={() => {}} 
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
                setLang={setLang}
                sceneMgr={sceneMgr.current}
                wireframe={sceneSettings.wireframe}
                setWireframe={(v) => handleSettingsUpdate({wireframe: v})}
                styles={styles}
                theme={theme}
             />
        </div>
    );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
