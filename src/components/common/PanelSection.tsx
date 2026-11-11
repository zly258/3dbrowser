import React from "react";

export interface PanelSectionProps {
  title?: React.ReactNode;
  children?: React.ReactNode;
  theme?: any;
  style?: React.CSSProperties;
  className?: string;
}

export const PanelSection: React.FC<PanelSectionProps> = ({
  title,
  children,
  theme,
  style,
  className = ""
}) => {
  void theme;

  return (
    <section className={`ui-section-block ${className}`} style={style}>
      {title && (
        <div className="ui-section-header">
          <span className="ui-section-title">{title}</span>
          <div className="ui-section-divider" />
        </div>
      )}
      {children}
    </section>
  );
};