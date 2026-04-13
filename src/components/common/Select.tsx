import React, { useState, useRef, useEffect } from 'react';

export interface SelectOption {
    value: string;
    label: string;
}

export interface SelectProps {
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
    className?: string;
    style?: React.CSSProperties;
    disabled?: boolean;
}

export const Select: React.FC<SelectProps> = ({ value, options, onChange, className = '', style, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value) || options[0];

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    return (
        <div 
            ref={containerRef}
            className={`ui-select-custom ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
            style={style}
        >
            <div 
                className={`ui-select-selector ui-input ${className}`} 
                onClick={() => !disabled && setIsOpen(!isOpen)}
            >
                <span className="ui-select-selection-item">
                    {selectedOption?.label}
                </span>
                <span className="ui-select-arrow">
                    <svg viewBox="64 64 896 896" width="12" height="12" fill="currentColor">
                        <path d="M884 256h-75c-5.1 0-9.9 2.5-12.9 6.6L512 654.2 227.9 262.6c-3-4.1-7.8-6.6-12.9-6.6h-75c-6.5 0-10.3 7.4-6.5 12.7l352.6 486.1c12.8 17.6 39 17.6 51.7 0l352.6-486.1c3.9-5.3.1-12.7-6.4-12.7z"></path>
                    </svg>
                </span>
            </div>
            {isOpen && !disabled && (
                <div className="ui-select-dropdown">
                    {options.map((option) => (
                        <div 
                            key={option.value}
                            className={`ui-select-item ${option.value === value ? 'selected' : ''}`}
                            onClick={() => {
                                onChange(option.value);
                                setIsOpen(false);
                            }}
                        >
                            {option.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
