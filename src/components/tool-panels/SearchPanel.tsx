import React, { useEffect, useMemo, useState } from "react";
import { FloatingPanel } from "./FloatingPanel";
import { Button, PaginationControls, Select } from "../common";
import { IconClose } from "../../theme/Icons";

export type SearchOperator = "equals" | "contains" | "notContains" | "startsWith" | "endsWith";
export type SearchConnector = "AND" | "OR";

export interface PropertySearchCondition {
  id: string;
  propertyName: string;
  operator: SearchOperator;
  value: string;
  connector?: SearchConnector;
}

export interface PropertySearchResultItem {
  uuid: string;
  name: string;
  type: string;
  modelId: string;
  source: string;
  matchedBy: string[];
}

interface SearchPanelProps {
  t: (key: string) => string;
  onClose: () => void;
  conditions: PropertySearchCondition[];
  results: PropertySearchResultItem[];
  searching: boolean;
  searchProgress: number;
  searchStatus: string;
  onConditionsChange: (next: PropertySearchCondition[]) => void;
  onSearch: () => void;
  onCancelSearch: () => void;
  onApplyResultHighlight: (uuid: string) => void;
  onClearResult: () => void;
  theme?: any;
}

const operatorOptions: Array<{ value: SearchOperator; labelKey: string; fallback: string }> = [
  { value: "equals", labelKey: "search_op_equals", fallback: "等于" },
  { value: "contains", labelKey: "search_op_contains", fallback: "包含" },
  { value: "notContains", labelKey: "search_op_not_contains", fallback: "不包含" },
  { value: "startsWith", labelKey: "search_op_starts_with", fallback: "开头" },
  { value: "endsWith", labelKey: "search_op_ends_with", fallback: "结尾" }
];

const connectorOptions = [
  { value: "AND", labelKey: "search_connector_and", fallback: "且" },
  { value: "OR", labelKey: "search_connector_or", fallback: "或" }
];

export const SearchPanel: React.FC<SearchPanelProps> = ({
  t,
  onClose,
  conditions,
  results,
  searching,
  searchProgress,
  searchStatus,
  onConditionsChange,
  onSearch,
  onCancelSearch,
  onApplyResultHighlight,
  onClearResult,
  theme
}) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    setPage(1);
  }, [results.length, pageSize]);

  const totalPages = Math.max(1, Math.ceil(results.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageItems = useMemo(() => results.slice(pageStart, pageStart + pageSize), [results, pageStart, pageSize]);

  const updateCondition = (id: string, patch: Partial<PropertySearchCondition>) => {
    onConditionsChange(conditions.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addCondition = () => {
    const nextId = `cond_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    onConditionsChange([
      ...conditions,
      {
        id: nextId,
        propertyName: "",
        operator: "contains",
        value: "",
        connector: "AND"
      }
    ]);
  };

  const removeCondition = (id: string) => {
    const next = conditions.filter((item) => item.id !== id);
    onConditionsChange(next.length > 0 ? next : [{ id: "cond_init", propertyName: "", operator: "contains", value: "" }]);
  };

  return (
    <FloatingPanel
      title={t("tb_search") || "属性搜索"}
      closeLabel={t("panel_close") || "关闭"}
      onClose={onClose}
      width={420}
      storageId="tool_search"
      autoHeight={true}
      theme={theme}
    >
      <div className="ui-toolpanel-body">
        <div className="ui-toolpanel-row-between">
          <div className="ui-toolpanel-caption">{t("search_conditions") || "搜索条件"}</div>
          <div className="ui-toolpanel-row">
            <Button className="ui-properties-action" onClick={addCondition}>
              {t("search_add_condition") || "添加条件"}
            </Button>
            <Button className="ui-properties-action" onClick={onSearch} disabled={searching}>
              {searching ? (t("searching") || "搜索中...") : (t("search_run") || "搜索")}
            </Button>
          </div>
        </div>

        {conditions.map((condition, index) => (
          <div
            key={condition.id}
            className={`ui-toolpanel-grid ui-toolpanel-grid-condition ${index > 0 ? "ui-toolpanel-grid-condition-linked" : "ui-toolpanel-grid-condition-first"}`}
          >
            {index > 0 && (
              <Select
                value={condition.connector || "AND"}
                options={connectorOptions.map((item) => ({ value: item.value, label: t(item.labelKey) || item.fallback }))}
                onChange={(value) => updateCondition(condition.id, { connector: value as SearchConnector })}
                className="ui-input-compact"
                style={{ width: '64px', flexShrink: 0 }}
              />
            )}

            <input
              className="ui-input ui-input-compact"
              placeholder={t("search_field_name") || "属性名"}
              value={condition.propertyName}
              onChange={(e) => updateCondition(condition.id, { propertyName: e.target.value })}
              style={{ flex: 1, minWidth: 0 }}
            />

            <Select
              value={condition.operator}
              options={operatorOptions.map((item) => ({ value: item.value, label: t(item.labelKey) || item.fallback }))}
              onChange={(value) => updateCondition(condition.id, { operator: value as SearchOperator })}
              className="ui-input-compact"
              style={{ width: '92px' }}
            />

            <input
              className="ui-input ui-input-compact"
              placeholder={t("search_field_value") || "属性值"}
              value={condition.value}
              onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
              style={{ flex: 1, minWidth: 0 }}
            />

            {index > 0 ? (
              <button
                className="ui-search-clear ui-search-clear-static"
                onClick={() => removeCondition(condition.id)}
                title={t("remove_condition") || "移除条件"}
                style={{ flexShrink: 0, width: '24px' }}
              >
                <IconClose width={14} height={14} />
              </button>
            ) : (
              <div style={{ width: '24px', flexShrink: 0 }} />
            )}
          </div>
        ))}

        <div className="ui-toolpanel-row-between ui-toolpanel-caption">
          <span>{t("search_results") || "搜索结果"}: {results.length}</span>
          <div className="ui-toolpanel-row">
            <span>{t("search_page_size") || "每页"}</span>
            <Select
              value={String(pageSize)}
              onChange={(value) => setPageSize(Number(value) || 50)}
              options={[
                { value: "20", label: "20" },
                { value: "50", label: "50" },
                { value: "100", label: "100" }
              ]}
              className="ui-input-compact"
              style={{ minWidth: 68 }}
            />
          </div>
        </div>

        <div className="ui-toolpanel-results-box ui-search-results-box">
          {results.length === 0 ? (
            <div className="ui-toolpanel-results-empty">
              {t("search_no_results") || "暂无结果"}
            </div>
          ) : (
            pageItems.map((item) => (
              <div
                key={item.uuid}
                className="ui-search-result-item ui-search-result-item-simple"
                title={`${item.uuid}\n${item.matchedBy.join("\n")}`}
              >
                <button
                  className="ui-search-result-main"
                  onClick={() => onApplyResultHighlight(item.uuid)}
                >
                  <span>{item.name || item.uuid}</span>
                  <span className="ui-result-item-secondary">
                    {[item.type, item.modelId, ...item.matchedBy].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </div>
            ))
          )}
        </div>

        {results.length > 0 && (
          <PaginationControls
            prevTitle={t("search_page_prev") || "上一页"}
            nextTitle={t("search_page_next") || "下一页"}
            currentPage={currentPage}
            totalPages={totalPages}
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            rightContent={
              <Button className="ui-properties-action" onClick={onClearResult}>
                {t("search_clear") || "清除结果"}
              </Button>
            }
          />
        )}

        {searching && (
          <div className="ui-toolpanel-overlay">
            <div className="ui-toolpanel-overlay-card">
              <div className="ui-toolpanel-overlay-title">
                {searchStatus || (t("searching") || "搜索中...")}
              </div>
              <div className="ui-progress-bar ui-progress-bar-full">
                <div className="ui-progress-fill" style={{ width: `${Math.max(0, Math.min(100, searchProgress))}%` }} />
              </div>
              <div className="ui-toolpanel-row-between ui-toolpanel-caption ui-toolpanel-caption-spaced">
                <div className="ui-toolpanel-caption ui-toolpanel-caption-muted">
                  {Math.round(searchProgress)}%
                </div>
                <Button className="ui-properties-action" onClick={onCancelSearch}>
                  {t("search_cancel") || "取消搜索"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </FloatingPanel>
  );
};
