import React from "react";

// 统一图标尺寸与样式
const iconSize = 18;
const iconStrokeWidth = 1.5;

// 基础 SVG 图标组件
const createIcon = (pathD: string, props: any = {}) => {
  const { size, color, ...rest } = props;
  return (
    <svg
      width={size || iconSize}
      height={size || iconSize}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth={iconStrokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {pathD}
    </svg>
  );
};

// 基础图标
export const IconChevronRight = (props: any) => createIcon("<polyline points='9 18 15 12 9 6' />", props);
export const IconChevronDown = (props: any) => createIcon("<polyline points='6 9 12 15 18 9' />", props);
export const IconChevronUp = (props: any) => createIcon("<polyline points='18 15 12 9 6 15' />", props);
export const IconFile = (props: any) => createIcon("<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'></path><polyline points='14 2 14 8 20 8'></polyline><line x1='16' y1='13' x2='8' y2='13'></line><line x1='16' y1='17' x2='8' y2='17'></line><polyline points='10 9 9 9 8 9'></polyline>", props);
export const IconFolder = (props: any) => createIcon("<path d='M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'></path>", props);
export const IconExport = (props: any) => createIcon("<path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'></path><polyline points='7 10 12 15 17 10'></polyline><line x1='12' y1='15' x2='12' y2='3'></line>", props);
export const IconClear = (props: any) => createIcon("<polyline points='3 6 5 6 21 6'></polyline><path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'></path><line x1='10' y1='11' x2='10' y2='17'></line><line x1='14' y1='11' x2='14' y2='17'></line>", props);
export const IconTrash = IconClear;
export const IconFit = (props: any) => createIcon("<path d='M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3'></path>", props);
export const IconWireframe = (props: any) => createIcon("<path d='M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'></path><polyline points='3.27 6.96 12 12.01 20.73 6.96'></polyline><line x1='12' y1='22.08' x2='12' y2='12'></line>", props);
export const IconList = (props: any) => createIcon("<line x1='8' y1='6' x2='21' y2='6'></line><line x1='8' y1='12' x2='21' y2='12'></line><line x1='8' y1='18' x2='21' y2='18'></line><line x1='3' y1='6' x2='3.01' y2='6'></line><line x1='3' y1='12' x2='3.01' y2='12'></line><line x1='3' y1='18' x2='3.01' y2='18'></line>", props);
export const IconInfo = (props: any) => createIcon("<circle cx='12' cy='12' r='10'></circle><line x1='12' y1='16' x2='12' y2='12'></line><line x1='12' y1='8' x2='12.01' y2='8'></line>", props);
export const IconMeasure = (props: any) => createIcon("<path d='M2 12h20'></path><path d='M16 20l4-4-4-4'></path><path d='M8 4L4 8l4 4'></path>", props);
export const IconSettings = (props: any) => createIcon("<circle cx='12' cy='12' r='3'></circle><path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z'></path>", props);
export const IconPick = (props: any) => createIcon("<circle cx='18' cy='5' r='3'></circle><circle cx='6' cy='12' r='3'></circle><circle cx='18' cy='19' r='3'></circle><line x1='8.59' y1='13.51' x2='15.42' y2='17.49'></line><line x1='15.41' y1='6.51' x2='8.59' y2='10.49'></line>", props);
export const IconClip = (props: any) => createIcon("<circle cx='6' cy='6' r='3'></circle><circle cx='6' cy='18' r='3'></circle><line x1='20' y1='4' x2='8.12' y2='15.88'></line><line x1='14.47' y1='14.48' x2='20' y2='20'></line><line x1='8.12' y1='8.12' x2='12' y2='12'></line>", props);
export const IconExplode = (props: any) => createIcon("<polygon points='13 2 3 14 12 14 11 14 23 21 13'></polygon>", props);
export const IconMenu = (props: any) => createIcon("<line x1='3' y1='12' x2='21' y2='12'></line><line x1='3' y1='6' x2='21' y2='6'></line><line x1='3' y1='18' x2='21' y2='18'></line>", props);
export const IconClose = (props: any) => createIcon("<line x1='18' y1='6' x2='6' y2='18'></line><line x1='6' y1='6' x2='18' y2='18'></line>", props);
export const IconLang = (props: any) => createIcon("<circle cx='12' cy='12' r='10'></circle><line x1='2' y1='12' x2='22' y2='12'></line><path d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'></path>", props);
export const IconLink = (props: any) => createIcon("<path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'></path><path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'></path>", props);
export const IconMinimize = (props: any) => createIcon("<line x1='5' y1='12' x2='19' y2='12'></line>", props);
export const IconMaximize = (props: any) => createIcon("<rect x='3' y='3' width='18' height='18' rx='2' ry='2'></rect>", props);
export const IconPlay = (props: any) => createIcon("<polygon points='5 3 19 12 5 21 5 3'></polygon>", props);

// CAD 风格视图图标
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
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={iconStrokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 7V4h16v3" />
      <path d="M9 20h6" />
      <path d="M12 4v16" />
    </svg>
    {text && (
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
    )}
  </div>
);
