import React from 'react';

export interface ImageButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: React.ReactNode;
    label?: string;
    active?: boolean;
        theme?: any;
}

export const ImageButton: React.FC<ImageButtonProps> = ({ 
    icon, 
    label, 
    active, 
    theme, 
    style, 
    className = '',
    ...props 
}) => {
    return (
        <button 
            style={style} 
            className={`ui-toolbar-btn ${active ? 'active' : ''} ${className}`}
            {...props}
        >
            <div className="flex items-center justify-center w-[18px] h-[18px] overflow-hidden">{icon}</div>
            {label && <div className="text-[10px] leading-none font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-full mt-[2px]">{label}</div>}
        </button>
    );
};

