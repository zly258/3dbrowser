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
    // Hook 必须在提前 return 之前调用，否则弹窗开关会破坏 Hook 顺序
    const [showLicenseDetails, setShowLicenseDetails] = useState(false);

    if (!isOpen) return null;

    return (
        <FloatingPanel
            title={t("about_title")}
            onClose={onClose}
            closeLabel={t("panel_close")}
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
                        <span className="ui-about-meta-value">zhangly1403@qq.com</span>
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
                        <span className="ui-about-meta-label">{t("about_sponsor")}</span>
                        <a
                            href="https://ifdian.net/a/zhangly1403"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ui-link"
                        >
                            {t("about_sponsor_link")}
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
                                    href="https://www.gnu.org/licenses/gpl-3.0.html"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ui-link"
                                >
                                    GNU GPL v3.0
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
