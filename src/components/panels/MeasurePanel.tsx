import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FloatingPanel } from "./FloatingPanel";
import { Button } from "../common";
import { IconCopy } from "../../theme/Icons";

const Icons = {
  Trash: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Close: () => (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 2L12 12M12 2L2 12" strokeLinecap="round" />
    </svg>
  ),
};

/** 复制到剪贴板；非安全上下文回退到 execCommand */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 忽略，走回退
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

const CopiedMark = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

interface MeasurePanelProps {
  t: any;
  sceneMgr: any;
  measureType: any;
  setMeasureType: any;
  measureHistory: any[];
  onDelete: (id: string) => void;
  onClear: () => void;
  onClose?: () => void;
    theme?: any;
  highlightedId?: string;
  onHighlight?: (id: string) => void;
}

const ClearButton: React.FC<{ onClick: () => void; disabled: boolean; title: string }> = ({ onClick, disabled, title }) => {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      variant="ghost"
      className="ui-btn-icon"
      title={title}
      aria-label={title}
    >
      <Icons.Trash />
    </Button>
  );
};
const DataPanel: React.FC<{
  children: React.ReactNode;
  empty: boolean;
  emptyText: string;
}> = ({ children, empty, emptyText }) => {
  return (
    <div className="ui-data-panel ui-measure-results">
      {empty ? (
        <div className="ui-measure-empty">{emptyText}</div>
      ) : (
        children
      )}
    </div>
  );
};
const MeasureItem: React.FC<{
  item: any;
  isHighlighted: boolean;
  onHighlight: () => void;
  onDelete: () => void;
  copyLabel: string;
  copiedLabel: string;
}> = ({ item, isHighlighted, onHighlight, onDelete, copyLabel, copiedLabel }) => {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const handleCopy = useCallback(async (event: React.MouseEvent) => {
    event.stopPropagation();
    const ok = await copyText(String(item.val ?? ""));
    if (!ok) return;
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setCopied(false);
    }, 1200);
  }, [item.val]);

  return (
    <div
      onClick={onHighlight}
      className={`ui-list-item ui-measure-item ${isHighlighted ? 'selected' : ''}`}
    >
      <span className="ui-measure-item-value">
        {item.val}
      </span>
      <div className="ui-measure-item-actions">
        <button
          onClick={handleCopy}
          className={`ui-btn ui-btn-icon-sm ui-btn-ghost ui-measure-item-copy${copied ? " is-copied" : ""}`}
          title={copied ? copiedLabel : copyLabel}
          aria-label={copied ? copiedLabel : copyLabel}
        >
          {copied ? <span className="ui-measure-item-copied-mark" aria-hidden="true"><CopiedMark /></span> : <IconCopy size={12} />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="ui-btn ui-btn-icon-sm ui-btn-ghost ui-measure-item-delete"
        >
          <Icons.Close />
        </button>
      </div>
    </div>
  );
};
const TypeHeader: React.FC<{ label: string }> = ({ label }) => {
  return (
    <div className="ui-group-title">{label}</div>
  );
};

export const MeasurePanel: React.FC<MeasurePanelProps> = ({
  t, sceneMgr, measureType, setMeasureType,
  measureHistory, onDelete, onClear, onClose,
  highlightedId, onHighlight
}) => {
  const [confirmClear, setConfirmClear] = useState(false);

  // 测量被清空/关闭时收起二次确认，避免残留
  useEffect(() => {
    if (measureHistory.length === 0) setConfirmClear(false);
  }, [measureHistory.length]);

  const groupedHistory = useMemo(() => {
    const groups: Record<string, any[]> = {
      'dist': [],
      'angle': [],
      'coord': []
    };
    measureHistory.forEach((item: any) => {
      if (groups[item.type]) groups[item.type].push(item);
    });
    return groups;
  }, [measureHistory]);

  const handleTypeChange = (type: string) => {
    setMeasureType(type);
    sceneMgr?.startMeasurement(type);
  };

  const getInstructionText = () => {
    switch (measureType) {
      case 'dist': return t("measure_instruct_dist");
      case 'angle': return t("measure_instruct_angle");
      case 'coord': return t("measure_instruct_coord");
      default: return '';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'dist': return t("measure_dist");
      case 'angle': return t("measure_angle");
      case 'coord': return t("measure_coord");
      default: return type;
    }
  };

  return (
    <FloatingPanel
      title={t("measure_title")}
      closeLabel={t("panel_close")}
      onClose={onClose}
      width={300}
      height={400}
      resizable={true}
      storageId="tool_measure"
    >
      <div className="ui-toolpanel-body">
        <div className="ui-toolpanel-row-between ui-measure-header">
          <div className="ui-segmented ui-measure-types">
            <button
              className={`ui-segmented-item ${measureType === 'none' ? 'active' : ''}`}
              onClick={() => handleTypeChange('none')}
            >
              <span>{t("measure_none")}</span>
            </button>
            <button
              className={`ui-segmented-item ${measureType === 'dist' ? 'active' : ''}`}
              onClick={() => handleTypeChange('dist')}
            >
              <span>{t("measure_dist")}</span>
            </button>
            <button
              className={`ui-segmented-item ${measureType === 'angle' ? 'active' : ''}`}
              onClick={() => handleTypeChange('angle')}
            >
              <span>{t("measure_angle")}</span>
            </button>
            <button
              className={`ui-segmented-item ${measureType === 'coord' ? 'active' : ''}`}
              onClick={() => handleTypeChange('coord')}
            >
              <span>{t("measure_coord")}</span>
            </button>
          </div>
          <ClearButton
            onClick={() => setConfirmClear(true)}
            disabled={measureHistory.length === 0}
            title={t("measure_clear")}
          />
        </div>

        <div className="ui-toolpanel-row-between ui-toolpanel-caption">
          <span>{getInstructionText()}</span>
          {measureType !== 'none' && <span className="ui-toolpanel-caption-muted">{t("esc_exit")}</span>}
        </div>

        {confirmClear && measureHistory.length > 0 && (
          <div className="ui-measure-confirm" role="alertdialog" aria-label={t("measure_clear_confirm")}>
            <div className="ui-measure-confirm-text">{t("measure_clear_confirm")}</div>
            <div className="ui-measure-confirm-actions">
              <Button variant="default" onClick={() => setConfirmClear(false)}>
                {t("btn_cancel")}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmClear(false);
                  onClear();
                }}
              >
                {t("measure_clear")}
              </Button>
            </div>
          </div>
        )}

        <DataPanel empty={measureHistory.length === 0} emptyText={t("no_measurements")}>
          {measureHistory.length > 0 && (
            <div className="ui-measure-results-scroll">
              {(Object.entries(groupedHistory) as [string, any[]][]).map(([type, items]) => {
                if (items.length === 0) return null;
                return (
                  <div key={type}>
                    <TypeHeader label={getTypeLabel(type)} />
                    {items.map((item) => (
                      <MeasureItem
                        key={item.id}
                        item={item}
                        isHighlighted={highlightedId === item.id}
                        onHighlight={() => onHighlight?.(item.id)}
                        onDelete={() => onDelete(item.id)}
                        copyLabel={t("measure_copy_value")}
                        copiedLabel={t("measure_copied")}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </DataPanel>
      </div>
    </FloatingPanel>
  );
};
