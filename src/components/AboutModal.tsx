import React, { useState } from "react";
import { IconChevronDown, IconChevronUp } from "../theme/Icons";
import { TFunc } from "../theme/Locales";
import { FloatingPanel } from "./ToolPanels/index";

interface AboutModalProps {
    isOpen: boolean;
    onClose: () => void;
    t: TFunc;
        theme: any;
}

declare const __APP_VERSION__: string;

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, t, theme }) => {
    if (!isOpen) return null;

    const [showLicenseDetails, setShowLicenseDetails] = useState(true);

    return (
        <FloatingPanel
            title={t("about_title")}
            onClose={onClose}
            width={400}
            height={520}
            modal={true}
            movable={false}
            theme={theme}
        >
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', height: '100%', overflowY: 'auto' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '6px', color: 'var(--text-primary)' }}>3D Browser</div>
                    <div style={{ fontSize: '11px', opacity: 0.7 }}>Professional 3D Model Viewer</div>
                </div>

                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                        <span style={{ opacity: 0.7 }}>{t("about_version")}</span>
                        <span style={{ fontWeight: '500' }}>{__APP_VERSION__}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                        <span style={{ opacity: 0.7 }}>{t("about_author")}</span>
                        <span style={{ fontWeight: '500' }}>zhangly1403@163.com</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                        <span style={{ opacity: 0.7 }}>{t("project_url")}</span>
                        <a href="https://github.com/zly258/3dbrowser" target="_blank" rel="noopener noreferrer" className="ui-link">
                            github.com/zly258/3dbrowser
                        </a>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                        <span style={{ opacity: 0.7 }}>{t("about_license")}</span>
                        <span style={{ fontWeight: '500', color: 'var(--error)' }}>{t("about_license_nc")}</span>
                    </div>
                </div>

                {/* 授权协议详细内容 */}
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 12px',
                            backgroundColor: 'var(--bg-header)',
                            cursor: 'pointer',
                            userSelect: 'none'
                        }}
                        onClick={() => setShowLicenseDetails(!showLicenseDetails)}
                    >
                        <span style={{ fontWeight: '500', fontSize: '12px' }}>{t("license_details")}</span>
                        {showLicenseDetails ? <IconChevronUp width={14} height={14} /> : <IconChevronDown width={14} height={14} />}
                    </div>
                    {showLicenseDetails && (
                        <div style={{ padding: '12px', fontSize: '11px', lineHeight: '1.5', backgroundColor: 'var(--bg-primary)', maxHeight: '180px', overflowY: 'auto' }}>
                            <div style={{ whiteSpace: 'pre-wrap', marginBottom: '8px' }}>{t("license_summary")}</div>
                            <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '8px' }}>
                                {t("full_license")} <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener noreferrer" className="ui-link">CC BY-NC 4.0</a>
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ fontSize: '11px', opacity: 0.5, textAlign: 'center', marginTop: 'auto' }}>
                    Copyright © 2026. All rights reserved.
                </div>
            </div>
        </FloatingPanel>
    );
};
