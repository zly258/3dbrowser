import React, { useState } from "react";
import { IconChevronRight, IconChevronDown } from "../theme/Icons";

interface PropertiesPanelProps {
    t: (key: string) => string;
    selectedProps: Record<string, Record<string, string>> | null;
    styles: any;
    theme: any;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ t, selectedProps, styles, theme }) => {
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState("");

    const toggleGroup = (group: string) => {
        const next = new Set(collapsed);
        if (next.has(group)) next.delete(group);
        else next.add(group);
        setCollapsed(next);
    };

    const filteredProps = React.useMemo(() => {
        if (!selectedProps || !searchQuery) return selectedProps;
        
        const query = searchQuery.toLowerCase();
        const result: Record<string, Record<string, string>> = {};
        
        Object.entries(selectedProps).forEach(([group, props]) => {
            const filteredGroupProps: Record<string, string> = {};
            Object.entries(props).forEach(([k, v]) => {
                if (k.toLowerCase().includes(query) || String(v).toLowerCase().includes(query)) {
                    filteredGroupProps[k] = v;
                }
            });
            
            if (Object.keys(filteredGroupProps).length > 0) {
                result[group] = filteredGroupProps;
            }
        });
        
        return result;
    }, [selectedProps, searchQuery]);

    return (
        <div style={{flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden'}}>
            {selectedProps && (
                <div style={{ padding: '8px', borderBottom: `1px solid ${theme.border}` }}>
                    <input
                        type="text"
                        placeholder={t("search_props")}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '4px 8px',
                            fontSize: '12px',
                            backgroundColor: theme.bg,
                            color: theme.text,
                            border: `1px solid ${theme.border}`,
                            borderRadius: '0px',
                            outline: 'none',
                            boxSizing: 'border-box'
                        }}
                    />
                </div>
            )}
            <div style={{ ...styles.list, flex: 1, overflowY: 'auto' }}>
                {filteredProps ? Object.entries(filteredProps).map(([group, props]) => (
                    <div key={group}>
                        <div 
                            style={styles.propGroupTitle} 
                            onClick={() => toggleGroup(group)}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.itemHover}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.bg}
                        >
                            <span>{group}</span>
                            <span style={{opacity: 0.6, display:'flex', alignItems:'center'}}>
                                {collapsed.has(group) 
                                    ? <IconChevronRight width={14} height={14} /> 
                                    : <IconChevronDown width={14} height={14} />
                                }
                            </span>
                        </div>
                        {!collapsed.has(group) && Object.entries(props).map(([k, v]) => (
                            <div key={k} style={styles.propRow}>
                                <div style={styles.propKey} title={k}>{k}</div>
                                <div style={styles.propValue} title={String(v)}>{String(v)}</div>
                            </div>
                        ))}
                    </div>
                )) : <div style={{padding:20, color: theme.textMuted, textAlign:'center', marginTop: 20}}>{t("no_selection")}</div>}
             </div>
        </div>
    );
};
