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
    {summary && <span className="ui-clash-section-summary" title={summary}>{summary}</span>}
  </button>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="ui-clash-field">
    <span className="ui-clash-field-label" title={label}>{label}</span>
    <span className="ui-clash-field-control">{children}</span>
  </label>
);

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
};

const getSeverityText = (t: (key: string) => string, severity: ClashResultItem["severity"]) => {
  if (severity === "high") return t("clash_severity_high");
  if (severity === "medium") return t("clash_severity_medium");
  return t("clash_severity_low");
};

const getClashTypeText = (t: (key: string) => string, type: ClashResultItem["type"]) => {
  return type === "hard" ? t("clash_type_hard") : t("clash_type_clearance");
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
  onSetASelectAll,
  onSetAClear,
  onSetBSelectAll,
  onSetBClear,
  onFocusResult,
  theme
}) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
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
  const readyText = status || (running ? t("clash_running") : t("clash_ready"));
  const scopeSummary = `${t("clash_set_a")} ${setA.length} · ${t("clash_set_b")} ${setB.length}`;
  const resultsSummary = `${filteredResults.length}`;
  const paramsSummary = `${t("clash_tolerance")} ${tolerance} · ${t("clash_clearance_distance")} ${clearanceDistance}`;

  const toggleFromSet = (source: string[], id: string, onChange: (next: string[]) => void) => {
    const nextSet = new Set(source);
    if (nextSet.has(id)) nextSet.delete(id);
    else nextSet.add(id);
    onChange(Array.from(nextSet));
  };

  return (
    <FloatingPanel
      title={t("tb_clash")}
      closeLabel={t("panel_close")}
      onClose={onClose}
      width={480}
      height={500}
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
                <span>{t("clash_candidates")} <b>{formatNumber(scannedCount)}</b></span>
                <span>{t("clash_pairs_scanned")} <b>{formatNumber(pairsScanned)}</b></span>
                <span>{t("clash_results")} <b>{formatNumber(results.length)}</b></span>
              </div>
            </div>
            <div className="ui-clash-actions-row">
              {!running ? (
                <Button className="ui-properties-action" onClick={onRun} variant="primary">
                  {t("clash_run")}
                </Button>
              ) : (
                <Button className="ui-properties-action" onClick={onCancel}>
                  {t("search_cancel")}
                </Button>
              )}
              <Button className="ui-properties-action" onClick={onClear}>
                {t("clash_clear")}
              </Button>
              <Button className="ui-properties-action" onClick={onExportCsv} disabled={results.length === 0}>
                {t("clash_export_csv")}
              </Button>
            </div>
          </div>

          <div className="ui-clash-section">
            <SectionToggle
              title={t("clash_scope_visible")}
              summary={scopeSummary}
              expanded={scopeExpanded}
              onToggle={() => setScopeExpanded((prev) => !prev)}
            />
            {scopeExpanded && (
              <div className="ui-clash-section-content ui-clash-scope-grid">
                <div className="ui-selection-box">
                  <div className="ui-selection-box-header">
                    <div className="ui-toolpanel-caption-strong">{t("clash_set_a")}</div>
                    <div className="ui-selection-box-actions">
                      <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetASelectAll}>{t("select_all")}</button>
                      <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetAClear}>{t("search_clear")}</button>
                    </div>
                  </div>
                  <div className="ui-selection-box-list ui-clash-selection-list">
                    {modelOptions.length === 0 ? (
                      <div className="ui-toolpanel-caption ui-toolpanel-caption-muted">{t("clash_no_models")}</div>
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
                    <div className="ui-toolpanel-caption-strong">{t("clash_set_b")}</div>
                    <div className="ui-selection-box-actions">
                      <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetBSelectAll}>{t("select_all")}</button>
                      <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetBClear}>{t("search_clear")}</button>
                    </div>
                  </div>
                  <div className="ui-selection-box-list ui-clash-selection-list">
                    {modelOptions.length === 0 ? (
                      <div className="ui-toolpanel-caption ui-toolpanel-caption-muted">{t("clash_no_models")}</div>
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
              title={t("settings_more")}
              summary={paramsSummary}
              expanded={advancedExpanded}
              onToggle={() => setAdvancedExpanded((prev) => !prev)}
            />
            {advancedExpanded && (
              <div className="ui-clash-section-content ui-clash-settings-compact">
                <div className="ui-clash-fields-grid">
                  <Field label={t("clash_tolerance")}>
                    <InputNumber
                      className="ui-input-compact ui-clash-input-full"
                      value={Number.isFinite(tolerance) ? tolerance : 0}
                      min={0}
                      step={0.001}
                      onChange={(value) => onToleranceChange(Math.max(0, value || 0))}
                    />
                  </Field>
                  <Field label={t("clash_min_overlap")}>
                    <InputNumber
                      className="ui-input-compact ui-clash-input-full"
                      value={Number.isFinite(minOverlapVolume) ? minOverlapVolume : 0}
                      min={0}
                      step={0.000001}
                      onChange={(value) => onMinOverlapVolumeChange(Math.max(0, value || 0))}
                    />
                  </Field>
                  <Field label={t("clash_clearance_distance")}>
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
                    label={t("clash_narrow_phase")}
                    labelStyle={{ fontSize: 12 }}
                  />
                  <Checkbox
                    checked={useTrianglePhase}
                    onChange={onUseTrianglePhaseChange}
                    label={t("clash_triangle_phase")}
                    labelStyle={{ fontSize: 12 }}
                  />
                  <Checkbox
                    checked={includeSameModel}
                    onChange={onIncludeSameModelChange}
                    label={t("clash_include_same_model")}
                    labelStyle={{ fontSize: 12 }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="ui-clash-section ui-clash-results-section">
            <div className="ui-clash-section-toggle ui-clash-section-toggle-static">
              <span className="ui-clash-section-title-wrap">
                <span className="ui-clash-section-title">{t("clash_results")}</span>
              </span>
              <span className="ui-clash-section-summary">{resultsSummary}</span>
            </div>
            <div className="ui-clash-section-content ui-clash-results-content">
              <div className="ui-clash-results-toolbar ui-clash-results-toolbar-simple">
                  <Select
                    value={typeFilter}
                    onChange={(value) => onTypeFilterChange(value as ClashTypeFilter)}
                    options={[
                      { value: "ALL", label: t("clash_type_all") },
                      { value: "HARD", label: t("clash_type_hard") },
                      { value: "CLEARANCE", label: t("clash_type_clearance") }
                    ]}
                    t={t}
                    className="ui-input-compact ui-clash-filter-select"
                  />
                  <Select
                    value={String(pageSize)}
                    onChange={(value) => setPageSize(Number(value) || 10)}
                    options={[
                      { value: "10", label: `10 / ${t("page_size_unit")}` },
                      { value: "20", label: `20 / ${t("page_size_unit")}` },
                      { value: "50", label: `50 / ${t("page_size_unit")}` }
                    ]}
                    t={t}
                    className="ui-input-compact ui-clash-page-size"
                  />
                  <Button size="sm" className="ui-properties-action" onClick={onRestoreVisibility}>
                    {t("show_all")}
                  </Button>
                </div>

                <div className="ui-toolpanel-results-box ui-clash-results-box">
                  {filteredResults.length === 0 ? (
                    <div className="ui-toolpanel-results-empty">
                      {t("clash_no_results")}
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
                          <span className={`ui-clash-badge ui-clash-badge-${item.severity}`}>{getSeverityText(t, item.severity)}</span>
                        </div>
                        <div className="ui-toolpanel-row-between ui-clash-result-meta">
                          <span className="ui-result-item-secondary">
                            {getClashTypeText(t, item.type)} · {item.type === "hard" ? t("clash_overlap_volume") : t("clash_distance")}
                          </span>
                          <span className="ui-result-item-secondary-value">
                            {item.type === "hard"
                              ? item.overlapVolume.toFixed(6)
                              : item.distance.toFixed(6)}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                {filteredResults.length > 0 && (
                  <div className="ui-clash-pagination">
                    <PaginationControls
                      prevTitle={t("search_page_prev")}
                      nextTitle={t("search_page_next")}
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
                {t("clash_candidates")} {scannedCount} · {t("clash_pairs_scanned")} {pairsScanned}
              </div>
              <div className="ui-progress-bar ui-progress-bar-full ui-clash-running-progress">
                <div className="ui-progress-fill" style={{ width: `${safeProgress}%` }} />
              </div>
              <div className="ui-clash-running-footer">
                <span>{Math.round(safeProgress)}%</span>
                <Button size="sm" onClick={onCancel}>{t("search_cancel")}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </FloatingPanel>
  );
};
