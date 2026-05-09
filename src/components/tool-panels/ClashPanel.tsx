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

export const ClashPanel: React.FC<ClashPanelProps> = ({
  t,
  onClose,
  running,
  progress,
  status,
  scannedCount,
  pairsScanned,
  results,
  resultFilter,
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
  onIsolateByStatus,
  onRestoreVisibility,
  onResultFilterChange,
  typeFilter,
  onTypeFilterChange,
  onUpdateResultStatus,
  onMarkFilteredStatus,
  onSetASelectAll,
  onSetAClear,
  onSetBSelectAll,
  onSetBClear,
  onFocusResult,
  theme
}) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [scopeExpanded, setScopeExpanded] = useState(modelOptions.length <= 4);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [results.length, pageSize]);

  const filteredResults = results;

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageItems = useMemo(() => filteredResults.slice(pageStart, pageStart + pageSize), [filteredResults, pageStart, pageSize]);
  const setAIds = useMemo(() => new Set(setA), [setA]);
  const setBIds = useMemo(() => new Set(setB), [setB]);
  const readyText = status || (running ? (t("clash_running") || "正在执行碰撞检查...") : (t("clash_ready") || "准备就绪"));
  const scopeSummary = `${t("clash_set_a") || "模型集 A"} ${setA.length} · ${t("clash_set_b") || "模型集 B"} ${setB.length}`;

  const toggleFromSet = (source: string[], id: string, onChange: (next: string[]) => void) => {
    const nextSet = new Set(source);
    if (nextSet.has(id)) nextSet.delete(id);
    else nextSet.add(id);
    onChange(Array.from(nextSet));
  };

  return (
    <FloatingPanel
      title={t("tb_clash") || "碰撞检查"}
      closeLabel={t("panel_close") || "关闭"}
      onClose={onClose}
      width={500}
      storageId="tool_clash"
      autoHeight={true}
      theme={theme}
    >
      <div className="ui-toolpanel-body ui-clash-panel">
        <div className="ui-clash-hero">
          <div className="ui-clash-hero-main">
            <div className="ui-toolpanel-caption-strong ui-clash-hero-title">
              {readyText}
            </div>
            <div className="ui-toolpanel-caption ui-clash-hero-meta">
              {t("clash_scope_visible") || "范围：当前可见构件"} · {t("clash_candidates") || "候选"} {scannedCount} · {(t("clash_pairs_scanned") || "已扫描对数")} {pairsScanned}
            </div>
          </div>
          <div className="ui-toolpanel-row ui-toolpanel-wrap ui-clash-hero-actions">
            {!running ? (
              <Button className="ui-properties-action" onClick={onRun} variant="primary">
                {t("clash_run") || "开始检查"}
              </Button>
            ) : (
              <Button className="ui-properties-action" onClick={onCancel}>
                {t("search_cancel") || "取消搜索"}
              </Button>
            )}
            <Button className="ui-properties-action" onClick={onClear}>
              {t("clash_clear") || "清空结果"}
            </Button>
            <Button className="ui-properties-action" onClick={onExportCsv} disabled={results.length === 0}>
              {t("clash_export_csv") || "导出 CSV"}
            </Button>
          </div>
          <div className="ui-progress-bar ui-progress-bar-full ui-clash-progress">
            <div className="ui-progress-fill" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>
        </div>

        <div className="ui-clash-section">
          <button
            type="button"
            className="ui-clash-section-toggle"
            onClick={() => setScopeExpanded((prev) => !prev)}
          >
            <span className="ui-toolpanel-caption-strong ui-clash-section-title">{t("clash_scope_visible") || "检测范围"}</span>
            <span className="ui-toolpanel-caption ui-clash-section-summary">{scopeSummary}</span>
          </button>
          {scopeExpanded && (
            <div className="ui-toolpanel-grid ui-toolpanel-grid-2">
              <div className="ui-selection-box">
                <div className="ui-selection-box-header">
                  <div className="ui-toolpanel-caption-strong">{t("clash_set_a") || "模型集 A"}</div>
                  <div className="ui-selection-box-actions">
                    <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetASelectAll}>{t("select_all") || "全选"}</button>
                    <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetAClear}>{t("search_clear") || "清空"}</button>
                  </div>
                </div>
                <div className="ui-selection-box-list ui-clash-selection-list">
                  {modelOptions.length === 0 ? (
                    <div className="ui-toolpanel-caption ui-toolpanel-caption-muted">{t("clash_no_models") || "暂无模型"}</div>
                  ) : (
                    modelOptions.map((item) => (
                      <Checkbox
                        key={`a_${item.id}`}
                        checked={setAIds.has(item.id)}
                        onChange={() => toggleFromSet(setA, item.id, onSetAChange)}
                        label={item.name}
                        labelStyle={{ fontSize: 11 }}
                      />
                    ))
                  )}
                </div>
              </div>
              <div className="ui-selection-box">
                <div className="ui-selection-box-header">
                  <div className="ui-toolpanel-caption-strong">{t("clash_set_b") || "模型集 B"}</div>
                  <div className="ui-selection-box-actions">
                    <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetBSelectAll}>{t("select_all") || "全选"}</button>
                    <button className="ui-statusbar-tag ui-statusbar-tag-compact" onClick={onSetBClear}>{t("search_clear") || "清空"}</button>
                  </div>
                </div>
                <div className="ui-selection-box-list ui-clash-selection-list">
                  {modelOptions.length === 0 ? (
                    <div className="ui-toolpanel-caption ui-toolpanel-caption-muted">{t("clash_no_models") || "暂无模型"}</div>
                  ) : (
                    modelOptions.map((item) => (
                      <Checkbox
                        key={`b_${item.id}`}
                        checked={setBIds.has(item.id)}
                        onChange={() => toggleFromSet(setB, item.id, onSetBChange)}
                        label={item.name}
                        labelStyle={{ fontSize: 11 }}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="ui-clash-section">
          <button
            type="button"
            className="ui-clash-section-toggle"
            onClick={() => setAdvancedExpanded((prev) => !prev)}
          >
            <span className="ui-toolpanel-caption-strong ui-clash-section-title">{t("settings_more") || "高级设置"}</span>
            <span className="ui-toolpanel-caption ui-clash-section-summary">
              {t("clash_tolerance") || "容差"} / {t("clash_min_overlap") || "最小重叠体积"} / {t("clash_clearance_distance") || "最小净空距离"}
            </span>
          </button>
          {advancedExpanded && (
            <>
              <div className="ui-toolpanel-grid ui-toolpanel-grid-2">
                <div>
                  <div className="ui-toolpanel-caption ui-toolpanel-caption-spaced">{t("clash_tolerance") || "容差"}</div>
                  <InputNumber
                    className="ui-input-compact ui-clash-input-full"
                    value={Number.isFinite(tolerance) ? tolerance : 0}
                    min={0}
                    step={0.001}
                    onChange={(value) => onToleranceChange(Math.max(0, value || 0))}
                  />
                </div>
                <div>
                  <div className="ui-toolpanel-caption ui-toolpanel-caption-spaced">{t("clash_min_overlap") || "最小重叠体积"}</div>
                  <InputNumber
                    className="ui-input-compact ui-clash-input-full"
                    value={Number.isFinite(minOverlapVolume) ? minOverlapVolume : 0}
                    min={0}
                    step={0.000001}
                    onChange={(value) => onMinOverlapVolumeChange(Math.max(0, value || 0))}
                  />
                </div>
              </div>
              <div className="ui-toolpanel-grid ui-toolpanel-grid-2">
                <div>
                  <div className="ui-toolpanel-caption ui-toolpanel-caption-spaced">{t("clash_clearance_distance") || "最小净空距离"}</div>
                  <InputNumber
                    className="ui-input-compact ui-clash-input-full"
                    value={Number.isFinite(clearanceDistance) ? clearanceDistance : 0}
                    min={0}
                    step={0.001}
                    onChange={(value) => onClearanceDistanceChange(Math.max(0, value || 0))}
                  />
                </div>
                <div className="ui-clash-option-stack">
                  <Checkbox
                    checked={useNarrowPhase}
                    onChange={onUseNarrowPhaseChange}
                    label={t("clash_narrow_phase") || "启用精筛（OBB）"}
                    labelStyle={{ fontSize: 12 }}
                  />
                  <Checkbox
                    checked={useTrianglePhase}
                    onChange={onUseTrianglePhaseChange}
                    label={t("clash_triangle_phase") || "启用三角面复核"}
                    labelStyle={{ fontSize: 12 }}
                  />
                  <Checkbox
                    checked={includeSameModel}
                    onChange={onIncludeSameModelChange}
                    label={t("clash_include_same_model") || "包含同模型内检测"}
                    labelStyle={{ fontSize: 12 }}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="ui-toolpanel-row-between ui-clash-results-header">
          <div>
            <div className="ui-toolpanel-caption-strong ui-clash-results-title">{t("clash_results") || "碰撞结果"} {filteredResults.length}</div>
            <div className="ui-toolpanel-caption ui-toolpanel-caption-muted">
              {t("locate_in_view") || "点击条目定位到视图"}
            </div>
          </div>
          <div className="ui-toolpanel-row">
            <Select
              value={String(pageSize)}
              onChange={(value) => setPageSize(Number(value) || 50)}
              options={[
                { value: "20", label: "20" },
                { value: "50", label: "50" },
                { value: "100", label: "100" }
              ]}
              className="ui-input-compact ui-search-page-size"
            />
          </div>
        </div>

        <div className="ui-toolpanel-results-box ui-clash-results-box">
          {filteredResults.length === 0 ? (
            <div className="ui-toolpanel-results-empty">
              {t("clash_no_results") || "暂无碰撞结果"}
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
                </div>
                <div className="ui-toolpanel-row-between ui-clash-result-meta">
                  <span className="ui-result-item-secondary">
                    {item.aUuid} {" <> "} {item.bUuid}
                  </span>
                  <span className="ui-result-item-secondary">
                    {item.type === "hard"
                      ? `${t("clash_overlap_volume") || "重叠体积"}: ${item.overlapVolume.toFixed(6)}`
                      : `${t("clash_clearance_value") || "净空距离"}: ${item.distance.toFixed(6)}`}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {filteredResults.length > 0 && (
          <PaginationControls
            prevTitle={t("search_page_prev") || "上一页"}
            nextTitle={t("search_page_next") || "下一页"}
            currentPage={currentPage}
            totalPages={totalPages}
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          />
        )}
      </div>
    </FloatingPanel>
  );
};
