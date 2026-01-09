import React from "react";
import { 
  ChevronRight, 
  ChevronDown, 
  File, 
  Folder, 
  Download, 
  Trash2, 
  Maximize, 
  Box, 
  List, 
  Info, 
  Ruler, 
  Settings, 
  MousePointer2, 
  Scissors, 
  Zap, 
  Menu, 
  X, 
  Globe,
  Type,
  Minus,
  Square
} from 'lucide-react';

// Consistent icon size and style
const iconSize = 18;
const iconStrokeWidth = 1.5; // Back to standard thickness

// Simple helper for monochromatic icons
const withThemeIcon = (Icon: any, props: any) => {
  const { size, color, ...rest } = props;
  return (
    <Icon 
      size={size || iconSize} 
      strokeWidth={iconStrokeWidth} 
      color={color || "currentColor"} // Default to parent's text color
      {...rest}
    />
  );
};

export const IconChevronRight = (props: any) => withThemeIcon(ChevronRight, props);
export const IconChevronDown = (props: any) => withThemeIcon(ChevronDown, props);

export const IconFile = (props: any) => withThemeIcon(File, props);
export const IconFolder = (props: any) => withThemeIcon(Folder, props);
export const IconExport = (props: any) => withThemeIcon(Download, props);
export const IconClear = (props: any) => withThemeIcon(Trash2, props);
export const IconTrash = IconClear;
export const IconFit = (props: any) => withThemeIcon(Maximize, props);
export const IconWireframe = (props: any) => withThemeIcon(Box, props);
export const IconList = (props: any) => withThemeIcon(List, props);
export const IconInfo = (props: any) => withThemeIcon(Info, props);
export const IconMeasure = (props: any) => withThemeIcon(Ruler, props);
export const IconSettings = (props: any) => withThemeIcon(Settings, props);
export const IconPick = (props: any) => withThemeIcon(MousePointer2, props);
export const IconClip = (props: any) => withThemeIcon(Scissors, props);
export const IconExplode = (props: any) => withThemeIcon(Zap, props);
export const IconMenu = (props: any) => withThemeIcon(Menu, props);
export const IconClose = (props: any) => withThemeIcon(X, props);
export const IconLang = (props: any) => withThemeIcon(Globe, props);
export const IconMinimize = (props: any) => withThemeIcon(Minus, props);
export const IconMaximize = (props: any) => withThemeIcon(Square, { ...props, size: (props.size || iconSize) - 4 });

// CAD Style View Icons
export const IconViewTop = (props: any) => (
  <svg width={props.size || iconSize} height={props.size || iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconStrokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path d="M3 12h18" opacity="0.3" />
    <path d="M12 3v18" opacity="0.3" />
    <rect x="7" y="7" width="10" height="10" fill="currentColor" fillOpacity="0.2" stroke="none" />
  </svg>
);

export const IconViewBottom = (props: any) => (
  <svg width={props.size || iconSize} height={props.size || iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconStrokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path d="M3 12h18" strokeDasharray="2 2" opacity="0.3" />
    <path d="M12 3v18" strokeDasharray="2 2" opacity="0.3" />
    <rect x="8" y="8" width="8" height="8" strokeDasharray="2 2" />
  </svg>
);

export const IconViewFront = (props: any) => (
  <svg width={props.size || iconSize} height={props.size || iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconStrokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="8" width="18" height="12" rx="1" />
    <path d="M3 14h18" opacity="0.3" />
    <path d="M12 8v12" opacity="0.3" />
    <rect x="7" y="11" width="10" height="6" fill="currentColor" fillOpacity="0.2" stroke="none" />
  </svg>
);

export const IconViewBack = (props: any) => (
  <svg width={props.size || iconSize} height={props.size || iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconStrokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="8" width="18" height="12" rx="1" />
    <path d="M3 14h18" strokeDasharray="2 2" opacity="0.3" />
    <path d="M12 8v12" strokeDasharray="2 2" opacity="0.3" />
    <rect x="8" y="12" width="8" height="4" strokeDasharray="2 2" />
  </svg>
);

export const IconViewLeft = (props: any) => (
  <svg width={props.size || iconSize} height={props.size || iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconStrokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="6" y="5" width="12" height="14" rx="1" />
    <path d="M6 12h12" opacity="0.3" />
    <path d="M12 5v14" opacity="0.3" />
    <rect x="9" y="8" width="6" height="8" fill="currentColor" fillOpacity="0.2" stroke="none" />
  </svg>
);

export const IconViewRight = (props: any) => (
  <svg width={props.size || iconSize} height={props.size || iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconStrokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="6" y="5" width="12" height="14" rx="1" />
    <path d="M6 12h12" strokeDasharray="2 2" opacity="0.3" />
    <path d="M12 5v14" strokeDasharray="2 2" opacity="0.3" />
    <rect x="10" y="9" width="4" height="6" strokeDasharray="2 2" />
  </svg>
);

export const IconViewIso = (props: any) => (
  <svg width={props.size || iconSize} height={props.size || iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconStrokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 2l9.5 5.5v11L12 22l-9.5-5.5v-11z" />
    <path d="M12 22V12" />
    <path d="M21.5 7.5L12 12 2.5 7.5" />
    <path d="M12 12l9.5 5.5" opacity="0.3" />
    <path d="M12 12l-9.5 5.5" opacity="0.3" />
  </svg>
);

export const IconText = ({text, ...props}: any) => (
  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
    <Type size={iconSize} {...props} />
    <span style={{ 
      position: 'absolute', 
      fontSize: '8px', 
      fontWeight: 'bold', 
      bottom: '-2px',
      backgroundColor: 'var(--theme-primary, #3b82f6)',
      color: 'white',
      padding: '0 2px',
      borderRadius: '2px',
      pointerEvents: 'none'
    }}>
      {text}
    </span>
  </div>
);
