

import React, { useState, useRef, useEffect } from "react";
import { styles, colors } from "../Styles";
import { IconClose, IconClear } from "../Icons";
import { SceneManager, MeasureType } from "../SceneManager";
import { TFunc } from "../Locales";

// --- Generic Floating Panel ---
interface FloatingPanelProps {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
}

export const FloatingPanel: React.FC<FloatingPanelProps> = ({ title, onClose, children, width = 300, height = 200, x = 100, y = 100 }) => {
    const [pos, setPos] = useState({ x, y });
    const [size, setSize] = useState({ w: width, h: height });
    const isDragging = useRef(false);
    const isResizing = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const startPos = useRef({ x: 0, y: 0 });
    const startSize = useRef({ w: 0, h: 0 });

    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            if (isDragging.current) {
                const dx = e.clientX - dragStart.current.x;
                const dy = e.clientY - dragStart.current.y;
                let newX = startPos.current.x + dx;
                let newY = startPos.current.y + dy;
                // Boundaries
                newX = Math.max(0, Math.min(window.innerWidth - size.w, newX));
                newY = Math.max(30, Math.min(window.innerHeight - size.h, newY)); 

                setPos({ x: newX, y: newY });
            } else if (isResizing.current) {
                const dx = e.clientX - dragStart.current.x;
                const dy = e.clientY - dragStart.current.y;
                setSize({ 
                    w: Math.max(200, startSize.current.w + dx), 
                    h: Math.max(100, startSize.current.h + dy) 
                });
            }
        };

        const handleUp = () => {
            isDragging.current = false;
            isResizing.current = false;
        };

        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleUp);
        return () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleUp);
        };
    }, [size]);

    const onHeaderDown = (e: React.MouseEvent) => {
        isDragging.current = true;
        dragStart.current = { x: e.clientX, y: e.clientY };
        startPos.current = { ...pos };
    };

    const onResizeDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        isResizing.current = true;
        dragStart.current = { x: e.clientX, y: e.clientY };
        startSize.current = { ...size };
    };

    return (
        <div style={{ ...styles.floatingPanel, left: pos.x, top: pos.y, width: size.w, height: size.h }}>
            <div style={styles.floatingHeader} onMouseDown={onHeaderDown}>
                <span>{title}</span>
                <div onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ cursor: 'pointer' }}><IconClose /></div>
            </div>
            <div style={styles.floatingContent}>
                {children}
            </div>
            <div style={styles.resizeHandle} onMouseDown={onResizeDown} />
        </div>
    );
};

// --- Custom Dual Slider Component ---
const DualRangeSlider = ({ min, max, value, onChange }: { min: number, max: number, value: [number, number], onChange: (val: [number, number]) => void }) => {
    const trackRef = useRef<HTMLDivElement>(null);

    const getPercentage = (val: number) => ((val - min) / (max - min)) * 100;

    const handleMouseDown = (index: 0 | 1) => (e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startVal = value[index];
        const trackWidth = trackRef.current?.getBoundingClientRect().width || 1;

        const onMove = (moveEvent: MouseEvent) => {
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
            position: 'relative', width: '100%', height: '16px', display: 'flex', alignItems: 'center', cursor: 'pointer'
        }}>
            {/* Track Background */}
            <div style={{
                position: 'absolute', width: '100%', height: '4px', background: '#444', borderRadius: '2px'
            }} />

            {/* Active Range */}
            <div style={{
                position: 'absolute',
                left: `${getPercentage(value[0])}%`,
                width: `${getPercentage(value[1]) - getPercentage(value[0])}%`,
                height: '4px',
                background: colors.accent,
                opacity: 0.8
            }} />

            {/* Thumb 1 */}
            <div 
                onMouseDown={handleMouseDown(0)}
                style={{
                    position: 'absolute', left: `calc(${getPercentage(value[0])}% - 6px)`,
                    width: 12, height: 12, background: '#fff', borderRadius: '50%', cursor: 'ew-resize',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.5)', zIndex: 2
                }}
            />

            {/* Thumb 2 */}
            <div 
                onMouseDown={handleMouseDown(1)}
                style={{
                    position: 'absolute', left: `calc(${getPercentage(value[1])}% - 6px)`,
                    width: 12, height: 12, background: '#fff', borderRadius: '50%', cursor: 'ew-resize',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.5)', zIndex: 2
                }}
            />
        </div>
    );
};

// --- Specific Tools ---

export const MeasurePanel = ({ 
    t, 
    sceneMgr, 
    measureType, 
    setMeasureType, 
    measureHistory,
    onDelete,
    onClear,
    onClose 
}: any) => {
    return (
        <FloatingPanel title={t("measure_title")} onClose={onClose} width={280} height={350}>
            <div style={{marginBottom: 10, display:'flex', gap:5}}>
                <button style={{...styles.btn, ...(measureType === 'dist' ? styles.btnActive : {})}} 
                        onClick={() => { setMeasureType('dist'); sceneMgr?.startMeasurement('dist'); }}>
                    {t("measure_dist")}
                </button>
                <button style={{...styles.btn, ...(measureType === 'angle' ? styles.btnActive : {})}} 
                        onClick={() => { setMeasureType('angle'); sceneMgr?.startMeasurement('angle'); }}>
                    {t("measure_angle")}
                </button>
                <button style={{...styles.btn, ...(measureType === 'coord' ? styles.btnActive : {})}} 
                        onClick={() => { setMeasureType('coord'); sceneMgr?.startMeasurement('coord'); }}>
                    {t("measure_coord")}
                </button>
            </div>
            
            <div style={{fontSize:11, color:'#aaa', marginBottom: 10, minHeight: 16}}>
                {measureType === 'dist' && t("measure_instruct_dist")}
                {measureType === 'angle' && t("measure_instruct_angle")}
                {measureType === 'coord' && t("measure_instruct_coord")}
            </div>

            <div style={{
                border: `1px solid ${colors.border}`, 
                borderRadius: 4, 
                backgroundColor: '#1a1a1a', 
                height: 180, 
                overflowY: 'auto',
                marginBottom: 10
            }}>
                {measureHistory.length === 0 ? (
                    <div style={{padding: 20, textAlign: 'center', color: '#555', fontSize: 12}}>
                        {t("no_measurements")}
                    </div>
                ) : (
                    measureHistory.map((item: any) => (
                        <div key={item.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '6px 8px', borderBottom: '1px solid #333', fontSize: 12
                        }}>
                            <div style={{display:'flex', flexDirection:'column'}}>
                                <span style={{color: '#888', fontSize: 10}}>
                                    {item.type === 'dist' ? t("measure_dist") : 
                                     item.type === 'angle' ? t("measure_angle") : 
                                     item.type === 'coord' ? t("measure_coord") : item.type}
                                </span>
                                <span style={{color: '#eee'}}>{item.val}</span>
                            </div>
                            <div style={{cursor: 'pointer', opacity: 0.7}} onClick={() => onDelete(item.id)}>
                                <IconClose width={14} height={14} />
                            </div>
                        </div>
                    ))
                )}
            </div>
            
            <button style={{...styles.btn, width: '100%', backgroundColor: colors.danger, border: 'none'}} onClick={onClear}>
                {t("measure_clear")}
            </button>
        </FloatingPanel>
    );
};

export const ClipPanel = ({ t, sceneMgr, onClose, clipEnabled, setClipEnabled, clipValues, setClipValues, clipActive, setClipActive }: any) => {
    const SliderRow = ({ axis, label }: { axis: 'x'|'y'|'z', label: string }) => (
        <div style={{display:'flex', alignItems:'center', marginBottom: 12, height: 24}}>
             <label style={{display:'flex', alignItems:'center', gap: 6, cursor: 'pointer', width: 60, fontSize:12, color:'#aaa'}}>
                <input type="checkbox" checked={clipActive[axis]} onChange={(e) => setClipActive({...clipActive, [axis]: e.target.checked})}/>
                {label}
            </label>
            <div style={{flex: 1, padding: '0 8px'}}>
                <DualRangeSlider 
                    min={0} max={100} 
                    value={clipValues[axis]} 
                    onChange={(val) => setClipValues({...clipValues, [axis]: val})} 
                />
            </div>
            <span style={{width: 70, textAlign:'right', fontSize: 10, color:'#ccc'}}>
                {Math.round(clipValues[axis][0])}% - {Math.round(clipValues[axis][1])}%
            </span>
        </div>
    );

    return (
        <FloatingPanel title={t("clip_title")} onClose={onClose} width={320} height={200}>
             <div style={{marginBottom: 15, paddingBottom: 10, borderBottom: `1px solid ${colors.border}`}}>
                <label style={{cursor:'pointer', display:'flex', alignItems:'center', fontWeight:'bold', fontSize:12}}>
                    <input type="checkbox" checked={clipEnabled} onChange={(e) => setClipEnabled(e.target.checked)} style={{marginRight:8}}/>
                    {t("clip_enable")}
                </label>
             </div>
             <div style={{opacity: clipEnabled ? 1 : 0.5, pointerEvents: clipEnabled ? 'auto' : 'none'}}>
                 <SliderRow axis="x" label={t("clip_x")} />
                 <SliderRow axis="y" label={t("clip_y")} />
                 <SliderRow axis="z" label={t("clip_z")} />
             </div>
        </FloatingPanel>
    );
};

export const ExplodePanel = ({ t, onClose, explodeFactor, setExplodeFactor }: any) => (
    <FloatingPanel title={t("explode_title")} onClose={onClose} width={260} height={140}>
        <div style={styles.sliderRow}>
            <span style={styles.sliderLabel}>{t("explode_factor")}</span>
            <input style={styles.rangeSlider} type="range" min="0" max="100" value={explodeFactor} onChange={(e) => setExplodeFactor(parseInt(e.target.value))} />
            <span style={{fontSize:11, width:24}}>{explodeFactor}%</span>
        </div>
        <button style={{...styles.btn, marginTop:10}} onClick={() => setExplodeFactor(0)}>
            {t("explode_reset")}
        </button>
    </FloatingPanel>
);

export const ExportPanel = ({ t, onClose, onExport }: { t: TFunc, onClose: () => void, onExport: (format: string) => void }) => {
    const [format, setFormat] = useState('glb');
    
    return (
        <FloatingPanel title={t("export_title")} onClose={onClose} width={300} height={260}>
            <div style={{padding: '0 10px'}}>
                <div style={{marginBottom: 10, fontSize:12, color:'#aaa'}}>{t("export_format")}:</div>
                
                <label style={{display:'flex', alignItems:'center', padding: '8px', cursor:'pointer', borderBottom: '1px solid #333'}}>
                    <input type="radio" name="exportFmt" checked={format === 'glb'} onChange={() => setFormat('glb')} style={{marginRight: 10}}/>
                    <div>
                        <div style={{color:'white', fontWeight:'bold'}}>GLB</div>
                        <div style={{fontSize:10, color:'#888'}}>{t("export_glb")}</div>
                    </div>
                </label>
                
                <label style={{display:'flex', alignItems:'center', padding: '8px', cursor:'pointer', borderBottom: '1px solid #333'}}>
                    <input type="radio" name="exportFmt" checked={format === 'lmb'} onChange={() => setFormat('lmb')} style={{marginRight: 10}}/>
                    <div>
                        <div style={{color:'white', fontWeight:'bold'}}>LMB</div>
                        <div style={{fontSize:10, color:'#888'}}>{t("export_lmb")}</div>
                    </div>
                </label>
                
                <label style={{display:'flex', alignItems:'center', padding: '8px', cursor:'pointer', marginBottom: 15}}>
                    <input type="radio" name="exportFmt" checked={format === '3dtiles'} onChange={() => setFormat('3dtiles')} style={{marginRight: 10}}/>
                    <div>
                        <div style={{color:'white', fontWeight:'bold'}}>3D Tiles</div>
                        <div style={{fontSize:10, color:'#888'}}>{t("export_3dtiles")}</div>
                    </div>
                </label>
                
                <button style={{...styles.btn, width: '100%', backgroundColor: colors.accent, padding:'8px 0'}} onClick={() => onExport(format)}>
                    {t("export_btn")}
                </button>
            </div>
        </FloatingPanel>
    );
};
