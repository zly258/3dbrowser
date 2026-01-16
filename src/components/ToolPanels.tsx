
import React, { useState, useRef, useEffect, useMemo } from "react";
import { IconClose, IconClear, IconPlay } from "../theme/Icons";
import { Button, PanelSection, Slider, DualSlider } from "./CommonUI";

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
    const panelRef = useRef<HTMLDivElement>(null);
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

                    // Clamping logic: keep panel within parent bounds
                    let limitW = window.innerWidth;
                    let limitH = window.innerHeight;
                    
                    if (panelRef.current?.parentElement) {
                        limitW = panelRef.current.parentElement.clientWidth;
                        limitH = panelRef.current.parentElement.clientHeight;
                    }

                    const maxX = limitW - size.w;
                    const maxY = limitH - size.h;
                    
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
        <div ref={panelRef} style={{ ...styles.floatingPanel, left: pos.x, top: pos.y, width: size.w, height: size.h }}>
            <div style={{...styles.floatingHeader, cursor: movable ? 'move' : 'default'}} onMouseDown={onHeaderDown}>
                <span>{title}</span>
                {onClose && (
                    <div 
                        onClick={(e) => { e.stopPropagation(); onClose(); }} 
                        style={{ cursor: 'pointer', opacity: 0.8, display:'flex', padding: 4 }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#e81123';
                            e.currentTarget.style.color = 'white';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = 'inherit';
                        }}
                    >
                        <IconClose width={16} height={16} />
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

// --- Custom Checkbox Component ---
export const Checkbox = ({ label, checked, onChange, styles, theme, style }: any) => {
    return (
        <label 
            style={{ 
                ...styles.checkboxContainer, 
                ...style,
            }} 
            onClick={(e) => { e.preventDefault(); onChange(!checked); }}
        >
            <div style={styles.checkboxCustom(checked)}>
                {checked && (
                    <div style={styles.checkboxCheckmark}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}>
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                )}
            </div>
            {label && <span style={{ marginLeft: 8 }}>{label}</span>}
        </label>
    );
};


// --- Specific Tools ---

export const MeasurePanel = ({ t, sceneMgr, measureType, setMeasureType, measureHistory, onDelete, onClear, onClose, styles, theme, highlightedId, onHighlight }: any) => {
    // Group measurements by type
    const groupedHistory = useMemo(() => {
        const groups: Record<string, any[]> = {
            'dist': [],
            'angle': [],
            'coord': []
        };
        measureHistory.forEach((item: any) => {
            if (groups[item.type]) groups[item.type].push(item);
        });
        return groups;
    }, [measureHistory]);

    const renderMeasureItem = (item: any) => (
        <div 
            key={item.id} 
            style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 16px', borderBottom: `1px solid ${theme.border}`, fontSize: 13,
                backgroundColor: highlightedId === item.id ? theme.highlight : 'transparent',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
            }}
            onClick={() => onHighlight && onHighlight(item.id)}
        >
            <div style={{display:'flex', flexDirection:'column', flex: 1, marginRight: 8, overflow: 'hidden'}}>
                <span style={{
                    color: highlightedId === item.id ? theme.accent : theme.text, 
                    fontFamily: 'monospace', 
                    fontWeight: highlightedId === item.id ? 'bold' : 'normal',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }}>{item.val}</span>
            </div>
            <div 
                style={{cursor: 'pointer', opacity: 0.7, color: theme.danger, padding: 4, borderRadius: 4}} 
                onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
            >
                <IconClose width={16} height={16} />
            </div>
        </div>
    );

    const handleTypeChange = (type: string) => {
        setMeasureType(type);
        sceneMgr?.startMeasurement(type);
    };

    return (
        <FloatingPanel title={t("measure_title")} onClose={onClose} width={340} height={580} resizable={true} styles={styles} theme={theme} storageId="tool_measure">
            <div style={{padding: '16px 16px 0 16px', display: 'flex', flexDirection: 'column', height: '100%'}}>
                <PanelSection title={t("measure_type")} theme={theme}>
                    <div style={{display:'flex', flexWrap: 'wrap', gap:4}}>
                        <Button styles={styles} theme={theme} active={measureType === 'none'} onClick={() => handleTypeChange('none')} style={{flex: '1 1 45%', fontSize: 12, padding: '6px 0'}}>
                            {t("measure_none")}
                        </Button>
                        <Button styles={styles} theme={theme} active={measureType === 'dist'} onClick={() => handleTypeChange('dist')} style={{flex: '1 1 45%', fontSize: 12, padding: '6px 0'}}>
                            {t("measure_dist")}
                        </Button>
                        <Button styles={styles} theme={theme} active={measureType === 'angle'} onClick={() => handleTypeChange('angle')} style={{flex: '1 1 45%', fontSize: 12, padding: '6px 0'}}>
                            {t("measure_angle")}
                        </Button>
                        <Button styles={styles} theme={theme} active={measureType === 'coord'} onClick={() => handleTypeChange('coord')} style={{flex: '1 1 45%', fontSize: 12, padding: '6px 0'}}>
                            {t("measure_coord")}
                        </Button>
                    </div>
                </PanelSection>
                
                <div style={{fontSize:11, color: theme.textMuted, marginBottom: 12, minHeight: 32, padding: '0 4px', fontStyle: 'italic', display: 'flex', alignItems: 'center'}}>
                    {measureType === 'dist' && t("measure_instruct_dist")}
                    {measureType === 'angle' && t("measure_instruct_angle")}
                    {measureType === 'coord' && t("measure_instruct_coord")}
                    {measureType !== 'none' && <span style={{marginLeft: 'auto', color: theme.accent, fontWeight: 'bold'}}>[ESC]退出</span>}
                </div>

                <div style={{
                    border: `1px solid ${theme.border}`, 
                    borderRadius: 4, 
                    backgroundColor: theme.bg, 
                    flex: 1, 
                    overflowY: 'auto',
                    marginBottom: 12
                }}>
                    {measureHistory.length === 0 ? (
                        <div style={{padding: 40, textAlign: 'center', color: theme.textMuted, fontSize: 12}}>
                            {t("no_measurements")}
                        </div>
                    ) : (
                        (Object.entries(groupedHistory) as [string, any[]][]).map(([type, items]) => {
                            if (items.length === 0) return null;
                            return (
                                <div key={type}>
                                    <div style={{
                                        padding: '6px 12px', 
                                        backgroundColor: theme.highlight, 
                                        fontSize: 10, 
                                        fontWeight: 'bold', 
                                        color: theme.accent,
                                        textTransform: 'uppercase',
                                        borderBottom: `1px solid ${theme.border}`
                                    }}>
                                        {type === 'dist' ? t("measure_dist") : type === 'angle' ? t("measure_angle") : t("measure_coord")}
                                    </div>
                                    {items.map(renderMeasureItem)}
                                </div>
                            );
                        })
                    )}
                </div>
                
                <div style={{ padding: '12px 0', borderTop: `1px solid ${theme.border}`, display: 'flex', gap: 8, backgroundColor: theme.bg }}>
                    <Button 
                        variant="danger"
                        styles={styles} 
                        theme={theme} 
                        onClick={onClear}
                        style={{ flex: 1, height: 36 }}
                    >
                        <IconClear width={16} height={16} />
                        {t("measure_clear")}
                    </Button>
                </div>
            </div>
        </FloatingPanel>
    );
};

export const ClipPanel = ({ t, onClose, clipEnabled, setClipEnabled, clipValues, setClipValues, clipActive, setClipActive, styles, theme }: any) => {
    const SliderRow = ({ axis, label }: { axis: 'x'|'y'|'z', label: string }) => (
        <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <Checkbox 
                    label={label} 
                    checked={clipActive[axis]} 
                    onChange={(v: boolean) => setClipActive({ ...clipActive, [axis]: v })} 
                    styles={styles} 
                    theme={theme}
                    style={{ fontWeight: '600', fontSize: 14 }}
                />
                <span style={{ 
                    fontSize: 12, 
                    color: theme.accent, 
                    opacity: clipActive[axis] ? 1 : 0.5, 
                    fontFamily: 'monospace', 
                    background: `${theme.accent}10`, 
                    padding: '3px 8px', 
                    borderRadius: 4, 
                    border: `1px solid ${theme.accent}30`,
                    minWidth: '85px',
                    textAlign: 'center'
                }}>
                    {Math.round(clipValues[axis][0])}% - {Math.round(clipValues[axis][1])}%
                </span>
            </div>
            <div style={{ padding: '0 4px' }}>
                <DualSlider 
                    min={0} max={100} 
                    value={clipValues[axis]} 
                    onChange={(val: [number, number]) => setClipValues({ ...clipValues, [axis]: val })}
                    theme={theme}
                    disabled={!clipActive[axis]}
                />
            </div>
        </div>
    );

    return (
        <FloatingPanel title={t("clip_title")} onClose={onClose} width={360} height={480} resizable={false} styles={styles} theme={theme} storageId="tool_clip">
             <div style={{ padding: '24px' }}>
                 <div style={{ marginBottom: 24, borderBottom: `1px solid ${theme.border}`, paddingBottom: 16 }}>
                    <Checkbox 
                        label={t("clip_enable")} 
                        checked={clipEnabled} 
                        onChange={(v: boolean) => setClipEnabled(v)} 
                        styles={styles} 
                        theme={theme}
                        style={{ fontWeight: 'bold', fontSize: 15 }}
                    />
                 </div>
                 <div style={{ 
                     opacity: clipEnabled ? 1 : 0.4, 
                     pointerEvents: clipEnabled ? 'auto' : 'none', 
                     transition: 'all 0.3s ease' 
                 }}>
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
                        borderRadius: 0, marginBottom: 8,
                        backgroundColor: format === opt.id ? `${theme.accent}15` : 'transparent',
                        transition: 'all 0.2s'
                    }}>
                        <input type="radio" name="exportFmt" checked={format === opt.id} onChange={() => setFormat(opt.id)} style={{marginRight: 10}}/>
                        <div>
                            <div style={{color: theme.text, fontWeight:'bold', fontSize:14}}>{opt.label}</div>
                            <div style={{fontSize:11, color: theme.textMuted}}>{opt.desc}</div>
                        </div>
                    </label>
                ))}
                
                <Button 
                    styles={styles} 
                    theme={theme} 
                    onClick={() => onExport(format)}
                    style={{ width: '100%', marginTop: 10, height: 40 }}
                >
                    {t("export_btn")}
                </Button>
            </div>
        </FloatingPanel>
    );
};