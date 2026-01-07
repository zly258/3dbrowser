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

    const toggleGroup = (group: string) => {
        const next = new Set(collapsed);
        if (next.has(group)) next.delete(group);
        else next.add(group);
        setCollapsed(next);
    };

    return (
        <div style={{flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden'}}>
             <div style={styles.list}>
                {selectedProps ? Object.entries(selectedProps).map(([group, props]) => (
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
