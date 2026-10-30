import React, { useState } from "react";
import { IconChevronDown, IconChevronUp } from "../theme/Icons";
import { TFunc } from "../theme/locales";
import { FloatingPanel } from "./panels/index";

interface AboutModalProps {
    isOpen: boolean;
    onClose: () => void;
    t: TFunc;
    theme: any;
}

declare const __APP_VERSION__: string;

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, t, theme }) => {
    if (!isOpen) return null;

    const [showLicenseDetails, setShowLicenseDetails] = useState(false);

    if (!isOpen) return null;

    return (
        <FloatingPanel
            title={t("about_title")}
            onClose={onClose}
            closeLabel={t("panel_close") || "关闭"}
            width={460}
            autoHeight={true}
            modal={true}
            movable={false}
            theme={theme}
        >
            <div className="ui-modal-body ui-modal-body-scroll ui-about-modal">
                <div className="ui-about-hero">
                    <div className="ui-about-app-name">3D Browser</div>
                    <div className="ui-about-tagline">{t("about_tagline")}</div>
                </div>

                <div className="ui-about-meta-card">
                    <div className="ui-about-meta-row">
                        <span className="ui-about-meta-label">{t("about_version")}</span>
                        <span className="ui-about-meta-value">{__APP_VERSION__}</span>
                    </div>
                    <div className="ui-about-meta-row">
                        <span className="ui-about-meta-label">{t("about_author")}</span>
                        <span className="ui-about-meta-value">zhangly1403@163.com</span>
                    </div>
                    <div className="ui-about-meta-row">
                        <span className="ui-about-meta-label">{t("project_url")}</span>
                        <a
                            href="https://github.com/zly258/3dbrowser"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ui-link"
                        >
                            github.com/zly258/3dbrowser
                        </a>
                    </div>
                    <div className="ui-about-meta-row">
                        <span className="ui-about-meta-label">{t("about_license")}</span>
                        <span className="ui-about-meta-value ui-about-license-badge">
                            {t("about_license_nc")}
                        </span>
                    </div>
                </div>

                <div className="ui-about-license-card">
                    <button
                        type="button"
                        className="ui-about-license-toggle"
                        onClick={() => setShowLicenseDetails((prev) => !prev)}
                    >
                        <span className="ui-about-license-title">{t("license_details")}</span>
                        {showLicenseDetails ? (
                            <IconChevronUp width={14} height={14} />
                        ) : (
                            <IconChevronDown width={14} height={14} />
                        )}
                    </button>

                    {showLicenseDetails && (
                        <div className="ui-about-license-content">
                            <div className="ui-about-license-summary">
                                {t("license_summary")}
                            </div>
                            <div className="ui-about-license-link">
                                {t("full_license")}{" "}
                                <a
                                    href="https://creativecommons.org/licenses/by-nc/4.0/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ui-link"
                                >
                                    CC BY-NC 4.0
                                </a>
                            </div>
                        </div>
                    )}
                </div>

                <div className="ui-about-footer">
                    {t("about_copyright")}
                </div>
            </div>
        </FloatingPanel>
    );
};
