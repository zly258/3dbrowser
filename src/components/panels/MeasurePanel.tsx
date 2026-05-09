import React, { useMemo } from "react";
import { FloatingPanel } from "./FloatingPanel";
import { Button } from "../common";
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
        className="ui-btn ui-btn-icon-sm ui-btn-ghost ui-measure-item-delete"
      >
        <Icons.Close />
      </button>
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
      case 'dist': return t("measure_dist") || 'Distance';
      case 'angle': return t("measure_angle") || 'Angle';
      case 'coord': return t("measure_coord") || 'Coordinate';
      default: return type;
    }
  };

  return (
    <FloatingPanel
      title={t("measure_title")}
      closeLabel={t("panel_close") || "关闭"}
      onClose={onClose}
      width={300}
      height={400}
      resizable={true}
      storageId="tool_measure"
    >
      <div className="ui-toolpanel-body">
        <div className="ui-toolpanel-row-between">
          <div className="ui-segmented ui-measure-types">
            <button
              className={`ui-segmented-item ${measureType === 'none' ? 'active' : ''}`}
              onClick={() => handleTypeChange('none')}
            >
              <span>{t("measure_none") || 'None'}</span>
            </button>
            <button
              className={`ui-segmented-item ${measureType === 'dist' ? 'active' : ''}`}
              onClick={() => handleTypeChange('dist')}
            >
              <span>{t("measure_dist") || 'Distance'}</span>
            </button>
            <button
              className={`ui-segmented-item ${measureType === 'angle' ? 'active' : ''}`}
              onClick={() => handleTypeChange('angle')}
            >
              <span>{t("measure_angle") || 'Angle'}</span>
            </button>
            <button
              className={`ui-segmented-item ${measureType === 'coord' ? 'active' : ''}`}
              onClick={() => handleTypeChange('coord')}
            >
              <span>{t("measure_coord") || 'Coord'}</span>
            </button>
          </div>
          <ClearButton onClick={onClear} disabled={measureHistory.length === 0} />
        </div>

        <div className="ui-toolpanel-row-between ui-toolpanel-caption">
          <span>{getInstructionText()}</span>
          {measureType !== 'none' && <span className="ui-toolpanel-caption-muted">[ESC] Exit</span>}
        </div>

        <DataPanel empty={measureHistory.length === 0} emptyText={t("no_measurements") || 'No measurements'}>
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
