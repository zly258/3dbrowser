# @zhangly1403/3dbrowser

Professional 3D model viewer library for React and Web applications.

## UI Preview

<div align="center">
  <img src="images/electron-en.png" alt="3D Browser English UI Preview" width="800" style="border-radius: 2px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); margin: 10px 0;"/>
</div>

## Key Features

- **High-Performance Rendering**: Powered by **NBIM** and **BatchedMesh**, capable of rendering 100,000+ meshes smoothly.
- **Multi-format Support**: IFC, GLB/GLTF, 3D Tiles, FBX, OBJ, and LMB.
- **Advanced Tools**: Measurement (distance, angle, coords), sectioning (clipping planes), and scene structure tree.
- **Responsive & Modern**: Built with React 19, Three.js, and TypeScript.
- **Bilingual**: Built-in support for English and Chinese.

## Installation

```bash
npm install @zhangly1403/3dbrowser
```

## Quick Usage

```tsx
import { ThreeViewer } from '@zhangly1403/3dbrowser';

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ThreeViewer 
        defaultTheme="dark"
        defaultLang="en"
        accentColor="#0078D4"
        showStats={true}
        initialFiles={[
          "https://example.com/models/building.glb"
        ]}
        onSelect={(uuid, object) => console.log('Selected:', uuid, object)}
      />
    </div>
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `allowDragOpen` | `boolean` | `true` | Allow opening files via drag and drop |
| `disabledMenus` | `string[]` | `[]` | List of menu IDs to disable |
| `defaultTheme` | `'dark' \| 'light'` | `'light'` | Default UI theme |
| `defaultLang` | `'zh' \| 'en'` | `'zh'` | Default UI language |
| `accentColor` | `string` | `"#0078D4"` | UI accent color |
| `showStats` | `boolean` | `true` | Show performance statistics panel |
| `showOutline` | `boolean` | `true` | Show scene structure outline panel |
| `showProperties` | `boolean` | `true` | Show object properties panel |
| `initialSettings` | `Partial<SceneSettings>` | - | Initial scene settings (lighting, bg, etc.) |
| `initialFiles` | `string \| File \| (string \| File)[]` | - | URLs or File objects to load on mount |
| `onSelect` | `(uuid: string, object: any) => void` | - | Callback when an object is selected |
| `onLoad` | `(manager: SceneManager) => void` | - | Callback when the scene manager is initialized |

## Advanced Usage

### SceneManager

The `SceneManager` class provides low-level control over the 3D scene:

```typescript
import { SceneManager } from '@zhangly1403/3dbrowser';

const manager = new SceneManager(canvasElement);
manager.loadNbim('path/to/model.nbim');
```

## License

### Free for Non-Commercial Use (Commercial Use Prohibited)

This project is intended for learning and research purposes only. **Commercial use of any kind is strictly prohibited**. For commercial licensing, please contact the original author for authorization.

---

# @zhangly1403/3dbrowser (中文)

专业的 React 3D 模型浏览器组件库。

## 界面预览

<div align="center">
  <img src="images/electron-zh.png" alt="3D Browser 中文界面预览" width="800" style="border-radius: 2px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); margin: 10px 0;"/>
</div>

## 特色功能

- **高性能渲染**: 基于 **NBIM** 和 **BatchedMesh** 技术，支持 10 万级构件流畅渲染。
- **多格式支持**: 支持 IFC, GLB/GLTF, 3D Tiles, FBX, OBJ, LMB 等。
- **高级工具**: 测量（距离、角度、坐标）、剖切（剪切面）、场景结构树。
- **现代技术栈**: 基于 React 19, Three.js 和 TypeScript 构建。
- **双语支持**: 内置中英文支持。

## 安装

```bash
npm install @zhangly1403/3dbrowser
```

## 快速上手

```tsx
import { ThreeViewer } from '@zhangly1403/3dbrowser';

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ThreeViewer 
        defaultTheme="dark"
        defaultLang="zh"
        accentColor="#0078D4"
        showStats={true}
        initialFiles={[
          "https://example.com/models/building.glb",
          "https://example.com/models/tileset/tileset.json"
        ]}
        onSelect={(uuid, object) => console.log('选中对象:', uuid, object)}
      />
    </div>
  );
}
```

## Props 详细说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|---------|-------------|
| `allowDragOpen` | `boolean` | `true` | 是否允许通过拖拽打开文件 |
| `disabledMenus` | `string[]` | `[]` | 需要禁用的菜单 ID 列表 |
| `defaultTheme` | `'dark' \| 'light'` | `'light'` | 默认界面主题 |
| `defaultLang` | `'zh' \| 'en'` | `'zh'` | 默认界面语言 |
| `accentColor` | `string` | `"#0078D4"` | 界面强调色 |
| `showStats` | `boolean` | `true` | 是否显示性能统计面板 |
| `showOutline` | `boolean` | `true` | 是否显示场景大纲面板 |
| `showProperties` | `boolean` | `true` | 是否显示属性面板 |
| `initialSettings` | `Partial<SceneSettings>` | - | 初始场景设置（光照、背景等） |
| `initialFiles` | `string \| File \| (string \| File)[]` | - | 组件挂载时自动加载的文件（URL 或 File 对象） |
| `onSelect` | `(uuid: string, object: any) => void` | - | 对象选中时的回调函数 |
| `onLoad` | `(manager: SceneManager) => void` | - | 场景管理器初始化完成后的回调函数 |

## 许可证

### 非商业用途免费（禁止用于商业目的）

本项目仅供学习和研究使用，**禁止用于任何商业目的**。如需商业使用，请联系原作者获得授权。
