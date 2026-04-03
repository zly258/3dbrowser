import React, { useEffect, useMemo, useState } from "react";
import { FloatingPanel } from "./FloatingPanel";
import { Button, Select } from "../common";
import { IconChevronLeft, IconChevronRight, IconClose } from "../../theme/Icons";

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
      onClose={onClose}
      width={500}
      storageId="tool_search"
      autoHeight={true}
      theme={theme}
    >
      <div style={{ position: "relative", padding: "12px", display: "flex", flexDirection: "column", gap: "10px", maxHeight: "68vh", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t("search_conditions") || "搜索条件"}</div>
          <div style={{ display: "flex", gap: "8px" }}>
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
            style={{
              padding: "2px 0",
              display: "grid",
              gridTemplateColumns: index > 0 ? "72px 1fr 96px 1fr 26px" : "1fr 96px 1fr 26px",
              gap: "6px",
              alignItems: "center"
            }}
          >
            {index > 0 && (
              <Select
                value={condition.connector || "AND"}
                options={connectorOptions.map((item) => ({ value: item.value, label: t(item.labelKey) || item.fallback }))}
                onChange={(value) => updateCondition(condition.id, { connector: value as SearchConnector })}
                className="ui-input-compact"
              />
            )}

            <input
              className="ui-input ui-input-compact"
              placeholder={t("search_field_name") || "属性名"}
              value={condition.propertyName}
              onChange={(e) => updateCondition(condition.id, { propertyName: e.target.value })}
            />

            <Select
              value={condition.operator}
              options={operatorOptions.map((item) => ({ value: item.value, label: t(item.labelKey) || item.fallback }))}
              onChange={(value) => updateCondition(condition.id, { operator: value as SearchOperator })}
              className="ui-input-compact"
            />

            <input
              className="ui-input ui-input-compact"
              placeholder={t("search_field_value") || "属性值"}
              value={condition.value}
              onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
            />

            {index > 0 ? (
              <button
                className="ui-search-clear"
                onClick={() => removeCondition(condition.id)}
                title={t("remove_condition") || "移除条件"}
                style={{ position: "static" }}
              >
                <IconClose width={14} height={14} />
              </button>
            ) : (
              <div />
            )}
          </div>
        ))}

        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{t("search_results") || "搜索结果"}: {results.length}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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

        <div style={{ border: "1px solid var(--border-color)", borderRadius: "6px", maxHeight: "160px", overflow: "auto" }}>
          {results.length === 0 ? (
            <div style={{ padding: "10px", color: "var(--text-secondary)", fontSize: 12 }}>
              {t("search_no_results") || "暂无结果"}
            </div>
          ) : (
            pageItems.map((item) => (
              <button
                key={item.uuid}
                className="ui-search-result-item"
                onClick={() => onApplyResultHighlight(item.uuid)}
                title={item.uuid}
              >
                <span>{item.name || item.uuid}</span>
                <span style={{ opacity: 0.7, fontSize: 11 }}>{item.matchedBy.join(", ")}</span>
              </button>
            ))
          )}
        </div>

        {results.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Button
                variant="ghost"
                className="ui-properties-action ui-icon-btn ui-page-nav-btn"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage <= 1}
                title={t("search_page_prev") || "上一页"}
              >
                <IconChevronLeft size={20} />
              </Button>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 64, textAlign: "center" }}>
                {currentPage}/{totalPages}
              </span>
              <Button
                variant="ghost"
                className="ui-properties-action ui-icon-btn ui-page-nav-btn"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                title={t("search_page_next") || "下一页"}
              >
                <IconChevronRight size={20} />
              </Button>
            </div>
            <Button className="ui-properties-action" onClick={onClearResult}>
              {t("search_clear") || "清除结果"}
            </Button>
          </div>
        )}

        {searching && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(0, 0, 0, 0.28)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10
            }}
          >
            <div
              style={{
                width: "78%",
                background: "var(--bg-panel)",
                border: "1px solid var(--border-color)",
                borderRadius: 8,
                padding: "10px 12px",
                boxShadow: "0 6px 18px rgba(0,0,0,0.18)"
              }}
            >
              <div style={{ fontSize: 12, color: "var(--text-primary)", marginBottom: 8 }}>
                {searchStatus || (t("searching") || "搜索中...")}
              </div>
              <div className="ui-progress-bar" style={{ width: "100%" }}>
                <div className="ui-progress-fill" style={{ width: `${Math.max(0, Math.min(100, searchProgress))}%` }} />
              </div>
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
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
