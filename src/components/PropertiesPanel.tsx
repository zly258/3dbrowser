import React from "react";

// 辅助函数：安全地转换值为字符串
const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (typeof value === 'object') {
        if (Array.isArray(value)) {
            return value.map(v => formatValue(v)).join(', ');
        }
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return '[Object]';
        }
    }
    return String(value);
};

interface PropertiesPanelProps {
    t: (key: string) => string;
    selectedProps: Record<string, any> | null;
    styles: any;
    theme: any;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ t, selectedProps, styles, theme }) => {
    return (
        <div style={{flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
             <div style={styles.panelHeader}>{t("interface_props")}</div>
             <div style={{...styles.list, overflowY: 'auto', padding: '8px'}}>
                {selectedProps ? (
                    // 检查是否是分组结构（旧格式）
                    typeof Object.values(selectedProps)[0] === 'object' && !Array.isArray(Object.values(selectedProps)[0]) ? (
                        // 分组显示格式（旧格式兼容）
                        Object.entries(selectedProps).map(([group, props]) => {
                            const hasValidProps = Object.entries(props).some(([key, value]) => {
                                if (key.startsWith('_')) return false;
                                return value !== null && value !== undefined;
                            });
                            
                            if (!hasValidProps) return null;
                            
                            return (
                                <div key={group} style={{marginBottom: '12px', border: `1px solid ${theme.border}`, borderRadius: '4px', padding: '8px', backgroundColor: theme.bg + '20'}}>
                                    <div style={{...styles.propGroupTitle, marginBottom: '8px', fontSize: '12px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '4px'}}>{group}</div>
                                    {Object.entries(props).map(([k, v]) => {
                                        if (k.startsWith('_')) return null;
                                        const displayValue = formatValue(v);
                                        return (
                                            <div key={k} style={styles.propRow}>
                                                <div style={{...styles.propKey, maxWidth: '120px'}} title={k}>{k}</div>
                                                <div style={{...styles.propValue, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all'}} 
                                                     title={displayValue}>
                                                    {displayValue}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })
                    ) : (
                        // 分组显示扁平化属性（新IFC属性格式）
                        (() => {
                            // 将属性按前缀分组
                            const groupedProps: Record<string, any> = {};
                            const ungroupedProps: any = {};
                            
                            Object.entries(selectedProps).forEach(([key, value]) => {
                                const parts = key.split('.');
                                if (parts.length > 1) {
                                    const group = parts[0];
                                    if (!groupedProps[group]) groupedProps[group] = {};
                                    groupedProps[group][parts.slice(1).join('.')] = value;
                                } else {
                                    ungroupedProps[key] = value;
                                }
                            });
                            
                            return (
                                <div>
                                    {/* 未分组的属性（基本属性） */}
                                    {Object.keys(ungroupedProps).length > 0 && (
                                        <div style={{marginBottom: '12px', border: `1px solid ${theme.border}`, borderRadius: '4px', padding: '8px', backgroundColor: theme.bg + '20'}}>
                                            <div style={{...styles.propGroupTitle, marginBottom: '8px', fontSize: '12px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '4px'}}>基本属性</div>
                                            {Object.entries(ungroupedProps).map(([key, value]) => {
                                                const displayValue = formatValue(value);
                                                return (
                                                    <div key={key} style={styles.propRow}>
                                                        <div style={{...styles.propKey, maxWidth: '120px', fontSize: '11px'}} title={key}>{key}</div>
                                                        <div style={{...styles.propValue, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all'}} 
                                                             title={displayValue}>
                                                            {displayValue}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    
                                    {/* 分组的属性 */}
                                    {Object.entries(groupedProps).map(([groupName, props]) => (
                                        <div key={groupName} style={{marginBottom: '12px', border: `1px solid ${theme.border}`, borderRadius: '4px', padding: '8px', backgroundColor: theme.bg + '20'}}>
                                            <div style={{...styles.propGroupTitle, marginBottom: '8px', fontSize: '12px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '4px'}}>{groupName}</div>
                                            {Object.entries(props).map(([key, value]) => {
                                                const displayValue = formatValue(value);
                                                return (
                                                    <div key={key} style={styles.propRow}>
                                                        <div style={{...styles.propKey, maxWidth: '150px', fontSize: '11px'}} title={key}>{key}</div>
                                                        <div style={{...styles.propValue, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all'}} 
                                                             title={displayValue}>
                                                            {displayValue}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            );
                        })()
                    )
                ) : (
                    <div style={{padding:20, color: theme.textMuted, textAlign:'center'}}>{t("no_selection")}</div>
                )}
             </div>
        </div>
    );
};
