import React from "react";
import { TFunc } from "../theme/locales";
import { FloatingPanel } from "./panels/FloatingPanel";

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
            height={188}
            modal={true}
            movable={false}
            theme={theme}
        >
            <div
                className="ui-modal-body ui-modal-body-confirm"
            >
                <div className="ui-modal-message">
                    {message}
                </div>
                <div className="ui-modal-actions">
                    <button
                        className="ui-btn ui-btn-default ui-modal-action-btn"
                        onClick={onCancel}
                    >
                        {t("btn_cancel")}
                    </button>
                    <button
                        className="ui-btn ui-btn-danger ui-modal-action-btn"
                        onClick={onConfirm}
                    >
                        {t("btn_confirm")}
                    </button>
                </div>
            </div>
        </FloatingPanel>
    );
};
