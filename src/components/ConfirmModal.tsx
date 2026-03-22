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
        theme: any;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ isOpen, title, message, onConfirm, onCancel, t, theme }) => {
    if (!isOpen) return null;

    return (
        <div className="ui-modal-overlay">
            <div className="ui-modal" style={{ width: '320px', height: 'auto' }}>
                <div className="ui-modal-header">
                    <span className="ui-modal-title">{title}</span>
                    <button className="ui-modal-close" onClick={onCancel}>
                        <IconClose width={20} height={20} />
                    </button>
                </div>
                
                <div className="ui-modal-body text-base">
                    {message}
                </div>

                <div className="ui-modal-footer">
                     <button 
                        className="ui-btn ui-btn-ghost w-[80px]"
                        onClick={onCancel}
                    >
                        {t("btn_cancel")}
                    </button>
                    <button 
                        className="ui-btn ui-btn-danger w-[80px]"
                        style={{ backgroundColor: 'var(--error)', borderColor: 'var(--error)', color: 'white' }}
                        onClick={onConfirm}
                    >
                        {t("btn_confirm")}
                    </button>
                </div>
            </div>
        </div>
    );
};
