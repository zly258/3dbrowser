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
