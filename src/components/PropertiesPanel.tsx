import React, { useState } from "react";
import { IconChevronRight, IconChevronDown } from "../theme/Icons";

interface PropertiesPanelProps {
    t: (key: string) => string;
    selectedProps: Record<string, Record<string, string>> | null;
        theme: any;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ t, selectedProps, theme }) => {
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
                <div style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
                    <input
                        type="text"
                        placeholder={t("search_props")}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="ui-input"
                        style={{
                            width: '100%',
                            borderRadius: '0px',
                            boxSizing: 'border-box'
                        }}
                    />
                </div>
            )}
            <div className="flex-1 overflow-y-auto">
                {filteredProps ? Object.entries(filteredProps).map(([group, props]) => (
                    <div key={group}>
                        <div 
                            className="ui-prop-group" 
                            onClick={() => toggleGroup(group)}
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
                            <div key={k} className="ui-prop-row">
                                <div className="ui-prop-key" title={k}>{k}</div>
                                <div className="ui-prop-value" title={String(v)}>{String(v)}</div>
                            </div>
                        ))}
                    </div>
                )) : <div style={{padding:20, color: 'var(--text-muted)', textAlign:'center', marginTop: 20}}>{t("no_selection")}</div>}
             </div>
        </div>
    );
};
