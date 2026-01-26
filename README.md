# @zhangly1403/3dbrowser

[Live Preview](https://zly258.github.io/3dbrowser/)

Professional 3D model viewer library for React and Web applications. Built with performance and extensibility in mind.

## Key Features

- **High-Performance Rendering**: Powered by **NBIM** and **BatchedMesh**, capable of rendering 100,000+ meshes smoothly with minimal memory footprint.
- **Multi-format Support**: 
  - **BIM**: IFC (using web-ifc)
  - **Standard**: GLB/GLTF, FBX, OBJ
  - **Large Scale**: 3D Tiles (using 3d-tiles-renderer)
  - **Custom**: LMB, NBIM
- **Advanced Tools**: 
  - **Measurement**: Distance, angle, and coordinate measurement tools.
  - **Sectioning**: Real-time clipping planes for internal inspection.
  - **Scene Tree**: Interactive hierarchical view of the model structure.
  - **Properties**: Detailed metadata viewer for selected components.
- **Modern Tech Stack**: Built with **React 19**, **Three.js**, and **TypeScript**.
- **Localization**: Built-in support for English and Chinese out of the box.

## Installation

```bash
npm install @zhangly1403/3dbrowser
```

## Assets Setup

You need to copy the `libs` folder from the package to your project's public directory. This folder contains the required WASM and worker files for decoding IFC and OCC files.

1. Copy `node_modules/@zhangly1403/3dbrowser/dist/libs` to your project's `public/libs` folder.
2. Specify the `libPath` prop in the component if you placed them in a different location (default is `./libs`).

## Quick Usage

```tsx
import { ThreeViewer } from '@zhangly1403/3dbrowser';

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ThreeViewer 
        libPath="/libs" // Path to the libs folder in your public directory
        defaultTheme="dark"
        defaultLang="en"
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

## API Reference

### ThreeViewer Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `libPath` | `string` | `'./libs'` | Path to the folder containing WASM/Worker files (relative to window.location) |
| `allowDragOpen` | `boolean` | `true` | Allow opening files via drag and drop |
| `hiddenMenus` | `string[]` | `[]` | List of menu IDs to hide. Available IDs: `file`, `open_file`, `open_folder`, `open_url`, `export`, `clear`, `view`, `fit_view`, `views`, `interface`, `outline`, `props`, `stats`, `pick`, `tool`, `measure`, `clip`, `settings_panel`, `settings`, `about`. |
| `defaultTheme` | `'dark' \| 'light'` | `'light'` | Default UI theme |
| `defaultLang` | `'zh' \| 'en'` | `'zh'` | Default UI language |
| `showStats` | `boolean` | `true` | Show performance statistics panel |
| `showOutline` | `boolean` | `true` | Show scene structure outline panel |
| `showProperties` | `boolean` | `true` | Show object properties panel |
| `initialSettings` | `Partial<SceneSettings>` | - | Initial scene settings (lighting, bg, etc.) |
| `initialFiles` | `string \| File \| (string \| File)[]` | - | URLs or File objects to load on mount |
| `onSelect` | `(uuid: string, object: any) => void` | - | Callback when an object is selected |
| `onLoad` | `(manager: SceneManager) => void` | - | Callback when the scene manager is initialized |

### SceneManager

For advanced scenarios, you can interact directly with the `SceneManager`:

```typescript
import { SceneManager } from '@zhangly1403/3dbrowser';

// In onLoad callback of ThreeViewer
const handleLoad = (manager: SceneManager) => {
  manager.loadNbim('path/to/model.nbim');
};
```

## License

### Free for Non-Commercial Use (Commercial Use Prohibited)

This project is intended for learning and research purposes only. **Commercial use of any kind is strictly prohibited**. For commercial licensing or enterprise support, please contact the author at `zhangly1403@163.com`.

---

# @zhangly1403/3dbrowser (中文)

专业的 React 3D 模型浏览器组件库，专注于高性能和易用性。

## 特色功能

- **高性能渲染**: 基于 **NBIM** 和 **BatchedMesh** 技术，支持 10 万级构件流畅渲染。
- **多格式支持**: 
  - **BIM**: IFC (基于 web-ifc)
  - **标准格式**: GLB/GLTF, FBX, OBJ
  - **大规模场景**: 3D Tiles (基于 3d-tiles-renderer)
  - **自定义格式**: LMB, NBIM
- **高级工具**: 
  - **测量**: 距离、角度、坐标测量。
  - **剖切**: 实时剖切面，方便查看内部结构。
  - **场景树**: 交互式构件树状结构视图。
  - **属性面板**: 选中构件的详细属性查看。
- **现代技术栈**: 基于 **React 19**, **Three.js** 和 **TypeScript** 构建。
- **双语支持**: 内置完善的中英文支持。

## 安装

```bash
npm install @zhangly1403/3dbrowser
```

## 静态资源配置

您需要将包中的 `libs` 文件夹复制到您项目的 public 目录下。该文件夹包含了解码 IFC 和 OCC 文件所需的 WASM 和 worker 文件。

1. 复制 `node_modules/@zhangly1403/3dbrowser/dist/libs` 到您项目的 `public/libs` 文件夹。
2. 如果放置在其他位置，请在组件中指定 `libPath` 属性（默认为 `./libs`）。

## 快速上手

```tsx
import { ThreeViewer } from '@zhangly1403/3dbrowser';

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ThreeViewer 
        libPath="/libs" // public 目录下的 libs 文件夹路径
        defaultTheme="dark"
        defaultLang="zh"
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

## 参数说明

### ThreeViewer Props

| 参数 | 类型 | 默认值 | 说明 |
|------|------|---------|-------------|
| `libPath` | `string` | `'./libs'` | 包含 WASM/Worker 文件的文件夹路径（相对于 window.location） |
| `allowDragOpen` | `boolean` | `true` | 是否允许通过拖拽打开文件 |
| `hiddenMenus` | `string[]` | `[]` | 需要隐藏的菜单 ID 列表。可用 ID: `file`, `open_file`, `open_folder`, `open_url`, `export`, `clear`, `view`, `fit_view`, `views`, `interface`, `outline`, `props`, `stats`, `pick`, `tool`, `measure`, `clip`, `settings_panel`, `settings`, `about`。 |
| `defaultTheme` | `'dark' \| 'light'` | `'light'` | 默认界面主题 |
| `defaultLang` | `'zh' \| 'en'` | `'zh'` | 默认界面语言 |
| `showStats` | `boolean` | `true` | 是否显示性能统计面板 |
| `showOutline` | `boolean` | `true` | 是否显示场景大纲面板 |
| `showProperties` | `boolean` | `true` | 是否显示对象属性面板 |
| `initialSettings` | `Partial<SceneSettings>` | - | 初始场景设置（光照、背景等） |
| `initialFiles` | `string \| File \| (string \| File)[]` | - | 组件挂载时自动加载的文件（URL 或 File 对象） |
| `onSelect` | `(uuid: string, object: any) => void` | - | 对象选中时的回调函数 |
| `onLoad` | `(manager: SceneManager) => void` | - | 场景管理器初始化完成后的回调函数 |

## 许可证

### 非商业用途免费（禁止用于商业目的）

本项目仅供学习和研究使用，**禁止用于任何商业目的**。如需商业授权或企业级支持，请联系作者：`zhangly1403@163.com`。
