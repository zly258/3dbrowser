import React, { useEffect, useMemo, useState } from "react";
import { FloatingPanel } from "./FloatingPanel";
import { Button, PaginationControls, Select } from "../common";
import { IconClose } from "../../theme/Icons";

export type SearchOperator =
  | "equals"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith";
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
  propertyFieldOptions: Array<{ value: string; label: string; count?: number }>;
  onConditionsChange: (next: PropertySearchCondition[]) => void;
  onSearch: () => void;
  onCancelSearch: () => void;
  onApplyResultHighlight: (uuid: string) => void;
  onClearResult: () => void;
  theme?: any;
}

const operatorOptions: Array<{
  value: SearchOperator;
  labelKey: string;
  fallback: string;
}> = [
  { value: "equals", labelKey: "search_op_equals", fallback: "等于" },
  { value: "contains", labelKey: "search_op_contains", fallback: "包含" },
  {
    value: "notContains",
    labelKey: "search_op_not_contains",
    fallback: "不包含",
  },
  { value: "startsWith", labelKey: "search_op_starts_with", fallback: "开头" },
  { value: "endsWith", labelKey: "search_op_ends_with", fallback: "结尾" },
];

const connectorOptions = [
  { value: "AND", labelKey: "search_connector_and", fallback: "且" },
  { value: "OR", labelKey: "search_connector_or", fallback: "或" },
];

export const SearchPanel: React.FC<SearchPanelProps> = ({
  t,
  onClose,
  conditions,
  results,
  searching,
  searchProgress,
  searchStatus,
  propertyFieldOptions,
  onConditionsChange,
  onSearch,
  onCancelSearch,
  onApplyResultHighlight,
  onClearResult,
  theme,
}) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [results.length, pageSize]);

  const totalPages = Math.max(1, Math.ceil(results.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageItems = useMemo(
    () => results.slice(pageStart, pageStart + pageSize),
    [results, pageStart, pageSize],
  );

  const updateCondition = (
    id: string,
    patch: Partial<PropertySearchCondition>,
  ) => {
    onConditionsChange(
      conditions.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
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
        connector: "AND",
      },
    ]);
  };

  const removeCondition = (id: string) => {
    const next = conditions.filter((item) => item.id !== id);
    onConditionsChange(
      next.length > 0
        ? next
        : [
            {
              id: "cond_init",
              propertyName: "",
              operator: "contains",
              value: "",
            },
          ],
    );
  };

  return (
    <FloatingPanel
      title={t("tb_search") || "属性搜索"}
      closeLabel={t("panel_close") || "关闭"}
      onClose={onClose}
      width={760}
      height={580}
      resizable={true}
      storageId="tool_search"
      autoHeight={false}
      theme={theme}
    >
      <div className="ui-toolpanel-body ui-search-panel-body">
        <div className="ui-toolpanel-row-between">
          <div className="ui-toolpanel-caption">
            {t("search_conditions") || "搜索条件"}
          </div>
          <div className="ui-toolpanel-row">
            <Button className="ui-properties-action" onClick={addCondition}>
              {t("search_add_condition") || "添加条件"}
            </Button>
            <Button
              className="ui-properties-action"
              onClick={onSearch}
              disabled={searching}
            >
              {searching
                ? t("searching") || "搜索中..."
                : t("search_run") || "搜索"}
            </Button>
          </div>
        </div>

        {conditions.map((condition, index) => (
          <div key={condition.id} className="ui-search-condition-row">
            <div className="ui-search-condition-connector-cell">
              {index > 0 && (
                <Select
                  value={condition.connector || "AND"}
                  options={connectorOptions.map((item) => ({
                    value: item.value,
                    label: t(item.labelKey) || item.fallback,
                  }))}
                  onChange={(value) =>
                    updateCondition(condition.id, {
                      connector: value as SearchConnector,
                    })
                  }
                  className="ui-input-compact ui-search-connector"
                />
              )}
            </div>

            <Select
              value={condition.propertyName}
              options={propertyFieldOptions.map((item) => ({
                value: item.value,
                label: item.label
              }))}
              onChange={(value) =>
                updateCondition(condition.id, { propertyName: value })
              }
              placeholder={t("search_field_name") || "属性名"}
              searchable={true}
              searchPlaceholder={t("search_field_filter") || "搜索属性名"}
              emptyText={t("search_no_fields") || "暂无可用属性"}
              className="ui-input-compact ui-search-field-input"
            />

            <Select
              value={condition.operator}
              options={operatorOptions.map((item) => ({
                value: item.value,
                label: t(item.labelKey) || item.fallback,
              }))}
              onChange={(value) =>
                updateCondition(condition.id, {
                  operator: value as SearchOperator,
                })
              }
              className="ui-input-compact ui-search-operator"
            />

            <input
              className="ui-input ui-input-compact ui-search-value-input"
              placeholder={t("search_field_value") || "属性值"}
              value={condition.value}
              onChange={(e) =>
                updateCondition(condition.id, { value: e.target.value })
              }
            />

            <div className="ui-search-condition-action-cell">
              {index > 0 && (
                <button
                  className="ui-search-clear ui-search-clear-static ui-search-remove-btn"
                  onClick={() => removeCondition(condition.id)}
                  title={t("remove_condition") || "移除条件"}
                >
                  <IconClose width={14} height={14} />
                </button>
              )}
            </div>
          </div>
        ))}

        <div className="ui-toolpanel-row-between ui-toolpanel-caption ui-search-results-summary">
          <span>
            {t("search_results") || "搜索结果"}: {results.length}
          </span>
        </div>

        <div className="ui-toolpanel-results-box ui-search-results-box">
          <div className="ui-search-hint-strip">
            {t("search_fields_total") || "可搜索属性"}: {propertyFieldOptions.length}
          </div>
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
                    {[item.type, item.modelId, ...item.matchedBy]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              </div>
            ))
          )}
        </div>

        <div className="ui-search-pagination">
          <PaginationControls
            prevTitle={t("search_page_prev") || "上一页"}
            nextTitle={t("search_page_next") || "下一页"}
            currentPage={currentPage}
            totalPages={totalPages}
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            rightContent={
              <div className="ui-search-page-actions">
                <Select
                  value={String(pageSize)}
                  onChange={(value) => setPageSize(Number(value) || 10)}
                  options={[
                    { value: "10", label: "10 / 页" },
                    { value: "20", label: "20 / 页" },
                    { value: "50", label: "50 / 页" },
                  ]}
                  className="ui-input-compact ui-search-page-size"
                  style={{ width: 96 }}
                />
                <Button
                  className="ui-properties-action"
                  onClick={onClearResult}
                  disabled={results.length === 0}
                >
                  {t("search_clear") || "清除结果"}
                </Button>
              </div>
            }
          />
        </div>

        {searching && (
          <div className="ui-toolpanel-overlay">
            <div className="ui-toolpanel-overlay-card">
              <div className="ui-toolpanel-overlay-title">
                {searchStatus || t("searching") || "搜索中..."}
              </div>
              <div className="ui-progress-bar ui-progress-bar-full">
                <div
                  className="ui-progress-fill"
                  style={{
                    width: `${Math.max(0, Math.min(100, searchProgress))}%`,
                  }}
                />
              </div>
              <div className="ui-toolpanel-row-between ui-toolpanel-caption ui-toolpanel-caption-spaced">
                <div className="ui-toolpanel-caption ui-toolpanel-caption-muted">
                  {Math.round(searchProgress)}%
                </div>
                <Button
                  className="ui-properties-action"
                  onClick={onCancelSearch}
                >
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
