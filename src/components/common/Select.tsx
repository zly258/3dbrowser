import React, { useEffect, useMemo, useRef, useState } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);

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
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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
      {isOpen && !disabled && (
        <div className="ui-select-dropdown" role="listbox">
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
        </div>
      )}
    </div>
  );
}
