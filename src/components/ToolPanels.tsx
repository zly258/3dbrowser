
import React, { useState, useRef, useEffect } from "react";
import { IconClose, IconClear } from "../theme/Icons";

// --- Generic Floating Panel ---
interface FloatingPanelProps {
    title: string;
    onClose?: () => void; 
    children: React.ReactNode;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    resizable?: boolean; // New prop for controlling resizability
    movable?: boolean;   // New prop for controlling movability
    styles: any;
    theme: any;
    storageId?: string; // ID for localStorage persistence
}

export const FloatingPanel: React.FC<FloatingPanelProps> = ({ title, onClose, children, width = 300, height = 200, x = 100, y = 100, resizable = false, movable = true, styles, theme, storageId }) => {
    // Initialize position from localStorage or props
    const [pos, setPos] = useState(() => {
        if (storageId) {
            try {
                const saved = localStorage.getItem(`panel_${storageId}`);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    // Basic validation to ensure panel is somewhat on screen
                    if (parsed.pos && typeof parsed.pos.x === 'number' && typeof parsed.pos.y === 'number') {
                        // Clamp to prevent loading off-screen if window size changed
                        const loadedX = Math.min(Math.max(0, parsed.pos.x), window.innerWidth - 50);
                        const loadedY = Math.min(Math.max(0, parsed.pos.y), window.innerHeight - 50);
                        return { x: loadedX, y: loadedY };
                    }
                }
            } catch (e) { console.error("Failed to load panel state", e); }
        }
        return { x, y };
    });

    const [size, setSize] = useState(() => {
        if (storageId && resizable) {
            try {
                const saved = localStorage.getItem(`panel_${storageId}`);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed.size && typeof parsed.size.w === 'number' && typeof parsed.size.h === 'number') {
                        return parsed.size;
                    }
                }
            } catch(e) {}
        }
        return { w: width, h: height };
    });
    
    const isDragging = useRef(false);
    const isResizing = useRef(false);
    
    const dragStart = useRef({ x: 0, y: 0 });
    const startPos = useRef({ x: 0, y: 0 });
    const startSize = useRef({ w: 0, h: 0 });
    
    // Refs to track current state for handleUp saving without stale closures
    const currentPosRef = useRef(pos);
    const currentSizeRef = useRef(size);
    
    const animationFrame = useRef<number>(0);

    // Sync refs
    useEffect(() => { currentPosRef.current = pos; }, [pos]);
    useEffect(() => { currentSizeRef.current = size; }, [size]);

    // Optimized Drag/Resize Handler with Clamping
    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            if (!isDragging.current && !isResizing.current) return;
            
            e.preventDefault(); 
            
            if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
            
            animationFrame.current = requestAnimationFrame(() => {
                const dx = e.clientX - dragStart.current.x;
                const dy = e.clientY - dragStart.current.y;

                if (isDragging.current) {
                    let newX = startPos.current.x + dx;
                    let newY = startPos.current.y + dy;

                    // Clamping logic: keep panel within window bounds
                    const maxX = window.innerWidth - size.w;
                    const maxY = window.innerHeight - size.h;
                    
                    newX = Math.max(0, Math.min(newX, maxX));
                    newY = Math.max(0, Math.min(newY, maxY));

                    setPos({ x: newX, y: newY });
                } else if (isResizing.current) {
                    setSize({ 
                        w: Math.max(220, startSize.current.w + dx), 
                        h: Math.max(120, startSize.current.h + dy) 
                    });
                }
            });
        };

        const handleUp = () => {
            // Save state on drag end
            if ((isDragging.current || isResizing.current) && storageId) {
                try {
                    const stateToSave = {
                        pos: currentPosRef.current,
                        size: currentSizeRef.current
                    };
                    localStorage.setItem(`panel_${storageId}`, JSON.stringify(stateToSave));
                } catch(e) { console.error("Failed to save panel state", e); }
            }

            isDragging.current = false;
            isResizing.current = false;
            if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
        };

        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleUp);
        
        return () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleUp);
            if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
        };
    }, [size, storageId]); // Dependency on size to recalculate bounds correctly

    const onHeaderDown = (e: React.MouseEvent) => {
        if (e.button !== 0 || !movable) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        isDragging.current = true;
        dragStart.current = { x: e.clientX, y: e.clientY };
        startPos.current = { ...pos };
    };

    const onResizeDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        isResizing.current = true;
        dragStart.current = { x: e.clientX, y: e.clientY };
        startSize.current = { ...size };
    };

    return (
        <div style={{ ...styles.floatingPanel, left: pos.x, top: pos.y, width: size.w, height: size.h }}>
            <div style={{...styles.floatingHeader, cursor: movable ? 'move' : 'default'}} onMouseDown={onHeaderDown}>
                <span>{title}</span>
                {onClose && (
                    <div 
                        onClick={(e) => { e.stopPropagation(); onClose(); }} 
                        style={{ cursor: 'pointer', opacity: 0.6, display:'flex', padding: 2, borderRadius: 4 }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <IconClose width={20} height={20} />
                    </div>
                )}
            </div>
            <div style={styles.floatingContent}>
                {children}
            </div>
            {resizable && (
                <div style={styles.resizeHandle} onMouseDown={onResizeDown} />
            )}
        </div>
    );
};

// --- Custom Dual Slider Component ---
const DualRangeSlider = ({ min, max, value, onChange, theme }: { min: number, max: number, value: [number, number], onChange: (val: [number, number]) => void, theme: any }) => {
    const trackRef = useRef<HTMLDivElement>(null);

    const getPercentage = (val: number) => ((val - min) / (max - min)) * 100;

    const handleMouseDown = (index: 0 | 1) => (e: React.MouseEvent) => {
        if(e.button !== 0) return;
        e.preventDefault();
        
        const startX = e.clientX;
        const startVal = value[index];
        const trackWidth = trackRef.current?.getBoundingClientRect().width || 1;

        const onMove = (moveEvent: MouseEvent) => {
            moveEvent.preventDefault();
            const dx = moveEvent.clientX - startX;
            const diff = (dx / trackWidth) * (max - min);
            let newVal = startVal + diff;
            newVal = Math.max(min, Math.min(max, newVal));

            const nextValue: [number, number] = [...value];
            if (index === 0) {
                nextValue[0] = Math.min(newVal, value[1]);
            } else {
                nextValue[1] = Math.max(newVal, value[0]);
            }
            onChange(nextValue);
        };

        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    };

    return (
        <div ref={trackRef} style={{
            position: 'relative', width: '100%', height: '24px', display: 'flex', alignItems: 'center', cursor: 'pointer'
        }}>
            <div style={{
                position: 'absolute', width: '100%', height: '4px', background: theme.border, borderRadius: '2px'
            }} />
            <div style={{
                position: 'absolute',
                left: `${getPercentage(value[0])}%`,
                width: `${getPercentage(value[1]) - getPercentage(value[0])}%`,
                height: '4px',
                background: theme.accent,
                opacity: 1
            }} />
            <div 
                onMouseDown={handleMouseDown(0)}
                style={{
                    position: 'absolute', left: `calc(${getPercentage(value[0])}% - 8px)`,
                    width: 16, height: 16, background: theme.panelBg, borderRadius: '50%', cursor: 'pointer',
                    boxShadow: `0 1px 3px ${theme.shadow}`, zIndex: 2, border: `2px solid ${theme.accent}`
                }}
            />
            <div 
                onMouseDown={handleMouseDown(1)}
                style={{
                    position: 'absolute', left: `calc(${getPercentage(value[1])}% - 8px)`,
                    width: 16, height: 16, background: theme.panelBg, borderRadius: '50%', cursor: 'pointer',
                    boxShadow: `0 1px 3px ${theme.shadow}`, zIndex: 2, border: `2px solid ${theme.accent}`
                }}
            />
        </div>
    );
};

// --- Specific Tools ---

export const MeasurePanel = ({ t, sceneMgr, measureType, setMeasureType, measureHistory, onDelete, onClear, onClose, styles, theme }: any) => {
    return (
        <FloatingPanel title={t("measure_title")} onClose={onClose} width={300} height={450} resizable={false} styles={styles} theme={theme} storageId="tool_measure">
            <div style={{padding: 12, display: 'flex', flexDirection: 'column', height: '100%'}}>
                <div style={{marginBottom: 12, display:'flex', gap:8}}>
                    <button style={{...styles.btn, flex:1, ...(measureType === 'dist' ? styles.btnActive : {})}} 
                            onClick={() => { setMeasureType('dist'); sceneMgr?.startMeasurement('dist'); }}>
                        {t("measure_dist")}
                    </button>
                    <button style={{...styles.btn, flex:1, ...(measureType === 'angle' ? styles.btnActive : {})}} 
                            onClick={() => { setMeasureType('angle'); sceneMgr?.startMeasurement('angle'); }}>
                        {t("measure_angle")}
                    </button>
                    <button style={{...styles.btn, flex:1, ...(measureType === 'coord' ? styles.btnActive : {})}} 
                            onClick={() => { setMeasureType('coord'); sceneMgr?.startMeasurement('coord'); }}>
                        {t("measure_coord")}
                    </button>
                </div>
                
                <div style={{fontSize:11, color: theme.textMuted, marginBottom: 10, minHeight: 16}}>
                    {measureType === 'dist' && t("measure_instruct_dist")}
                    {measureType === 'angle' && t("measure_instruct_angle")}
                    {measureType === 'coord' && t("measure_instruct_coord")}
                </div>

                <div style={{
                    border: `1px solid ${theme.border}`, 
                    borderRadius: 8, 
                    backgroundColor: theme.bg, 
                    flex: 1, 
                    overflowY: 'auto',
                    marginBottom: 10
                }}>
                    {measureHistory.length === 0 ? (
                        <div style={{padding: 20, textAlign: 'center', color: theme.textMuted, fontSize: 12}}>
                            {t("no_measurements")}
                        </div>
                    ) : (
                        measureHistory.map((item: any) => (
                            <div key={item.id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '8px 12px', borderBottom: `1px solid ${theme.border}`, fontSize: 12
                            }}>
                                <div style={{display:'flex', flexDirection:'column'}}>
                                    <span style={{color: theme.textMuted, fontSize: 10}}>
                                        {item.type === 'dist' ? t("measure_dist") : 
                                         item.type === 'angle' ? t("measure_angle") : 
                                         item.type === 'coord' ? t("measure_coord") : item.type}
                                    </span>
                                    <span style={{color: theme.text, fontFamily: 'monospace'}}>{item.val}</span>
                                </div>
                                <div style={{cursor: 'pointer', opacity: 0.7, color: theme.danger, padding: 4, borderRadius: 4}} onClick={() => onDelete(item.id)}>
                                    <IconClose width={18} height={18} />
                                </div>
                            </div>
                        ))
                    )}
                </div>
                
                <button style={{...styles.btn, width: '100%', backgroundColor: theme.danger, borderColor: theme.danger, color:'white'}} onClick={onClear}>
                    {t("measure_clear")}
                </button>
            </div>
        </FloatingPanel>
    );
};

export const ClipPanel = ({ t, onClose, clipEnabled, setClipEnabled, clipValues, setClipValues, clipActive, setClipActive, styles, theme }: any) => {
    const SliderRow = ({ axis, label }: { axis: 'x'|'y'|'z', label: string }) => (
        <div style={{marginBottom: 16}}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom: 4}}>
                <label style={{display:'flex', alignItems:'center', gap: 6, cursor: 'pointer', fontSize:12, fontWeight:'500'}}>
                    <input type="checkbox" checked={clipActive[axis]} onChange={(e) => setClipActive({...clipActive, [axis]: e.target.checked})}/>
                    {label}
                </label>
                <span style={{fontSize: 10, color: theme.textMuted}}>
                    {Math.round(clipValues[axis][0])}% - {Math.round(clipValues[axis][1])}%
                </span>
            </div>
            <div style={{padding: '0 4px'}}>
                <DualRangeSlider 
                    min={0} max={100} 
                    value={clipValues[axis]} 
                    onChange={(val) => setClipValues({...clipValues, [axis]: val})}
                    theme={theme}
                />
            </div>
        </div>
    );

    return (
        <FloatingPanel title={t("clip_title")} onClose={onClose} width={300} height={320} resizable={false} styles={styles} theme={theme} storageId="tool_clip">
             <div style={{padding: 16}}>
                 <div style={{marginBottom: 15, paddingBottom: 10, borderBottom: `1px solid ${theme.border}`}}>
                    <label style={{cursor:'pointer', display:'flex', alignItems:'center', fontWeight:'bold', fontSize:12}}>
                        <input type="checkbox" checked={clipEnabled} onChange={(e) => setClipEnabled(e.target.checked)} style={{marginRight:8}}/>
                        {t("clip_enable")}
                    </label>
                 </div>
                 <div style={{opacity: clipEnabled ? 1 : 0.5, pointerEvents: clipEnabled ? 'auto' : 'none', transition: 'opacity 0.2s'}}>
                     <SliderRow axis="x" label={t("clip_x")} />
                     <SliderRow axis="y" label={t("clip_y")} />
                     <SliderRow axis="z" label={t("clip_z")} />
                 </div>
             </div>
        </FloatingPanel>
    );
};

export const ExportPanel = ({ t, onClose, onExport, styles, theme }: any) => {
    const [format, setFormat] = useState('glb');
    
    return (
        <FloatingPanel title={t("export_title")} onClose={onClose} width={320} height={400} resizable={false} styles={styles} theme={theme} storageId="tool_export">
            <div style={{padding: 16}}>
                <div style={{marginBottom: 10, fontSize:12, color: theme.textMuted}}>{t("export_format")}:</div>
                
                {[
                    {id: 'glb', label: 'GLB', desc: t("export_glb")},
                    {id: 'lmb', label: 'LMB', desc: t("export_lmb")},
                    {id: '3dtiles', label: '3D Tiles', desc: t("export_3dtiles")},
                    {id: 'nbim', label: 'NBIM', desc: t("export_nbim")}
                ].map(opt => (
                    <label key={opt.id} style={{
                        display:'flex', alignItems:'center', padding: '10px', cursor:'pointer', 
                        border: `1px solid ${format === opt.id ? theme.accent : theme.border}`,
                        borderRadius: 8, marginBottom: 8,
                        backgroundColor: format === opt.id ? `${theme.accent}15` : 'transparent',
                        transition: 'all 0.2s'
                    }}>
                        <input type="radio" name="exportFmt" checked={format === opt.id} onChange={() => setFormat(opt.id)} style={{marginRight: 10, accentColor: theme.accent}}/>
                        <div>
                            <div style={{color: theme.text, fontWeight:'bold', fontSize:13}}>{opt.label}</div>
                            <div style={{fontSize:11, color: theme.textMuted}}>{opt.desc}</div>
                        </div>
                    </label>
                ))}
                
                <button style={{...styles.btn, width: '100%', marginTop: 10, backgroundColor: theme.accent, borderColor: theme.accent, color:'white'}} onClick={() => onExport(format)}>
                    {t("export_btn")}
                </button>
            </div>
        </FloatingPanel>
    );
};


