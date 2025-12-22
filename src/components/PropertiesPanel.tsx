import React from "react";

// 辅助函数：安全地转换值为字符串，用于在一行显示
const formatValueForDisplay = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') {
        return value ? '是' : '否';
    }
    if (typeof value === 'number') {
        // 数字显示，浮点数保留3位精度
        return Number.isInteger(value) ? value.toString() : parseFloat(value.toFixed(3)).toString();
    }
    if (typeof value === 'string') {
        // 字符串截断显示，过长时用省略号
        const cleaned = value.trim();
        return cleaned.length > 50 ? cleaned.substring(0, 47) + '...' : cleaned;
    }
    if (typeof value === 'object') {
        if (Array.isArray(value)) {
            const result = value.map(v => formatValueForDisplay(v)).join(', ');
            return result.length > 50 ? result.substring(0, 47) + '...' : result;
        }
        try {
            const str = JSON.stringify(value);
            return str.length > 50 ? str.substring(0, 47) + '...' : str;
        } catch {
            return '[Object]';
        }
    }
    return String(value);
};

// 辅助函数：用于悬浮提示的完整值
const formatValueForTooltip = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') {
        return value ? '是' : '否';
    }
    if (typeof value === 'number') {
        return Number.isInteger(value) ? value.toString() : parseFloat(value.toFixed(6)).toString();
    }
    if (typeof value === 'string') {
        return value.trim();
    }
    if (typeof value === 'object') {
        if (Array.isArray(value)) {
            return value.map(v => formatValueForTooltip(v)).join(', ');
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
                                        const displayValue = formatValueForDisplay(v);
                                        return (
                                            <div key={k} style={styles.propRow}>
                                                <div 
                                                    style={{
                                                        ...styles.propKey, 
                                                        maxWidth: '150px',
                                                        minWidth: '80px',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap'
                                                    }} 
                                                    title={k}
                                                >
                                                    {k}
                                                </div>
                                                <div 
                                                    style={{
                                                        ...styles.propValue, 
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        fontFamily: 'inherit',
                                                        fontSize: '12px',
                                                        maxWidth: 'calc(100% - 160px)'
                                                    }} 
                                                    title={displayValue}
                                                >
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
                            // 将属性按前缀分组，支持多级分组
                            const groupedProps: Record<string, any> = {};
                            const ungroupedProps: any = {};
                            
                            Object.entries(selectedProps).forEach(([key, value]) => {
                                const parts = key.split('.');
                                if (parts.length > 1) {
                                    const group = parts[0];
                                    if (!groupedProps[group]) groupedProps[group] = {};
                                    
                                    // 处理多级分组（如"属性集.墙体.厚度"）
                                    if (parts.length > 2) {
                                        const subGroup = parts.slice(1, -1).join('.');
                                        if (!groupedProps[group][subGroup]) groupedProps[group][subGroup] = {};
                                        groupedProps[group][subGroup][parts[parts.length - 1]] = value;
                                    } else {
                                        groupedProps[group][parts[1]] = value;
                                    }
                                } else {
                                    ungroupedProps[key] = value;
                                }
                            });
                            
                            // 递归渲染嵌套分组
                            const renderNestedGroup = (group: any, groupName: string, depth: number = 0) => {
                                return Object.entries(group).map(([key, value]) => {
                                    if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
                                        // 嵌套分组
                                        return (
                                            <div key={`${groupName}.${key}`} style={{
                                                marginLeft: depth > 0 ? '12px' : '0',
                                                marginTop: depth > 0 ? '8px' : '0',
                                                padding: '8px',
                                                border: depth > 0 ? `1px dashed ${theme.border}` : `1px solid ${theme.border}`,
                                                borderRadius: '4px',
                                                backgroundColor: theme.bg + (10 + depth * 5).toString(16)
                                            }}>
                                                <div style={{
                                                    ...styles.propGroupTitle, 
                                                    fontSize: `${Math.max(10, 13 - depth)}px`,
                                                    fontWeight: depth === 0 ? 'bold' : 'normal',
                                                    marginBottom: '6px',
                                                    borderBottom: `1px solid ${theme.border}`,
                                                    paddingBottom: '3px'
                                                }}>{key}</div>
                                                {renderNestedGroup(value, `${groupName}.${key}`, depth + 1)}
                                            </div>
                                        );
                                    } else {
                                        // 叶子属性 - 一行显示，支持悬浮
                                        const displayValue = formatValueForDisplay(value);
                                        const tooltipValue = formatValueForTooltip(value);
                                        const isImportant = ['ID', '类型', 'ExpressID', '名称', 'GlobalId'].includes(key);
                                        return (
                                            <div key={key} style={{
                                                ...styles.propRow,
                                                backgroundColor: isImportant ? theme.bg + '30' : 'transparent',
                                                padding: isImportant ? '2px 4px' : '1px 0',
                                                borderRadius: '2px',
                                                margin: '1px 0',
                                                alignItems: 'center',
                                                minHeight: '24px'
                                            }}>
                                                <div style={{
                                                    ...styles.propKey, 
                                                    maxWidth: depth > 0 ? '130px' : '150px',
                                                    minWidth: '80px',
                                                    fontSize: `${Math.max(11, 12 - depth)}px`,
                                                    fontWeight: isImportant ? 'bold' : 'normal',
                                                    color: isImportant ? theme.accent : theme.text,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    lineHeight: '20px'
                                                }} title={key}>{key}</div>
                                                <div style={{
                                                    ...styles.propValue, 
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    fontFamily: 'inherit',
                                                    fontSize: `${Math.max(11, 12 - depth)}px`,
                                                    color: typeof value === 'boolean' ? (value ? theme.success : theme.danger) : theme.text,
                                                    maxWidth: 'calc(100% - 160px)',
                                                    lineHeight: '20px'
                                                }} title={tooltipValue}>
                                                    {displayValue}
                                                </div>
                                            </div>
                                        );
                                    }
                                });
                            };
                            
                            return (
                                <div>
                                    {/* 基本属性（ExpressID, 类型等） */}
                                    {Object.keys(ungroupedProps).length > 0 && (
                                        <div style={{marginBottom: '12px', border: `2px solid ${theme.accent}`, borderRadius: '4px', padding: '8px', backgroundColor: theme.bg + '30'}}>
                                            <div style={{...styles.propGroupTitle, marginBottom: '8px', fontSize: '14px', fontWeight: 'bold', borderBottom: `2px solid ${theme.accent}`, paddingBottom: '4px'}}>基本信息</div>
                                            {Object.entries(ungroupedProps).map(([key, value]) => {
                                                const displayValue = formatValueForDisplay(value);
                                                const isCoreInfo = ['ExpressID', '类型', 'GlobalId'].includes(key);
                                                return (
                                                    <div key={key} style={{
                                                        ...styles.propRow,
                                                        backgroundColor: isCoreInfo ? theme.accent + '20' : 'transparent',
                                                        padding: isCoreInfo ? '4px 6px' : '2px',
                                                        borderRadius: '4px',
                                                        margin: '3px 0'
                                                    }}>
                                                        <div style={{
                                                            ...styles.propKey, 
                                                            fontSize: isCoreInfo ? '13px' : '12px',
                                                            fontWeight: isCoreInfo ? 'bold' : 'normal',
                                                            color: isCoreInfo ? theme.accent : theme.text,
                                                            minWidth: '80px'
                                                        }} title={key}>{key}</div>
                                                        <div style={{
                                                            ...styles.propValue, 
                                                            fontFamily: isCoreInfo ? 'inherit' : 'monospace',
                                                            fontSize: isCoreInfo ? '13px' : '11px',
                                                            wordBreak: 'break-all',
                                                            fontWeight: isCoreInfo ? 'bold' : 'normal',
                                                            color: isCoreInfo ? theme.accent : theme.text
                                                        }} title={displayValue}>
                                                            {displayValue}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    
                                    {/* 分组的属性 */}
                                    {Object.entries(groupedProps).map(([groupName, props]) => (
                                        <div key={groupName} style={{
                                            marginBottom: '12px', 
                                            border: `1px solid ${theme.border}`, 
                                            borderRadius: '4px', 
                                            padding: '8px', 
                                            backgroundColor: theme.bg + '15'
                                        }}>
                                            <div style={{
                                                ...styles.propGroupTitle, 
                                                marginBottom: '8px', 
                                                fontSize: '13px', 
                                                fontWeight: 'bold',
                                                borderBottom: `1px solid ${theme.border}`, 
                                                paddingBottom: '4px',
                                                color: theme.primary
                                            }}>{groupName}</div>
                                            {renderNestedGroup(props, groupName, 0)}
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
