import React from "react";

// 导入所有 SVG 文件
import fileSvg from '../icons/file.svg?raw';
import folderSvg from '../icons/folder.svg?raw';
import exportSvg from '../icons/export.svg?raw';
import fitSvg from '../icons/fit.svg?raw';
import clearSvg from '../icons/clear.svg?raw';
import pickSvg from '../icons/pick.svg?raw';
import wireframeSvg from '../icons/wireframe.svg?raw';
import explodeSvg from '../icons/explode.svg?raw';
import clipSvg from '../icons/clip.svg?raw';
import langSvg from '../icons/lang.svg?raw';
import menuSvg from '../icons/menu.svg?raw';
import closeSvg from '../icons/close.svg?raw';
import listSvg from '../icons/list.svg?raw';
import infoSvg from '../icons/info.svg?raw';
import measureSvg from '../icons/measure.svg?raw';
import settingsSvg from '../icons/settings.svg?raw';
import trashSvg from '../icons/trash.svg?raw';
import textSvg from '../icons/text.svg?raw';

// SVG 映射表
const svgMap: Record<string, string> = {
  file: fileSvg,
  folder: folderSvg,
  export: exportSvg,
  fit: fitSvg,
  clear: clearSvg,
  pick: pickSvg,
  wireframe: wireframeSvg,
  explode: explodeSvg,
  clip: clipSvg,
  lang: langSvg,
  menu: menuSvg,
  close: closeSvg,
  list: listSvg,
  info: infoSvg,
  measure: measureSvg,
  settings: settingsSvg,
  trash: trashSvg,
  text: textSvg
};

// 创建 SVG 组件的辅助函数
const createSvgComponent = (svgContent: string) => {
  return (props: React.SVGProps<SVGSVGElement>) => {
    // 直接渲染 SVG 内容
    return (
      <span 
        dangerouslySetInnerHTML={{ __html: svgContent }} 
        {...props as any}
        style={{
          display: 'inline-block',
          width: '24px',
          height: '24px',
          ...props.style
        }}
      />
    );
  };
};

// 兼容性：提供与原始 Icons.tsx 相同的接口
export const IconFile = createSvgComponent(fileSvg);
export const IconFolder = createSvgComponent(folderSvg);
export const IconExport = createSvgComponent(exportSvg);
export const IconFit = createSvgComponent(fitSvg);
export const IconClear = createSvgComponent(clearSvg);
export const IconPick = createSvgComponent(pickSvg);
export const IconWireframe = createSvgComponent(wireframeSvg);
export const IconExplode = createSvgComponent(explodeSvg);
export const IconClip = createSvgComponent(clipSvg);
export const IconLang = createSvgComponent(langSvg);
export const IconMenu = createSvgComponent(menuSvg);
export const IconClose = createSvgComponent(closeSvg);
export const IconList = createSvgComponent(listSvg);
export const IconInfo = createSvgComponent(infoSvg);
export const IconMeasure = createSvgComponent(measureSvg);
export const IconSettings = createSvgComponent(settingsSvg);
export const IconTrash = createSvgComponent(trashSvg);

// 特殊的文本图标需要单独处理
export const IconText = ({text, ...props}: React.SVGProps<SVGSVGElement> & {text: string}) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <text x="12" y="15" fontSize="8" fontWeight="bold" textAnchor="middle" stroke="none" fill="currentColor" style={{pointerEvents:'none'}} dominantBaseline="middle">{text}</text>
  </svg>
);

// 图标名称类型
export type IconName = keyof typeof svgMap;

// 通用图标组件
export const Icon = ({ name, ...props }: { name: IconName } & React.SVGProps<SVGSVGElement>) => {
  const Component = React.useMemo(() => {
    switch (name) {
      case 'file': return IconFile;
      case 'folder': return IconFolder;
      case 'export': return IconExport;
      case 'fit': return IconFit;
      case 'clear': return IconClear;
      case 'pick': return IconPick;
      case 'wireframe': return IconWireframe;
      case 'explode': return IconExplode;
      case 'clip': return IconClip;
      case 'lang': return IconLang;
      case 'menu': return IconMenu;
      case 'close': return IconClose;
      case 'list': return IconList;
      case 'info': return IconInfo;
      case 'measure': return IconMeasure;
      case 'settings': return IconSettings;
      case 'trash': return IconTrash;
      default: return () => null;
    }
  }, [name]);

  return <Component {...props} />;
};

// 导出所有图标名称用于类型检查
export const ICON_NAMES: IconName[] = Object.keys(svgMap) as IconName[];