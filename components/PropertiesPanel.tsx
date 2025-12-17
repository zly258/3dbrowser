

import React from "react";

interface PropertiesPanelProps {
    t: (key: string) => string;
    selectedProps: Record<string, Record<string, string>> | null;
    styles: any;
    theme: any;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ t, selectedProps, styles, theme }) => {
    return (
        <div style={{flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
             <div style={styles.panelHeader}>{t("interface_props")}</div>
             <div style={styles.list}>
                {selectedProps ? Object.entries(selectedProps).map(([group, props]) => (
                    <div key={group}>
                        <div style={styles.propGroupTitle}>{group}</div>
                        {Object.entries(props).map(([k, v]) => (
                            <div key={k} style={styles.propRow}>
                                <div style={styles.propKey} title={k}>{k}</div>
                                <div style={styles.propValue} title={String(v)}>{String(v)}</div>
                            </div>
                        ))}
                    </div>
                )) : <div style={{padding:20, color: theme.textMuted, textAlign:'center'}}>{t("no_selection")}</div>}
             </div>
        </div>
    );
};
