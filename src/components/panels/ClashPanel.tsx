import React, { useEffect, useMemo, useState } from "react";
import { FloatingPanel } from "./FloatingPanel";
import { Button, Checkbox, InputNumber, PaginationControls, Select } from "../common";

export interface ClashResultItem {
  id: string;
  pairKey: string;
  groupKey: string;
  ruleId: string;
  aUuid: string;
  bUuid: string;
  aName: string;
  bName: string;
  overlapVolume: number;
  distance: number;
  severity: "high" | "medium" | "low";
  type: "hard" | "clearance";
  status: "new" | "confirmed" | "resolved";
}

type ClashFilter = "ALL" | "NEW" | "CONFIRMED" | "RESOLVED";
type ClashTypeFilter = "ALL" | "HARD" | "CLEARANCE";

interface ClashPanelProps {
  t: (key: string) => string;
  onClose: () => void;
  running: boolean;
  progress: number;
  status: string;
  scannedCount: number;
  pairsScanned: number;
  results: ClashResultItem[];
  resultFilter: ClashFilter;
  modelOptions: Array<{ id: string; name: string }>;
  setA: string[];
  setB: string[];
  tolerance: number;
  minOverlapVolume: number;
  clearanceDistance: number;
  useNarrowPhase: boolean;
  useTrianglePhase: boolean;
  includeSameModel: boolean;
  onSetAChange: (next: string[]) => void;
  onSetBChange: (next: string[]) => void;
  onToleranceChange: (next: number) => void;
  onMinOverlapVolumeChange: (next: number) => void;
  onClearanceDistanceChange: (next: number) => void;
  onUseNarrowPhaseChange: (next: boolean) => void;
  onUseTrianglePhaseChange: (next: boolean) => void;
  onIncludeSameModelChange: (next: boolean) => void;
  onRun: () => void;
  onCancel: () => void;
  onClear: () => void;
  onExportCsv: () => void;
  onIsolateByStatus: (status: "new" | "confirmed") => void;
  onRestoreVisibility: () => void;
  onResultFilterChange: (next: ClashFilter) => void;
  typeFilter: ClashTypeFilter;
  onTypeFilterChange: (next: ClashTypeFilter) => void;
  onUpdateResultStatus: (id: string, status: ClashResultItem["status"]) => void;
  onMarkFilteredStatus: (status: ClashResultItem["status"]) => void;
  onSetASelectAll: () => void;
  onSetAClear: () => void;
  onSetBSelectAll: () => void;
  onSetBClear: () => void;
  onFocusResult: (item: ClashResultItem) => void;
  theme?: any;
}

const useSafeText = (t: (key: string) => string) => {
  return (key: string, fallback: string) => {
    const value = t(key);
    return value && value !== key ? value : fallback;
  };
};

const SectionToggle: React.FC<{
  title: string;
  summary?: string;
  expanded: boolean;
  onToggle: () => void;
}> = ({ title, summary, expanded, onToggle }) => (
  <button type="button" className="ui-clash-section-toggle" onClick={onToggle}>
    <span className="ui-clash-section-title-wrap">
      <span className={`ui-clash-section-arrow${expanded ? " expanded" : ""}`}>›</span>
      <span className="ui-clash-section-title">{title}</span>
    </span>
    {summary && <span className="ui-clash-section-summary">{summary}</span>}
  </button>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="ui-clash-field">
    <span className="ui-clash-field-label">{label}</span>
    <span className="ui-clash-field-control">{children}</span>
  </label>
);

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
};

export const ClashPanel: React.FC<ClashPanelProps> = ({
  t,
  onClose,
  running,
  progress,
  status,
  scannedCount,
  pairsScanned,
  results,
  modelOptions,
  setA,
  setB,
  tolerance,
  minOverlapVolume,
  clearanceDistance,
  useNarrowPhase,
  useTrianglePhase,
  includeSameModel,
  onSetAChange,
  onSetBChange,
  onToleranceChange,
  onMinOverlapVolumeChange,
  onClearanceDistanceChange,
  onUseNarrowPhaseChange,
  onUseTrianglePhaseChange,
  onIncludeSameModelChange,
  onRun,
  onCancel,
  onClear,
  onExportCsv,
  onRestoreVisibility,
  typeFilter,
  onTypeFilterChange,
  onUpdateResultStatus,
  onSetASelectAll,
  onSetAClear,
  onSetBSelectAll,
  onSetBClear,
  onFocusResult,
  theme
}) => {
  const tr = useSafeText(t);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [scopeExpanded, setScopeExpanded] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [results.length, pageSize, typeFilter]);

  const filteredResults = useMemo(() => {
    if (typeFilter === "HARD") return results.filter((item) => item.type === "hard");
    if (typeFilter === "CLEARANCE") return results.filter((item) => item.type === "clearance");
    return results;
  }, [results, typeFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredResults.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageItems = useMemo(
    () => filteredResults.slice(pageStart, pageStart + pageSize),
    [filteredResults, pageStart, pageSize]
  );
  const setAIds = useMemo(() => new Set(setA), [setA]);
  const setBIds = useMemo(() => new Set(setB), [setB]);
  const safeProgress = Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0));
  const readyText = status || (running ? tr("clash_running", "正在执行碰撞检查...") : tr("clash_ready", "准备就绪"));
  const scopeSummary = `${tr("clash_set_a", "模型集 A")} ${setA.length} · ${tr("clash_set_b", "模型集 B")} ${setB.length}`;
  const resultsSummary = `${filteredResults.length} ${tr("clash_results", "碰撞结果")}`;
  const paramsSummary = `${tr("clash_tolerance", "容差")} ${tolerance} · ${tr("clash_clearance_distance", "净空")} ${clearanceDistance}`;

  const toggleFromSet = (source: string[], id: string, onChange: (next: string[]) => void) => {
    const nextSet = new Set(source);
    if (nextSet.has(id)) nextSet.delete(id);
    else nextSet.add(id);
    onChange(Array.from(nextSet));
  };

  return (
    <FloatingPanel
      title={tr("tb_clash", "碰撞")}
      closeLabel={tr("panel_close", "关闭")}
      onClose={onClose}
      width={560}
      height={560}
      resizable={true}
      storageId="tool_clash"
      autoHeight={false}
      theme={theme}
    >
      <div className="ui-toolpanel-body ui-clash-panel ui-clash-panel-compact">
        <div className="ui-clash-scroll">
          <div className="ui-clash-section ui-clash-overview-section">
            <div className="ui-clash-status-line">
              <div className="ui-clash-status-title">
                <span className={`ui-clash-status-dot${running ? " is-running" : ""}`} />
                <span>{readyText}</span>
              </div>
              <div className="ui-clash-mini-stats">
                <span>{tr("clash_candidates", "候选")} <b>{formatNumber(scannedCount)}</b></span>
                <span>{tr("clash_pairs_scanned", "已扫描")} <b>{formatNumber(pairsScanned)}</b></span>
                <span>{tr("clash_results", "结果")} <b>{formatNumber(results.length)}</b></span>
              </div>
            </div>
            <div className="ui-clash-actions-row">
              {!running ? (
                <Button className="ui-properties-action" onClick={onRun} variant="primary">
                  {tr("clash_run", "开始检查")}
                </Button>
              ) : (
                <Button className="ui-properties-action" onClick={onCancel}>
                  {tr("search_cancel", "取消")}
                </Button>
              )}
              <Button className="ui-properties-action" onClick={onClear}>
                {tr("clash_clear", "清空结果")}
              </Button>
              <Button className="ui-properties-action" onClick={onExportCsv} disabled={results.length === 0}>
                {tr("clash_export_csv", "导出 CSV")}
              </Button>
            </div>
          </div>

          <div className="ui-clash-section">
            <SectionToggle
              title={tr("clash_scope_visible", "检测范围")}
              summary={scopeSummary}
              expanded={scopeExpanded}
              onToggle={() => setScopeExpanded((prev) => !prev)}
            />
            {scopeExpanded && (
              <div className="ui-clash-section-content ui-clash-scope-grid">
                <div className="ui-selection-box">
                  <div className="ui-selection-box-header">
                    <div className="ui-toolpanel-caption-strong">{tr("clash_set_a", "模型集 A")}</div>
                    <div className="ui-selection-box-actions">
                      <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetASelectAll}>{tr("select_all", "全选")}</button>
                      <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetAClear}>{tr("search_clear", "清空")}</button>
                    </div>
                  </div>
                  <div className="ui-selection-box-list ui-clash-selection-list">
                    {modelOptions.length === 0 ? (
                      <div className="ui-toolpanel-caption ui-toolpanel-caption-muted">{tr("clash_no_models", "暂无模型")}</div>
                    ) : (
                      modelOptions.map((item) => (
                        <Checkbox
                          key={`a_${item.id}`}
                          checked={setAIds.has(item.id)}
                          onChange={() => toggleFromSet(setA, item.id, onSetAChange)}
                          label={item.name}
                          labelStyle={{ fontSize: 12 }}
                        />
                      ))
                    )}
                  </div>
                </div>
                <div className="ui-selection-box">
                  <div className="ui-selection-box-header">
                    <div className="ui-toolpanel-caption-strong">{tr("clash_set_b", "模型集 B")}</div>
                    <div className="ui-selection-box-actions">
                      <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetBSelectAll}>{tr("select_all", "全选")}</button>
                      <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetBClear}>{tr("search_clear", "清空")}</button>
                    </div>
                  </div>
                  <div className="ui-selection-box-list ui-clash-selection-list">
                    {modelOptions.length === 0 ? (
                      <div className="ui-toolpanel-caption ui-toolpanel-caption-muted">{tr("clash_no_models", "暂无模型")}</div>
                    ) : (
                      modelOptions.map((item) => (
                        <Checkbox
                          key={`b_${item.id}`}
                          checked={setBIds.has(item.id)}
                          onChange={() => toggleFromSet(setB, item.id, onSetBChange)}
                          label={item.name}
                          labelStyle={{ fontSize: 12 }}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="ui-clash-section">
            <SectionToggle
              title={tr("settings_more", "检测参数")}
              summary={paramsSummary}
              expanded={advancedExpanded}
              onToggle={() => setAdvancedExpanded((prev) => !prev)}
            />
            {advancedExpanded && (
              <div className="ui-clash-section-content ui-clash-settings-compact">
                <div className="ui-clash-fields-grid">
                  <Field label={tr("clash_tolerance", "容差")}>
                    <InputNumber
                      className="ui-input-compact ui-clash-input-full"
                      value={Number.isFinite(tolerance) ? tolerance : 0}
                      min={0}
                      step={0.001}
                      onChange={(value) => onToleranceChange(Math.max(0, value || 0))}
                    />
                  </Field>
                  <Field label={tr("clash_min_overlap", "最小重叠体积")}>
                    <InputNumber
                      className="ui-input-compact ui-clash-input-full"
                      value={Number.isFinite(minOverlapVolume) ? minOverlapVolume : 0}
                      min={0}
                      step={0.000001}
                      onChange={(value) => onMinOverlapVolumeChange(Math.max(0, value || 0))}
                    />
                  </Field>
                  <Field label={tr("clash_clearance_distance", "最小净空距离")}>
                    <InputNumber
                      className="ui-input-compact ui-clash-input-full"
                      value={Number.isFinite(clearanceDistance) ? clearanceDistance : 0}
                      min={0}
                      step={0.001}
                      onChange={(value) => onClearanceDistanceChange(Math.max(0, value || 0))}
                    />
                  </Field>
                </div>
                <div className="ui-clash-option-stack ui-clash-option-grid">
                  <Checkbox
                    checked={useNarrowPhase}
                    onChange={onUseNarrowPhaseChange}
                    label={tr("clash_narrow_phase", "精筛（OBB）")}
                    labelStyle={{ fontSize: 12 }}
                  />
                  <Checkbox
                    checked={useTrianglePhase}
                    onChange={onUseTrianglePhaseChange}
                    label={tr("clash_triangle_phase", "三角面复核")}
                    labelStyle={{ fontSize: 12 }}
                  />
                  <Checkbox
                    checked={includeSameModel}
                    onChange={onIncludeSameModelChange}
                    label={tr("clash_include_same_model", "同模型内检测")}
                    labelStyle={{ fontSize: 12 }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="ui-clash-section ui-clash-results-section">
            <div className="ui-clash-section-toggle ui-clash-section-toggle-static">
              <span className="ui-clash-section-title-wrap">
                <span className="ui-clash-section-title">{tr("clash_results", "碰撞结果")}</span>
              </span>
              <span className="ui-clash-section-summary">{resultsSummary}</span>
            </div>
            <div className="ui-clash-section-content ui-clash-results-content">
              <div className="ui-clash-results-toolbar ui-clash-results-toolbar-simple">
                  <Select
                    value={typeFilter}
                    onChange={(value) => onTypeFilterChange(value as ClashTypeFilter)}
                    options={[
                      { value: "ALL", label: tr("clash_type_all", "全部类型") },
                      { value: "HARD", label: tr("clash_type_hard", "硬碰撞") },
                      { value: "CLEARANCE", label: tr("clash_type_clearance", "净空碰撞") }
                    ]}
                    className="ui-input-compact ui-clash-filter-select"
                    style={{ width: 136 }}
                  />
                  <Select
                    value={String(pageSize)}
                    onChange={(value) => setPageSize(Number(value) || 50)}
                    options={[
                      { value: "20", label: "20 / 页" },
                      { value: "50", label: "50 / 页" },
                      { value: "100", label: "100 / 页" }
                    ]}
                    className="ui-input-compact ui-clash-page-size"
                    style={{ width: 96 }}
                  />
                  <Button size="sm" className="ui-properties-action" onClick={onRestoreVisibility}>
                    {tr("show_all", "恢复显示")}
                  </Button>
                </div>

                <div className="ui-toolpanel-results-box ui-clash-results-box">
                  {filteredResults.length === 0 ? (
                    <div className="ui-toolpanel-results-empty">
                      {tr("clash_no_results", "暂无碰撞结果")}
                    </div>
                  ) : (
                    pageItems.map((item) => (
                      <button
                        key={item.id}
                        className="ui-search-result-item ui-clash-result-item"
                        onClick={() => onFocusResult(item)}
                        title={`${item.aUuid} <> ${item.bUuid}`}
                      >
                        <div className="ui-clash-result-top">
                          <span className="ui-clash-result-title">{item.aName || item.aUuid} {" <> "} {item.bName || item.bUuid}</span>
                          <span className={`ui-clash-badge ui-clash-badge-${item.severity}`}>{item.severity}</span>
                        </div>
                        <div className="ui-toolpanel-row-between ui-clash-result-meta">
                          <span className="ui-result-item-secondary">
                            {item.aUuid} {" <> "} {item.bUuid}
                          </span>
                          <span className="ui-result-item-secondary-value">
                            {item.type === "hard"
                              ? item.overlapVolume.toFixed(6)
                              : item.distance.toFixed(6)}
                          </span>
                        </div>
                        <div className="ui-clash-result-actions" onClick={(event) => event.stopPropagation()}>
                          <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={() => onUpdateResultStatus(item.id, "new")}>{tr("clash_group_new", "新建")}</button>
                          <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={() => onUpdateResultStatus(item.id, "confirmed")}>{tr("clash_group_confirmed", "确认")}</button>
                          <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={() => onUpdateResultStatus(item.id, "resolved")}>{tr("clash_group_resolved", "解决")}</button>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                {filteredResults.length > 0 && (
                  <div className="ui-clash-pagination">
                    <PaginationControls
                      prevTitle={tr("search_page_prev", "上一页")}
                      nextTitle={tr("search_page_next", "下一页")}
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
                      onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    />
                  </div>
                )}
            </div>
          </div>
        </div>

        {running && (
          <div className="ui-clash-running-overlay">
            <div className="ui-clash-running-card">
              <div className="ui-clash-running-title">{readyText}</div>
              <div className="ui-clash-running-meta">
                {tr("clash_candidates", "候选")} {scannedCount} · {tr("clash_pairs_scanned", "已扫描对数")} {pairsScanned}
              </div>
              <div className="ui-progress-bar ui-progress-bar-full ui-clash-running-progress">
                <div className="ui-progress-fill" style={{ width: `${safeProgress}%` }} />
              </div>
              <div className="ui-clash-running-footer">
                <span>{Math.round(safeProgress)}%</span>
                <Button size="sm" onClick={onCancel}>{tr("search_cancel", "取消")}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </FloatingPanel>
  );
};
