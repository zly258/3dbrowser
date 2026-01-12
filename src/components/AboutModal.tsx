import React from "react";
import { IconClose } from "../theme/Icons";
import { TFunc } from "../theme/Locales";

interface AboutModalProps {
    isOpen: boolean;
    onClose: () => void;
    t: TFunc;
    styles: any;
    theme: any;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, t, styles, theme }) => {
    if (!isOpen) return null;

    return (
        <div style={styles.modalOverlay} onClick={onClose}>
            <div 
                style={{...styles.modalContent, width: '360px', height: 'auto'}} 
                onClick={e => e.stopPropagation()}
            >
                <div style={styles.floatingHeader}>
                    <span>{t("about_title")}</span>
                    <div onClick={onClose} style={{ cursor: 'pointer', opacity: 0.6, display:'flex', padding: 2, borderRadius: 0 }}>
                        <IconClose width={20} height={20} />
                    </div>
                </div>
                
                <div style={{padding: '30px 20px', color: theme.text, display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center'}}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', color: theme.accent }}>3D Browser</div>
                        <div style={{ fontSize: '12px', opacity: 0.7 }}>Professional 3D Model Viewer</div>
                    </div>

                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.border}`, paddingBottom: '8px' }}>
                            <span style={{ opacity: 0.7 }}>{t("about_author")}</span>
                            <span style={{ fontWeight: '500' }}>zhangly1403@163.com</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.border}`, paddingBottom: '8px' }}>
                            <span style={{ opacity: 0.7 }}>{t("about_license")}</span>
                            <span style={{ fontWeight: '500', color: theme.danger }}>{t("about_license_nc")}</span>
                        </div>
                    </div>

                    <div style={{ fontSize: '12px', opacity: 0.5, textAlign: 'center', marginTop: '10px' }}>
                        Copyright © 2026. All rights reserved.
                    </div>
                </div>

                <div style={{padding: '15px 20px', borderTop: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'center'}}>
                     <button 
                        style={{...styles.btn, backgroundColor: theme.accent, borderColor: theme.accent, color: 'white', width: '100px'}} 
                        onClick={onClose}
                    >
                        {t("btn_confirm")}
                    </button>
                </div>
            </div>
        </div>
    );
};
