
import React from "react";
import { styles, colors } from "../Styles";
import { IconClose } from "../Icons";
import { TFunc } from "../Locales";

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    t: TFunc;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ isOpen, title, message, onConfirm, onCancel, t }) => {
    if (!isOpen) return null;

    return (
        <div style={styles.modalOverlay}>
            <div style={{...styles.modalContent, width: '320px', height: 'auto'}}>
                <div style={styles.floatingHeader}>
                    <span>{title}</span>
                    <div onClick={onCancel} style={{ cursor: 'pointer' }}><IconClose /></div>
                </div>
                
                <div style={{padding: '20px', color: '#eee', fontSize: '13px', lineHeight: '1.5'}}>
                    {message}
                </div>

                <div style={{padding: '15px 20px', borderTop: `1px solid ${colors.border}`, display: 'flex', gap: '10px', justifyContent: 'flex-end'}}>
                     <button 
                        style={{...styles.btn, backgroundColor: 'transparent', flex: '0 0 auto', width: '80px'}} 
                        onClick={onCancel}
                    >
                        {t("btn_cancel")}
                    </button>
                    <button 
                        style={{...styles.btn, backgroundColor: colors.danger, border: 'none', flex: '0 0 auto', width: '80px'}} 
                        onClick={onConfirm}
                    >
                        {t("btn_confirm")}
                    </button>
                </div>
            </div>
        </div>
    );
};
