import React from "react";
import { TFunc } from "../theme/Locales";
import { FloatingPanel } from "./ToolPanels/FloatingPanel";

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
        <FloatingPanel
            title={title}
            onClose={onCancel}
            width={360}
            height={220}
            modal={true}
            movable={false}
            theme={theme}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    padding: '16px',
                    gap: '16px'
                }}
            >
                <div
                    className="text-base"
                    style={{
                        flex: 1,
                        color: 'var(--text-primary)',
                        lineHeight: 1.6
                    }}
                >
                    {message}
                </div>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '10px',
                        borderTop: '1px solid var(--border-color)',
                        paddingTop: '14px'
                    }}
                >
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
        </FloatingPanel>
    );
};
