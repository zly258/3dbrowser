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

export const IconChevronRight = (props: any) => <ChevronRight size={iconSize} {...props} />;
export const IconChevronDown = (props: any) => <ChevronDown size={iconSize} {...props} />;
export const IconFile = (props: any) => <File size={iconSize} {...props} />;
export const IconFolder = (props: any) => <Folder size={iconSize} {...props} />;
export const IconExport = (props: any) => <Download size={iconSize} {...props} />;
export const IconClear = (props: any) => <Trash2 size={iconSize} {...props} />;
export const IconTrash = IconClear;
export const IconFit = (props: any) => <Maximize size={iconSize} {...props} />;
export const IconWireframe = (props: any) => <Box size={iconSize} {...props} />;
export const IconList = (props: any) => <List size={iconSize} {...props} />;
export const IconInfo = (props: any) => <Info size={iconSize} {...props} />;
export const IconMeasure = (props: any) => <Ruler size={iconSize} {...props} />;
export const IconSettings = (props: any) => <Settings size={iconSize} {...props} />;
export const IconPick = (props: any) => <MousePointer2 size={iconSize} {...props} />;
export const IconClip = (props: any) => <Scissors size={iconSize} {...props} />;
export const IconExplode = (props: any) => <Zap size={iconSize} {...props} />;
export const IconMenu = (props: any) => <Menu size={iconSize} {...props} />;
export const IconClose = (props: any) => <X size={iconSize} {...props} />;
export const IconLang = (props: any) => <Globe size={iconSize} {...props} />;
export const IconMinimize = (props: any) => <Minus size={iconSize} {...props} />;
export const IconMaximize = (props: any) => <Square size={iconSize - 4} {...props} />;

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
