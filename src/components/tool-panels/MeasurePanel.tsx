import React, { useMemo } from "react";
import { FloatingPanel } from "./FloatingPanel";
import { Button, SegmentedControl } from "../common";

// ==================== 图标组件 ====================
const Icons = {
  Trash: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Distance: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 8h12M8 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Angle: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 14L14 14M2 14l3.5-12 6 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Coordinate: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 2v12M2 8h12" strokeLinecap="round" />
    </svg>
  ),
  Area: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 12L6 4l5 6 2-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Volume: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 1l6 3.5v7L8 15l-6-3.5v-7z" strokeLinejoin="round" />
      <path d="M8 1v7M2 4.5L8 8l6-3.5" strokeLinejoin="round" />
    </svg>
  ),
  None: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <path d="M5 5l6 6M11 5l-6 6" strokeLinecap="round" />
    </svg>
  ),
  Close: () => (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 2L12 12M12 2L2 12" strokeLinecap="round" />
    </svg>
  ),
};

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

const ClearButton: React.FC<{ onClick: () => void; disabled: boolean }> = ({ onClick, disabled }) => {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      variant="ghost"
      size="sm"
      className="ui-btn-icon"
      title="Clear All"
    >
      <Icons.Trash />
    </Button>
  );
};

// CAD风格数据面板
const DataPanel: React.FC<{
  children: React.ReactNode;
  empty: boolean;
  emptyText: string;
}> = ({ children, empty, emptyText }) => {
  return (
    <div className="ui-data-panel flex flex-col">
      {empty ? (
        <div className="ui-measure-empty">{emptyText}</div>
      ) : (
        children
      )}
    </div>
  );
};

// 测量历史项
const MeasureItem: React.FC<{
  item: any;
  isHighlighted: boolean;
  onHighlight: () => void;
  onDelete: () => void;
}> = ({ item, isHighlighted, onHighlight, onDelete }) => {
  return (
    <div
      onClick={onHighlight}
      className={`ui-list-item ui-measure-item ${isHighlighted ? 'selected' : ''}`}
    >
      <span className="ui-measure-item-value">
        {item.val}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="ui-btn ui-btn-icon-sm ui-btn-ghost"
        style={{ opacity: 0.6, marginLeft: '8px' }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
      >
        <Icons.Close />
      </button>
    </div>
  );
};

// 类型分组标题
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

  const measureOptions = [
    { value: 'none', label: t("measure_none") || 'None', icon: <Icons.None /> },
    { value: 'dist', label: t("measure_dist") || 'Distance', icon: <Icons.Distance /> },
    { value: 'angle', label: t("measure_angle") || 'Angle', icon: <Icons.Angle /> },
    { value: 'coord', label: t("measure_coord") || 'Coord', icon: <Icons.Coordinate /> },
  ];

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
      case 'dist': return t("measure_dist") || 'Distance';
      case 'angle': return t("measure_angle") || 'Angle';
      case 'coord': return t("measure_coord") || 'Coordinate';
      default: return type;
    }
  };

  return (
    <FloatingPanel
      title={t("measure_title")}
      onClose={onClose}
      width={300}
      height={400}
      resizable={true}
      storageId="tool_measure"
    >
      <div className="ui-toolpanel-body">
        <div className="ui-panel-hero">
          <div className="ui-panel-hero-main">
            <div className="ui-panel-hero-title">{t("measure_title")}</div>
            <div className="ui-panel-hero-subtitle">
              {getInstructionText() || (t("measure_panel_hint") || "选择测量模式后，在视口中拾取点位开始测量")}
            </div>
          </div>
          <div className="ui-panel-hero-meta">
            {measureHistory.length} {t("search_results") || "项"}
          </div>
        </div>

        <div className="ui-toolpanel-row-between">
          <div className="ui-measure-types">
            <SegmentedControl
              options={measureOptions}
              value={measureType}
              onChange={handleTypeChange}
            />
          </div>
          <ClearButton onClick={onClear} disabled={measureHistory.length === 0} />
        </div>

        {measureType !== 'none' && (
          <div className="ui-toolpanel-row-between ui-toolpanel-caption">
            <span>{getInstructionText()}</span>
            <span className="ui-toolpanel-caption-muted">[ESC] Exit</span>
          </div>
        )}

        <DataPanel empty={measureHistory.length === 0} emptyText={t("no_measurements") || 'No measurements'}>
          {measureHistory.length > 0 && (
            <div className="flex flex-col" style={{ overflow: 'auto' }}>
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
