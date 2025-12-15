

import React from "react";
import { styles } from "../Styles";

interface PropertiesPanelProps {
    t: (key: string) => string;
    selectedProps: Record<string, Record<string, string>> | null;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ t, selectedProps }) => {
    return (
        <div style={{flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
             <div style={styles.panelHeader}>{t("interface_props")}</div>
             <div style={styles.list}>
                {selectedProps ? Object.entries(selectedProps).map(([group, props]) => (
                    <div key={group}>
                        <div style={styles.propGroupTitle}>{group}</div>
                        {Object.entries(props).map(([k, v]) => (
                            <div key={k} style={styles.propRow}>
                                <div style={styles.propKey}>{k}</div>
                                <div style={styles.propValue}>{String(v)}</div>
                            </div>
                        ))}
                    </div>
                )) : <div style={{padding:20, color:'#555', textAlign:'center'}}>{t("no_selection")}</div>}
             </div>
        </div>
    );
};
