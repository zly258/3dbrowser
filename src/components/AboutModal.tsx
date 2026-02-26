import React, { useState } from "react";
import { IconClose, IconChevronDown, IconChevronUp } from "../theme/Icons";
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

    const [showLicenseDetails, setShowLicenseDetails] = useState(false);
    const [showThirdParty, setShowThirdParty] = useState(false);

    const thirdPartyLibraries = [
        { name: "three", version: "^0.181.2", description: "3D graphics library" },
        { name: "react", version: "^19.2.0", description: "UI library" },
        { name: "react-dom", version: "^19.2.0", description: "React DOM renderer" },
        { name: "3d-tiles-renderer", version: "0.3.31", description: "3D Tiles rendering" },
        { name: "web-ifc", version: "^0.0.74", description: "IFC file parser" },
        { name: "occt-import-js", version: "^0.0.23", description: "CAD file import" },
        { name: "lucide-react", version: "^0.562.0", description: "Icon library" }
    ];



    return (
        <div style={styles.modalOverlay} onClick={onClose}>
            <div 
                style={{...styles.modalContent, width: '400px', maxHeight: '80vh'}} 
                onClick={e => e.stopPropagation()}
            >
                <div style={styles.floatingHeader}>
                    <span>{t("about_title")}</span>
                    <div onClick={onClose} style={{ cursor: 'pointer', opacity: 0.6, display:'flex', padding: 2, borderRadius: 0 }}>
                        <IconClose width={20} height={20} />
                    </div>
                </div>
                
                <div style={{padding: '25px 20px', color: theme.text, display: 'flex', flexDirection: 'column', gap: '18px'}}>
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
                            <span style={{ opacity: 0.7 }}>{t("project_url")}</span>
                            <a href="https://github.com/zly258/3dbrowser" target="_blank" rel="noopener noreferrer" style={{ fontWeight: '500', color: theme.accent, textDecoration: 'none' }}>
                                github.com/zly258/3dbrowser
                            </a>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${theme.border}`, paddingBottom: '8px' }}>
                            <span style={{ opacity: 0.7 }}>{t("about_license")}</span>
                            <span style={{ fontWeight: '500', color: theme.danger }}>{t("about_license_nc")}</span>
                        </div>
                    </div>

                    {/* 授权协议详细内容 */}
                    <div style={{ border: `1px solid ${theme.border}`, borderRadius: '6px', overflow: 'hidden' }}>
                        <div 
                            style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center', 
                                padding: '12px 15px', 
                                backgroundColor: theme.panel,
                                cursor: 'pointer',
                                userSelect: 'none'
                            }}
                            onClick={() => setShowLicenseDetails(!showLicenseDetails)}
                        >
                            <span style={{ fontWeight: '500', fontSize: '14px' }}>{t("license_details")}</span>
                            {showLicenseDetails ? <IconChevronUp width={16} height={16} /> : <IconChevronDown width={16} height={16} />}
                        </div>
                        {showLicenseDetails && (
                            <div style={{ padding: '15px', fontSize: '12px', lineHeight: '1.5', backgroundColor: theme.background, maxHeight: '200px', overflowY: 'auto' }}>
                                <div style={{ whiteSpace: 'pre-wrap', marginBottom: '10px' }}>{t("license_summary")}</div>
                                <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '10px' }}>
                                    {t("full_license")} <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener noreferrer" style={{ color: theme.accent, textDecoration: 'none' }}>CC BY-NC 4.0</a>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 第三方库信息 */}
                    <div style={{ border: `1px solid ${theme.border}`, borderRadius: '6px', overflow: 'hidden' }}>
                        <div 
                            style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center', 
                                padding: '12px 15px', 
                                backgroundColor: theme.panel,
                                cursor: 'pointer',
                                userSelect: 'none'
                            }}
                            onClick={() => setShowThirdParty(!showThirdParty)}
                        >
                            <span style={{ fontWeight: '500', fontSize: '14px' }}>{t("third_party_libs")}</span>
                            {showThirdParty ? <IconChevronUp width={16} height={16} /> : <IconChevronDown width={16} height={16} />}
                        </div>
                        {showThirdParty && (
                            <div style={{ padding: '15px', fontSize: '12px', lineHeight: '1.5', backgroundColor: theme.background, maxHeight: '200px', overflowY: 'auto' }}>
                                <div style={{ marginBottom: '10px', opacity: 0.8 }}>{t("third_party_desc")}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {thirdPartyLibraries.map((lib, index) => (
                                        <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: '500' }}>{lib.name}</div>
                                                <div style={{ fontSize: '11px', opacity: 0.7 }}>{lib.description}</div>
                                            </div>
                                            <div style={{ fontSize: '11px', opacity: 0.7, minWidth: '60px', textAlign: 'right' }}>{lib.version}</div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '10px', borderTop: `1px solid ${theme.border}`, paddingTop: '10px' }}>
                                    {t("view_package_json")}
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ fontSize: '12px', opacity: 0.5, textAlign: 'center', marginTop: '5px' }}>
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
