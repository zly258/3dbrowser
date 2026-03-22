import React, { Component } from "react";
import { DEFAULT_FONT } from "../theme/Styles";

interface ErrorBoundaryProps {
    children: React.ReactNode;
    t: any;
        theme: any;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

// 错误边界组件
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    public state: ErrorBoundaryState;

    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("ErrorBoundary捕获到错误:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            const { t, theme } = this.props;
            return (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    height: '100%', width: '100%', backgroundColor: theme.bg, color: theme.text,
                    fontFamily: DEFAULT_FONT, gap: '20px', padding: '40px', textAlign: 'center'
                }}>
                    <div style={{ fontSize: '64px' }}>⚠️</div>
                    <h1 style={{ fontSize: '24px', margin: 0 }}>{t("error_title")}</h1>
                    <p style={{ color: theme.textMuted, maxWidth: '600px', lineHeight: '1.6' }}>
                        {t("error_msg")}
                    </p>
                    <button 
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '10px 24px', backgroundColor: theme.accent, color: '#fff',
                            border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
                        }}
                    >
                        {t("error_reload")}
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
