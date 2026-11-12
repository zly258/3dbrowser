# @zhangly1403/3dbrowser

Professional 3D model viewer library for React and Web applications. Built for very large models: a single 2.9 GB NBIM holding 231,353 components and 186 million rendered triangles opens in seconds and keeps the JS heap under ~3 GB.

## Key Features

- **High-Performance Rendering**: Powered by **NBIM** and **BatchedMesh**, measured on 231,353 components / 186 million rendered triangles in a single browser tab.
- **Multi-format Support**:
  - **BIM**: IFC (using web-ifc)
  - **Standard**: GLB/GLTF, FBX, OBJ
  - **Custom**: LMB, NBIM
- **Advanced Tools**:
  - **Measurement**: Distance, angle, and coordinate measurement tools.
  - **Sectioning**: Real-time clipping planes for internal inspection, with the range recalculated from the current model.
  - **Scene Tree**: Interactive hierarchical view of the model structure.
  - **Properties**: Detailed metadata viewer for selected components.
  - **Display styles**: Realistic (shaded + edges), Shaded, Wireframe — switchable from the toolbar and remembered locally.
  - **Box selection**: Full-screen marquee selection that stays responsive on six-figure component counts.
  - **Instance-level picking**: A single click resolves the exact instance under the cursor, highlights only that instance (with a glow) and lets you customize the highlight colour.
- **Offline Batch Conversion**: Convert LMB sources to a single NBIM file on the CPU only — no scene, no GPU, no VRAM.
- **Modern Tech Stack**: Built with **React 19**, **Three.js**, and **TypeScript**.
- **Localization**: Built-in support for English and Chinese out of the box.

## Measured Scale & Performance

The numbers below come from real production models. File names, paths, customer and project details have been removed; only aggregate geometry counts and timings are kept.

All timings were measured in **headless Chrome with software (SwiftShader) rendering** — a deliberately pessimistic baseline. A real GPU is faster.

### Model scale

| Metric | Model A (multi-file steel structure) |
| --- | --- |
| Source files | 140 |
| Component nodes | 231,353 |
| Unique triangles | 52,506,466 |
| Instances | 737,330 |
| Rendered instances | 968,683 |
| Rendered triangles | 186,284,229 |

Model A merged into one NBIM becomes a **2.9 GB** single file, opened as one document.

### Runtime

| Metric | Result | Note |
| --- | --- | --- |
| First interactive frame (2.9 GB NBIM) | 3.0 – 4.5 s | progressive: usable before every chunk has landed |
| JS heap while orbiting the full model | 2.0 – 3.1 GB, stable | previously 3.5 → 7.5 GB, ending in OOM |
| Overview frame rate | ~26 fps | software rendering |
| Close-up frame rate | ~54 fps | software rendering |
| Full-screen box select, 33,588 components | ~70 ms | marquee covering the whole viewport |
| Device pixel ratio while dragging → after release | 0.8 → 1.0 | adaptive quality |

### Why it holds up

- **Chunked NBIM + `BatchedMesh`.** Geometry is split into octree chunks and drawn as one `BatchedMesh` per chunk, so 231k components cost a few hundred draw calls instead of 231k.
- **Memory budget instead of "load everything".** `maxLoadedChunks` / `maxCachedChunks` / `maxConcurrentChunkLoads` are derived from the JS heap limit plus each chunk's estimated decoded size; when the budget is exceeded, the farthest visible chunks are evicted first.
- **On-demand rendering.** A frame is drawn only when something changed (camera, loading, selection), so an idle viewer costs almost nothing.
- **Screen-space culling.** Chunks whose projection is under ~4 px are never decoded, and prefetch pauses while the camera moves.
- **Instance-aware picking.** `batchId` → uuid/source maps resolve one specific instance per click, and box selection culls whole chunks by bounding box before touching individual instances.
- **Lazy property index.** Above 20,000 property documents the index stays out of memory and is resolved on selection; search builds it once, in a single pass.
- **Headless batch conversion.** LMB → NBIM conversion touches only CPU and disk, so it can run on machines without a usable GPU.

### Known limits

- **NBIM is the fast path.** Raw multi-file sources must be merged once (the built-in batch converter downloads a single `.nbim`), otherwise the loader spends its time on conversion instead of streaming.
- **Very distant chunks are skipped.** A chunk that projects to under ~4 px is never decoded; mixing several far-apart models can leave the far one mostly empty until you zoom in.
- **First property search may take a moment** when the model carries more than 20,000 property documents, because the search index is built on first use.
- **Software-rendered FPS is a floor, not a target.** The numbers above were measured without a GPU; GPU-backed browsers are considerably faster.

## Installation

The library is already published on npm as **`@zhangly1403/3dbrowser`** (with build provenance), so you install a released version — no local build required.

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

This project is intended for learning and research purposes only. **Commercial use of any kind is strictly prohibited**. For commercial licensing or enterprise support, please contact the author at `zhangly1403@qq.com`.

---

# @zhangly1403/3dbrowser (中文)

专业的 React 3D 模型浏览器组件库，专注于超大模型与易用性。单个 2.9 GB 的 NBIM（23 万构件、1.86 亿渲染三角面）可在数秒内打开，JS 堆稳定控制在约 3 GB 以内。

## 特色功能

- **高性能渲染**: 基于 **NBIM** 和 **BatchedMesh** 技术，实测单页可承载 231,353 个构件、1.86 亿渲染三角面。
- **多格式支持**:
  - **BIM**: IFC (基于 web-ifc)
  - **标准格式**: GLB/GLTF, FBX, OBJ
  - **自定义格式**: LMB, NBIM
- **高级工具**:
  - **测量**: 距离、角度、坐标测量。
  - **剖切**: 实时剖切面，方便查看内部结构；打开面板时按当前模型自动重算范围。
  - **场景树**: 交互式构件树状结构视图。
  - **属性面板**: 选中构件的详细属性查看。
  - **显示样式**: 真实（着色 + 边线）、着色、线框，工具栏一键切换并本地记忆。
  - **框选**: 全屏框选，十万级构件下仍保持毫秒级响应。
  - **实例级点选**: 单击只选中并高亮光标命中的那一个实例（带发光效果），高亮颜色可自定义。
- **离线批量转换**: 纯 CPU 把 LMB 源文件合并转换为单个 NBIM，不进入场景、不占显存。
- **现代技术栈**: 基于 **React 19**, **Three.js** 和 **TypeScript** 构建。
- **双语支持**: 内置完善的中英文支持。

## 实测规模与性能

下列数据来自真实生产模型，已做脱敏处理：隐去文件名、路径、客户与项目信息，仅保留汇总的几何量与耗时。

所有耗时均在 **headless Chrome + 软件渲染（SwiftShader）** 下测得，属于偏保守的下限；真实 GPU 环境会更快。

### 模型规模

| 指标 | 模型 A（多文件钢结构工程） |
| --- | --- |
| 源文件数 | 140 |
| 构件节点数 | 231,353 |
| 唯一三角面 | 52,506,466 |
| 实例数 | 737,330 |
| 实际渲染实例 | 968,683 |
| 实际渲染三角面 | 186,284,229 |

模型 A 合并为单个 NBIM 后是 **2.9 GB** 的单文件，作为一个文档打开。

### 运行表现

| 指标 | 实测结果 | 说明 |
| --- | --- | --- |
| 首屏可交互（2.9 GB NBIM） | 3.0 – 4.5 s | 渐进式：分块未全部到齐即可操作 |
| 全景环绕时的 JS 堆 | 2.0 – 3.1 GB，保持稳定 | 优化前为 3.5 → 7.5 GB 并最终 OOM |
| 全景帧率 | ~26 fps | 软件渲染 |
| 近景帧率 | ~54 fps | 软件渲染 |
| 全屏框选 33,588 个构件 | ~70 ms | 框选覆盖整个视口 |
| 拖动时 / 松手后的像素比 | 0.8 → 1.0 | 自适应画质 |

### 性能来源

- **分块 NBIM + `BatchedMesh`**：几何按八叉树切成块，每块一个 `BatchedMesh`，23 万构件只需数百次 draw call，而不是 23 万次。
- **内存预算而非“全部加载”**：`maxLoadedChunks` / `maxCachedChunks` / `maxConcurrentChunkLoads` 由 JS 堆上限和单块解码预估值动态推导；超出预算时优先卸载最远的可见分块。
- **按需渲染**：只有相机、加载、选中状态变化时才绘制一帧，空闲时几乎零开销。
- **屏幕空间剔除**：投影小于约 4 px 的分块不参与解码；相机移动期间暂停预取。
- **实例感知拾取**：`batchId` → uuid/来源的映射让单击能定位到具体实例；框选先用整块包围盒剔除，再落到实例级。
- **属性索引懒加载**：超过 2 万条属性文档时不常驻内存，选中时按需解析；搜索时一次性单遍构建。
- **无头批量转换**：LMB → NBIM 仅使用 CPU 与磁盘，可在没有可用 GPU 的机器上运行。

### 已知边界

- **NBIM 才是快路径**：原始多文件格式建议先用内置批量转换合并成单个 `.nbim`，否则加载阶段的时间会花在转换上，而不是流式渲染。
- **极远分块会被跳过**：投影小于约 4 px 的分块不参与解码；同时打开多个相距很远的模型时，远处那个在放大前可能几乎空白。
- **首次属性搜索可能稍慢**：模型属性文档超过 2 万条时，搜索索引在首次使用时构建。
- **软件渲染帧率是下限而非目标**：上述帧率均在没有 GPU 的环境测得，真实 GPU 浏览器会明显更快。

## 安装

组件库已发布到 npm（包名 **`@zhangly1403/3dbrowser`**，附带构建 provenance），可直接安装发布版本，无需从源码构建。

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

本项目仅供学习和研究使用，**禁止用于任何商业目的**。如需商业授权或企业级支持，请联系作者：`zhangly1403@qq.com`。

