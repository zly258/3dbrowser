

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import * as THREE from "three";
import { createRoot } from "react-dom/client";
import { SceneManager, MeasureType, SceneSettings } from "./SceneManager";
import { loadModelFiles, parseTilesetFromFolder } from "./loader/LoaderUtils";
import { convertLMBTo3DTiles, createZip, exportGLB, exportLMB } from "./utils/converter";
import { createStyles, createGlobalStyle, themes, ThemeColors } from "./theme/Styles";
import { getTranslation, Lang } from "./utils/Locales";

// Components
import { MenuBar } from "./components/MenuBar";
import { SceneTree, buildTree } from "./components/SceneTree";
import { MeasurePanel, ClipPanel, ExplodePanel, ExportPanel } from "./components/ToolPanels";
import { SettingsPanel } from "./components/SettingsPanel";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { ConfirmModal } from "./components/ConfirmModal";

// --- Global Style Injector ---
const GlobalStyle = ({ theme }: { theme: ThemeColors }) => (
    <style dangerouslySetInnerHTML={{ __html: createGlobalStyle(theme) }} />
);

// --- Main App ---
const App = () => {
    // Theme State
    const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
    const theme = themes[themeMode];
    const styles = useMemo(() => createStyles(theme), [themeMode]);

    // State
    const [treeRoot, setTreeRoot] = useState<any[]>([]);
    const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
    const [selectedProps, setSelectedProps] = useState<any>(null);
    const [lang, setLang] = useState<Lang>('zh');
    // Initialize status using the default language 'zh'
    const [status, setStatus] = useState(getTranslation('zh', 'ready'));
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [stats, setStats] = useState({ meshes: 0, faces: 0, memory: 0, drawCalls: 0 });
    
    // Tools State
    const [activeTool, setActiveTool] = useState<'none' | 'measure' | 'clip' | 'explode' | 'settings' | 'export'>('none');
    
    // Measure State
    const [measureType, setMeasureType] = useState<MeasureType>('none');
    // Store history: { id, type, val }
    const [measureHistory, setMeasureHistory] = useState<any[]>([]);

    const [clipEnabled, setClipEnabled] = useState(false);
    const [clipValues, setClipValues] = useState({ x: [0, 100], y: [0, 100], z: [0, 100] });
    const [clipActive, setClipActive] = useState({ x: false, y: false, z: false });
    const [explodeFactor, setExplodeFactor] = useState(0);

    // Toolbar State
    const [pickEnabled, setPickEnabled] = useState(false);
    const [showOutline, setShowOutline] = useState(true);
    const [showProps, setShowProps] = useState(true);

    // Settings State (mirrors SceneManager)
    const [sceneSettings, setSceneSettings] = useState<SceneSettings>({
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

    const t = useCallback((key: string) => getTranslation(lang, key), [lang]);

    // Update status when lang changes if status is "Ready" (or equivalent)
    useEffect(() => {
        const prevLang = lang === 'zh' ? 'en' : 'zh';
        if (status === getTranslation(prevLang, 'ready')) {
            setStatus(getTranslation(lang, 'ready'));
        }
    }, [lang]);

    // --- Resizing Logic (Panels) ---
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

    // --- Robust Viewport Resizing ---
    // 1. ResizeObserver handles general div resizing
    useEffect(() => {
        if (!viewportRef.current || !sceneMgr.current) return;
        
        const observer = new ResizeObserver(() => {
             sceneMgr.current?.resize();
        });
        
        observer.observe(viewportRef.current);
        return () => observer.disconnect();
    }, []);

    // 2. Forced resize when layout state changes (Fixes "scene doesn't occupy remaining")
    useEffect(() => {
        if (sceneMgr.current) {
            // Use requestAnimationFrame to ensure the DOM reflow has completed
            requestAnimationFrame(() => {
                sceneMgr.current?.resize();
            });
        }
    }, [showOutline, showProps, leftWidth, rightWidth]);

    // Update scene background when theme changes
    useEffect(() => {
        // If user hasn't manually overridden bg, follow theme
        if (sceneSettings.bgColor === themes[themeMode === 'light' ? 'dark' : 'light'].canvasBg) {
             const newBg = theme.canvasBg;
             handleSettingsUpdate({ bgColor: newBg });
        }
    }, [themeMode]);

    // Tree Updates
    const updateTree = useCallback(() => {
        if (!sceneMgr.current) return;
        const content = sceneMgr.current.contentGroup;
        
        let roots: any[] = [];
        // Flatten "ImportedModels" wrapper to show the actual RootNodes
        const imported = content.getObjectByName("ImportedModels");
        if (imported) {
             roots = [...roots, ...imported.children.map(c => buildTree(c))];
        }

        content.children.forEach(c => {
             if (c.name !== "ImportedModels") {
                 roots.push(buildTree(c));
             }
        });

        setTreeRoot(roots);
    }, []);

    const handleToggleVisibility = (uuid: string, visible: boolean) => {
        if (!sceneMgr.current) return;
        
        const targetObj = sceneMgr.current.contentGroup.getObjectByProperty("uuid", uuid);
        const affectedUuids = new Set<string>();
        
        const processObject = (obj: THREE.Object3D) => {
            obj.visible = visible;
            affectedUuids.add(obj.uuid);
            obj.children.forEach(child => {
                if(child.name !== "Helpers") processObject(child);
            });
        };

        if (targetObj) processObject(targetObj);

        setTreeRoot(prev => {
            const updateNode = (nodes: any[]): any[] => {
                return nodes.map(n => {
                    const shouldUpdate = affectedUuids.has(n.uuid);
                    let newChildren = n.children;
                    if (n.children.length > 0) newChildren = updateNode(n.children);
                    if (shouldUpdate) return { ...n, visible, children: newChildren };
                    return { ...n, children: newChildren };
                });
            };
            return updateNode(prev);
        });
    };

    const handleDeleteObject = (uuid: string) => {
        if (!sceneMgr.current) return;
        
        const obj = sceneMgr.current.contentGroup.getObjectByProperty("uuid", uuid);
        if (obj) {
            const name = obj.name || "Item";
            
            setConfirmState({
                isOpen: true,
                title: t("delete_item"),
                message: `${t("confirm_delete")} "${name}"?`,
                action: () => {
                    // Traverse and dispose resources to prevent memory leaks
                    obj.traverse((child: any) => {
                        if (child.isMesh) {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) {
                                if (Array.isArray(child.material)) child.material.forEach((m:any) => m.dispose());
                                else child.material.dispose();
                            }
                        }
                        if (child.isTilesRenderer) {
                             child.dispose();
                        }
                    });

                    // If it's the tiles renderer logic wrapped
                    if (sceneMgr.current?.tilesRenderer && sceneMgr.current.tilesRenderer.group === obj) {
                        sceneMgr.current.tilesRenderer.dispose();
                        sceneMgr.current.tilesRenderer = null;
                    }

                    obj.removeFromParent();
                    
                    // If selected, deselect
                    if (selectedUuid === uuid) {
                        setSelectedUuid(null);
                        setSelectedProps(null);
                        sceneMgr.current?.highlightObject(null);
                    }

                    // Refresh tree
                    updateTree();
                    // Refresh optimization cache in SceneManager
                    sceneMgr.current?.refreshMeshCache();
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

        // Hook for tiles updates
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

    // --- Logic Hooks ---

    useEffect(() => {
        const mgr = sceneMgr.current;
        if (!mgr) return;
        
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleClick = (e: MouseEvent) => {
            // Measure click
            if (activeTool === 'measure' && measureType !== 'none') {
                const intersect = mgr.getRayIntersects(e.clientX, e.clientY);
                if (intersect) {
                    const record = mgr.addMeasurePoint(intersect.point);
                    if (record) {
                        // Measurement finished for this segment
                        const localizedRecord = {...record, type: (t as any)[`measure_${record.type}`] || record.type };
                        setMeasureHistory(prev => [localizedRecord, ...prev]);
                    }
                }
                return;
            }
            // Normal Selection
            if(pickEnabled) {
                const intersect = mgr.pick(e.clientX, e.clientY);
                // Always call handleSelect, pass null if no intersect to deselect
                handleSelect(intersect ? intersect.object : null, intersect);
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
    }, [pickEnabled, selectedUuid, activeTool, measureType, t]);

    // Tool Sync
    useEffect(() => {
        const mgr = sceneMgr.current;
        if (!mgr) return;

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

    // Settings Sync
    const handleSettingsUpdate = (newSettings: Partial<SceneSettings>) => {
        const merged = { ...sceneSettings, ...newSettings };
        setSceneSettings(merged);
        if (sceneMgr.current) {
            sceneMgr.current.updateSettings(merged);
        }
    };

    // Clipping Update
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

    // Explode Update
    useEffect(() => {
        if (activeTool === 'explode' && sceneMgr.current) {
            sceneMgr.current.setExplodeFactor(explodeFactor / 100);
        }
    }, [explodeFactor, activeTool]);


    // --- Handlers ---

    const handleSelect = async (obj: any, intersect?: THREE.Intersection | null) => {
        if (!sceneMgr.current) return;
        
        if (!obj) {
            setSelectedUuid(null);
            setSelectedProps(null);
            sceneMgr.current.highlightObject(null);
            return;
        }

        setSelectedUuid(obj.uuid);
        sceneMgr.current.highlightObject(obj.uuid);
        
        const basicProps: any = {};
        const geoProps: any = {};
        const ifcProps: any = {};

        basicProps[t("prop_name")] = obj.name || "Unnamed";
        basicProps[t("prop_type")] = obj.type;
        basicProps[t("prop_id")] = obj.uuid.substring(0, 8) + "..."; 
        
        const worldPos = new THREE.Vector3();
        obj.getWorldPosition(worldPos);
        geoProps[t("prop_pos")] = `${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)}`;
        
        if (obj.isMesh) {
             const box = new THREE.Box3().setFromObject(obj);
             const size = new THREE.Vector3();
             box.getSize(size);
             geoProps[t("prop_dim")] = `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;
             
             if (obj.geometry) {
                geoProps[t("prop_vert")] = (obj.geometry.attributes.position?.count || 0).toLocaleString();
                if(obj.geometry.index) {
                    geoProps[t("prop_tri")] = (obj.geometry.index.count / 3).toLocaleString();
                } else {
                     geoProps[t("prop_tri")] = ((obj.geometry.attributes.position?.count || 0) / 3).toLocaleString();
                }
            }
            if (obj.isInstancedMesh) {
                 geoProps[t("prop_inst")] = obj.count.toLocaleString();
            }

            // --- IFC Property Logic ---
            if (obj.userData.isIFC || (obj.parent && obj.parent.userData.isIFC)) {
                // If using new logic, userData is on mesh itself usually
                const target = obj.userData.isIFC ? obj : obj.parent;
                if (target && target.userData.ifcAPI && target.userData.modelID !== undefined) {
                    const expressID = obj.userData.expressID;
                    if (expressID) {
                        try {
                            // Using the raw API reference we stored
                            const api = target.userData.ifcAPI;
                            const modelID = target.userData.modelID;
                            
                            // Use custom property fetcher that resolves Psets
                            const ifcMgr = target.userData.ifcManager;
                            const props = await ifcMgr.getItemProperties(modelID, expressID);
                            
                            if (props) {
                                // Flatten for display
                                Object.keys(props).forEach(key => {
                                    const val = props[key];
                                    if (typeof val !== 'object' && val !== null && val !== undefined) {
                                        ifcProps[key] = val.toString();
                                    }
                                });
                            }
                        } catch(e) { console.error("IFC Props Error", e); }
                    }
                }
            }
        } else if (obj.userData.boundingBox) {
             const size = new THREE.Vector3();
             obj.userData.boundingBox.getSize(size);
             geoProps[t("prop_dim")] = `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;
        }

        // Grouped Properties
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
        setLoading(true);
        setStatus(t("loading"));
        setProgress(0);
        
        try {
            const group = await loadModelFiles(
                Array.from(e.target.files), 
                (p, msg) => {
                    setProgress(p);
                    if(msg) setStatus(msg);
                }, 
                t,
                sceneSettings // Pass settings
            );
            sceneMgr.current.addModel(group);
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
        const models = sceneMgr.current.contentGroup.getObjectByName("ImportedModels");
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
                     // 3D Tiles Logic
                     let dirHandle: any = null;
                     let useFileSystem = false;
                     try {
                        // @ts-ignore
                        if (window.showDirectoryPicker) {
                            // @ts-ignore
                            dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
                            useFileSystem = true;
                        }
                     } catch(e) {} // Cancelled

                     const filesMap = await convertLMBTo3DTiles(models, (msg) => {
                         setStatus(msg);
                         if (msg.includes('%')) {
                             const p = parseInt(msg.match(/(\d+)%/)?.[1] || "0");
                             setProgress(p);
                         }
                     });

                     if (useFileSystem && dirHandle) {
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
                        return; // Done
                     } else {
                        setStatus(t("zipping"));
                        blob = await createZip(filesMap);
                        filename = "3dtiles_export.zip";
                     }
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
             <MenuBar 
                t={t}
                handleOpenFiles={handleOpenFiles}
                handleOpenFolder={handleOpenFolder}
                handleConvert={() => {}} // Deprecated, handled via activeTool
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

             <div style={styles.workspace}>
                 {showOutline && (
                     <div style={{...styles.resizablePanel, width: leftWidth}}>
                         <div style={styles.panelHeader}>{t("interface_outline")}</div>
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
                 )}
                 
                 {showOutline && (
                     <div 
                         style={{
                             ...styles.resizeHandleHorizontal, 
                             backgroundColor: resizingLeft.current ? theme.accent : theme.bg 
                         }}
                         onMouseDown={(e) => { e.preventDefault(); resizingLeft.current = true; }}
                         onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.accent}
                         onMouseLeave={(e) => !resizingLeft.current && (e.currentTarget.style.backgroundColor = theme.bg)}
                     />
                 )}

                 <div ref={viewportRef} style={styles.viewport}>
                    <canvas ref={canvasRef} style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', outline: 'none'}} />
                    
                    {activeTool === 'measure' && (
                        <MeasurePanel 
                            t={t} sceneMgr={sceneMgr.current} 
                            measureType={measureType} setMeasureType={setMeasureType}
                            measureHistory={measureHistory}
                            onDelete={(id: string) => {
                                sceneMgr.current?.removeMeasurement(id);
                                setMeasureHistory(prev => prev.filter(i => i.id !== id));
                            }}
                            onClear={() => {
                                sceneMgr.current?.clearAllMeasurements();
                                setMeasureHistory([]);
                            }}
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
                        <ExplodePanel 
                            t={t} onClose={() => setActiveTool('none')}
                            explodeFactor={explodeFactor} setExplodeFactor={setExplodeFactor}
                            styles={styles} theme={theme}
                        />
                    )}
                    
                    {activeTool === 'export' && (
                        <ExportPanel 
                            t={t} 
                            onClose={() => setActiveTool('none')}
                            onExport={handleExport}
                            styles={styles} theme={theme}
                        />
                    )}
                    
                    {/* Settings Modal - renders on top due to z-index */}
                    {activeTool === 'settings' && (
                        <SettingsPanel 
                            t={t} 
                            onClose={() => setActiveTool('none')}
                            settings={sceneSettings}
                            onUpdate={handleSettingsUpdate}
                            currentLang={lang}
                            setLang={setLang}
                            themeMode={themeMode}
                            setThemeMode={setThemeMode}
                            styles={styles} theme={theme}
                        />
                    )}

                    {/* CONFIRM MODAL */}
                    <ConfirmModal 
                        isOpen={confirmState.isOpen}
                        title={confirmState.title}
                        message={confirmState.message}
                        onConfirm={confirmAction}
                        onCancel={() => setConfirmState({...confirmState, isOpen: false})}
                        t={t}
                        styles={styles} theme={theme}
                    />
                    
                    <LoadingOverlay loading={loading} status={status} progress={progress} styles={styles} theme={theme} />
                 </div>

                 {showProps && (
                     <div 
                         style={{
                             ...styles.resizeHandleHorizontal,
                             backgroundColor: resizingRight.current ? theme.accent : theme.bg 
                         }}
                         onMouseDown={(e) => { e.preventDefault(); resizingRight.current = true; }}
                         onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.accent}
                         onMouseLeave={(e) => !resizingRight.current && (e.currentTarget.style.backgroundColor = theme.bg)}
                     />
                 )}

                 {showProps && (
                     <div style={{...styles.resizablePanel, width: rightWidth}}>
                        <PropertiesPanel t={t} selectedProps={selectedProps} styles={styles} theme={theme} />
                     </div>
                 )}
             </div>

             <div style={styles.statusBar}>
                 <div style={{display:'flex', gap: 15}}><span>{status}</span></div>
                 <div style={{display:'flex', gap: 15}}>
                    <span>{t("meshes")}: {stats.meshes}</span>
                    <span>{t("memory")}: {stats.memory} MB</span>
                    <span>{t("draw_calls")}: {stats.drawCalls}</span>
                 </div>
             </div>
        </div>
    );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
