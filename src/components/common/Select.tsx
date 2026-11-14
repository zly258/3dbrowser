import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ValueOption } from "./types";
import { cx } from "./utils";

export type SelectOption<T extends string = string> = ValueOption<T>;

export interface SelectProps<T extends string = string> {
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  placeholder?: React.ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
}

export function Select<T extends string = string>({
  value,
  options,
  onChange,
  className,
  style,
  disabled = false,
  placeholder,
  searchable = false,
  searchPlaceholder,
  emptyText = "暂无数据"
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 下拉挂到 body（portal）：避免被面板的 overflow 滚动容器裁掉。
  // 空间不足时向上翻转，并跟随滚动/窗口变化重新定位。
  const updateDropdownPosition = useCallback(() => {
    const selector = containerRef.current;
    if (!selector) return;
    const rect = selector.getBoundingClientRect();
    const safeMargin = 8;
    const estimatedHeight = Math.min(260, Math.max(120, (dropdownRef.current?.offsetHeight || 0)));
    const spaceBelow = window.innerHeight - rect.bottom - safeMargin;
    const spaceAbove = rect.top - safeMargin;
    const openUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    const width = Math.min(Math.max(rect.width, 140), 320);
    const left = Math.min(Math.max(safeMargin, rect.left), Math.max(safeMargin, window.innerWidth - width - safeMargin));
    setDropdownStyle(openUp
      ? { position: "fixed", left, bottom: window.innerHeight - rect.top + 4, width, minWidth: width, maxWidth: width, maxHeight: Math.max(120, spaceAbove) }
      : { position: "fixed", left, top: rect.bottom + 4, width, minWidth: width, maxWidth: width, maxHeight: Math.max(120, spaceBelow) });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateDropdownPosition();
  }, [isOpen, updateDropdownPosition]);

  useEffect(() => {
    if (!isOpen) return;
    const onReposition = () => updateDropdownPosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [isOpen, updateDropdownPosition]);

  const selectedOption = useMemo(
    () => options.find((item) => item.value === value),
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    if (!searchable || !searchText.trim()) return options;
    const query = searchText.trim().toLocaleLowerCase();
    return options.filter((item) =>
      String(item.label ?? item.value).toLocaleLowerCase().includes(query)
      || String(item.value ?? "").toLocaleLowerCase().includes(query)
    );
  }, [options, searchable, searchText]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)
        && !(dropdownRef.current && dropdownRef.current.contains(target))) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (option: SelectOption<T>) => {
    if (option.disabled) return;
    onChange(option.value);
    setIsOpen(false);
    setSearchText("");
  };

  return (
    <div ref={containerRef} className={cx("ui-select-custom", isOpen && "open", disabled && "disabled")} style={style}>
      <button
        type="button"
        className={cx("ui-select-selector", "ui-input", className)}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={selectedOption ? String(selectedOption.label ?? selectedOption.value) : undefined}
      >
        <span className="ui-select-selection-item">
          {selectedOption?.label ?? placeholder ?? ""}
        </span>
        <span className="ui-select-arrow" aria-hidden="true">
          <svg viewBox="64 64 896 896" width="12" height="12" fill="currentColor">
            <path d="M884 256h-75c-5.1 0-9.9 2.5-12.9 6.6L512 654.2 227.9 262.6c-3-4.1-7.8-6.6-12.9-6.6h-75c-6.5 0-10.3 7.4-6.5 12.7l352.6 486.1c12.8 17.6 39 17.6 51.7 0l352.6-486.1c3.9-5.3.1-12.7-6.4-12.7z" />
          </svg>
        </span>
      </button>
      {isOpen && !disabled && createPortal(
        <div
          ref={dropdownRef}
          className="ui-select-dropdown"
          role="listbox"
          style={{ ...dropdownStyle, zIndex: 400, overflowY: "auto" }}
        >
          {searchable && (
            <div className="ui-select-search-wrap">
              <input
                className="ui-input ui-input-compact ui-select-search-input"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={searchPlaceholder || "搜索..."}
                onClick={(event) => event.stopPropagation()}
                autoFocus
              />
            </div>
          )}
          {filteredOptions.length === 0 ? (
            <div className="ui-select-empty">{emptyText}</div>
          ) : (
            filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cx("ui-select-item", option.value === value && "selected", option.disabled && "disabled")}
                onClick={() => handleSelect(option)}
                disabled={option.disabled}
                role="option"
                aria-selected={option.value === value}
              >
                {option.label}
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
