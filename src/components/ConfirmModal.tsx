import React from "react";
import { TFunc } from "../theme/locales";
import { Button } from "./common";
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

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    t,
    theme
}) => {
    if (!isOpen) return null;

    return (
        <FloatingPanel
            title={title}
            onClose={onCancel}
            closeLabel={t("panel_close") || "关闭"}
            width={400}
            autoHeight={true}
            modal={true}
            movable={false}
            theme={theme}
        >
            <div className="ui-modal-body ui-modal-body-confirm">
                <div className="ui-modal-message">
                    {message}
                </div>
                <div className="ui-modal-actions">
                    <Button
                        variant="default"
                        className="ui-modal-action-btn"
                        onClick={onCancel}
                    >
                        {t("btn_cancel")}
                    </Button>
                    <Button
                        variant="danger"
                        className="ui-modal-action-btn"
                        onClick={onConfirm}
                    >
                        {t("btn_confirm")}
                    </Button>
                </div>
            </div>
        </FloatingPanel>
    );
};
