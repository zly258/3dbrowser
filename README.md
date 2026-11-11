# @zhangly1403/3dbrowser

Professional 3D model viewer library for React and Web applications. Built with performance and extensibility in mind.

## Key Features

- **High-Performance Rendering**: Powered by **NBIM** and **BatchedMesh**, capable of rendering 100,000+ meshes smoothly with minimal memory footprint.
- **Multi-format Support**:
  - **BIM**: IFC (using web-ifc)
  - **Standard**: GLB/GLTF, FBX, OBJ
  - **Custom**: LMB, NBIM
- **Advanced Tools**:
  - **Measurement**: Distance, angle, and coordinate measurement tools.
  - **Sectioning**: Real-time clipping planes for internal inspection.
  - **Scene Tree**: Interactive hierarchical view of the model structure.
  - **Properties**: Detailed metadata viewer for selected components.
  - **Display styles**: Realistic (shaded + edges), Shaded, Wireframe — switchable from the toolbar and remembered locally.
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
        libPath="/libs"
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
| `hiddenMenus` | `string[]` | `[]` | List of menu IDs to hide. Available IDs: `file`, `open_file`, `export`, `clear`, `view`, `fit_view`, `views`, `interface`, `outline`, `props`, `stats`, `pick`, `tool`, `measure`, `clip`, `viewpoint`, `sun`, `about`. |
| `defaultTheme` | `'dark' \| 'light'` | `'light'` | Default UI theme (used when no saved preference; dark mode also sets the dark viewport color) |
| `defaultLang` | `'zh' \| 'en'` | `'zh'` | Default UI language |
| `showStats` | `boolean` | `true` | Show performance statistics panel |
| `showOutline` | `boolean` | `true` | Show scene structure outline panel |
| `showProperties` | `boolean` | `true` | Show object properties panel |
| `initialSettings` | `Partial<SceneSettings>` | - | Initial scene settings (lighting, bg, etc.) |
| `initialFiles` | `string \| File \| (string \| File)[]` | - | URLs or **files** to load on mount (single files or multi-file lists; no folder/directory picker) |
| `onSelect` | `(uuid: string, object: any) => void` | - | Callback when an object is selected |
| `onLoad` | `(manager: SceneManager) => void` | - | Callback when the scene manager is initialized |
| `hideDeleteModel` | `boolean` | `false` | Hide delete model button |

### SceneManager

For advanced scenarios, you can interact directly with the `SceneManager`:

```typescript
import { SceneManager } from '@zhangly1403/3dbrowser';

// In onLoad callback of ThreeViewer
const handleLoad = (manager: SceneManager) => {
  manager.loadNbim('path/to/model.nbim');
};
```

## UI Style System

The whole interface follows one light Fluent / industrial-CAD console language. All tokens live in
`src/styles/variables.css`; component styles are hand-written modules imported by
`src/styles/index.css`.

- **Density**: 12.5px body, 26px controls (22px small), 22px table/property rows, 26px tree rows.
- **Shell**: 42px top bar + three columns (left `clamp(250px,22vw,320px)`, viewport `flex:1; min-width:0`,
  right `clamp(320px,27vw,440px)`) + 30px status bar. The page itself never scrolls; only panel bodies do.
- **Colour**: four background layers (`--bg-app` → `--bg-band` → `--bg-panel`/`--bg-chrome`), three border
  levels, three text levels (all ≥ 4.5:1 contrast), single accent plus danger/success/warn semantics.
- **States**: any rule that changes `background` also declares `color`; disabled states use token colours
  (never `opacity`); white text only on accent/danger/tooltip dark backgrounds.
- **Shapes**: 3px / 4px radii, two shadows, 8px scrollbars, icons are inline SVG with `stroke="currentColor"`.
- **Dark theme**: only token values change (`.theme-dark`), never component structure.

Verify before delivering:

```bash
npm run ui:audit:strict   # tokens, contrast, z-index/radius/font ladder, emoji, bare hex
npm run ui:coverage       # every className used in TSX has a style rule
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
  - **自定义格式**: LMB, NBIM
- **高级工具**:
  - **测量**: 距离、角度、坐标测量。
  - **剖切**: 实时剖切面，方便查看内部结构。
  - **场景树**: 交互式构件树状结构视图。
  - **属性面板**: 选中构件的详细属性查看。
  - **显示样式**: 真实（着色 + 边线）、着色、线框，工具栏一键切换并本地记忆。
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
        libPath="/libs"
        defaultTheme="dark"
        defaultLang="zh"
        showStats={true}
        initialFiles={[
          "https://example.com/models/building.glb"
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
| `hiddenMenus` | `string[]` | `[]` | 需要隐藏的菜单 ID 列表。可用 ID: `file`, `open_file`, `export`, `clear`, `view`, `fit_view`, `views`, `interface`, `outline`, `props`, `stats`, `pick`, `tool`, `measure`, `clip`, `viewpoint`, `sun`, `about`。 |
| `defaultTheme` | `'dark' \| 'light'` | `'light'` | 默认界面主题（无本地偏好时生效；暗色模式会同步深色视口底色） |
| `defaultLang` | `'zh' \| 'en'` | `'zh'` | 默认界面语言 |
| `showStats` | `boolean` | `true` | 是否显示性能统计面板 |
| `showOutline` | `boolean` | `true` | 是否显示场景大纲面板 |
| `showProperties` | `boolean` | `true` | 是否显示对象属性面板 |
| `initialSettings` | `Partial<SceneSettings>` | - | 初始场景设置（光照、背景等） |
| `initialFiles` | `string \| File \| (string \| File)[]` | - | 组件挂载时自动加载的 **单个文件或文件列表**（URL 或 `File`；不支持整目录选择） |
| `onSelect` | `(uuid: string, object: any) => void` | - | 对象选中时的回调函数 |
| `onLoad` | `(manager: SceneManager) => void` | - | 场景管理器初始化完成后的回调函数 |
| `hideDeleteModel` | `boolean` | `false` | 隐藏删除模型按钮 |

## 界面样式规范

全站共用一套「浅色 Fluent 工业 CAD 控制台」语言：令牌唯一来源 `src/styles/variables.css`，
组件样式是手写模块文件，由 `src/styles/index.css` 按顺序引入。

- **密度**：正文 12.5px，控件 26px（小号 22px），表格/属性行 22px，树行 26px。
- **骨架**：顶栏 42px + 三栏（左 `clamp(250px,22vw,320px)`、视口 `flex:1; min-width:0`、
  右 `clamp(320px,27vw,440px)`）+ 底栏 30px。页面本身不滚动，滚动只发生在面板内部容器。
- **配色**：背景四层（`--bg-app` → `--bg-band` → `--bg-panel`/`--bg-chrome`）、边框三级、文字三级
  （对比度均 ≥ 4.5:1）；强调色单一，语义色仅用于 danger / success / warn。
- **状态**：任何改 `background` 的规则必须同时声明 `color`；禁用态用令牌换色（禁止 `opacity`）；
  白字只允许压在 Accent / Danger / Tooltip 深底上。
- **形与图标**：圆角 3px / 4px，两级阴影，滚动条 8px，图标一律内联 SVG（`stroke="currentColor"`）。
- **暗色主题**：只替换令牌取值（`.theme-dark`），不改组件结构。

交付前执行：

```bash
npm run ui:audit:strict   # 令牌、对比度、z-index/圆角/字号阶梯、emoji、裸色值
npm run ui:coverage       # TSX 中使用的每个 className 都有对应样式
```

## 许可证

### 非商业用途免费（禁止用于商业目的）

本项目仅供学习和研究使用，**禁止用于任何商业目的**。如需商业授权或企业级支持，请联系作者：`zhangly1403@163.com`。

