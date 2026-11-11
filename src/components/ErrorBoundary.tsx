import React, { Component } from "react";

interface ErrorBoundaryProps {
    children: React.ReactNode;
    t: (key: string) => string;
    theme?: any;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    public state: ErrorBoundaryState = {
        hasError: false,
        error: null
    };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return {
            hasError: true,
            error
        };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("ErrorBoundary captured error:", error, errorInfo);
    }

    private handleReload = () => {
        window.location.reload();
    };

    private handleReset = () => {
        this.setState({
            hasError: false,
            error: null
        });
    };

    render() {
        const { children, t, theme } = this.props;
        void theme;

        if (!this.state.hasError) {
            return children;
        }

        return (
            <div className="ui-error-boundary">
                <div className="ui-error-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                        <path d="M12 9v4" />
                        <path d="M12 17h.01" />
                    </svg>
                </div>

                <h1 className="ui-error-title">
                    {t("error_title") || "程序发生错误"}
                </h1>

                <p className="ui-error-message">
                    {t("error_msg") || "界面渲染过程中发生异常，可以尝试恢复界面或重新加载。"}
                </p>

                {this.state.error?.message && (
                    <div className="ui-toolpanel-overlay-card">
                        <div className="ui-toolpanel-overlay-title">
                            {t("error_detail") || "错误详情"}
                        </div>
                        <div className="ui-toolpanel-caption">
                            {this.state.error.message}
                        </div>
                    </div>
                )}

                <div className="ui-error-actions">
                    <button
                        type="button"
                        className="ui-btn ui-btn-default ui-modal-action-btn"
                        onClick={this.handleReset}
                    >
                        {t("btn_cancel") || "尝试恢复"}
                    </button>

                    <button
                        type="button"
                        className="ui-btn ui-btn-primary ui-modal-action-btn"
                        onClick={this.handleReload}
                    >
                        {t("error_reload") || "重新加载"}
                    </button>
                </div>
            </div>
        );
    }
}