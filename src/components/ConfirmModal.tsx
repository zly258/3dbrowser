import React from "react";
import { IconClose } from "../theme/Icons";
import { TFunc } from "../theme/Locales";

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    t: TFunc;
    styles: any;
    theme: any;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ isOpen, title, message, onConfirm, onCancel, t, styles, theme }) => {
    if (!isOpen) return null;

    return (
        <div style={styles.modalOverlay}>
            <div style={{...styles.modalContent, width: '320px', height: 'auto'}}>
                <div style={styles.floatingHeader}>
                    <span>{title}</span>
                    <div onClick={onCancel} style={{ cursor: 'pointer', opacity: 0.6, display:'flex', padding: 2, borderRadius: 0 }}>
                        <IconClose width={20} height={20} />
                    </div>
                </div>
                
                <div style={{padding: '20px', color: theme.text, fontSize: '13px', lineHeight: '1.5'}}>
                    {message}
                </div>

                <div style={{padding: '15px 20px', borderTop: `1px solid ${theme.border}`, display: 'flex', gap: '10px', justifyContent: 'flex-end'}}>
                     <button 
                        style={{...styles.btn, backgroundColor: 'transparent', flex: '0 0 auto', width: '80px'}} 
                        onClick={onCancel}
                    >
                        {t("btn_cancel")}
                    </button>
                    <button 
                        style={{...styles.btn, backgroundColor: theme.danger, borderColor: theme.danger, color: 'white', flex: '0 0 auto', width: '80px'}} 
                        onClick={onConfirm}
                    >
                        {t("btn_confirm")}
                    </button>
                </div>
            </div>
        </div>
    );
};
