<h1 align="center">3dbrowser</h1>

<p align="center">面向十万级构件超大型模型的浏览器端 3D / BIM 查看器与 React 组件库。</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-React%2019%20%2B%20Three.js-3776AB?style=flat-square" alt="TypeScript, React 19, and Three.js"> <img src="https://img.shields.io/badge/Platform-WebGL2%20Browser-4B5563?style=flat-square" alt="Platform: WebGL2 Browser"> <a href="https://zly258.github.io/3dbrowser/"><img src="https://img.shields.io/badge/Demo-GitHub%20Pages-0891B2?style=flat-square" alt="GitHub Pages 在线演示"></a> <a href="https://github.com/zly258/3dbrowser/actions/workflows/deploy-pages.yml"><img src="https://img.shields.io/github/actions/workflow/status/zly258/3dbrowser/deploy-pages.yml?branch=main&label=CI&style=flat-square" alt="CI 状态"></a> <a href="./LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-22C55E?style=flat-square" alt="License: GPL-3.0"></a> <a href="https://ifdian.net/order/create?user_id=3db8e630e6dc11f1b37452540025c377"><img src="https://img.shields.io/badge/Afdian-Sponsor-7C3AED?style=flat-square" alt="在爱发电赞助作者"></a>
</p>

`3dbrowser` 是基于 React 19 与 Three.js 构建的浏览器端 3D / BIM 查看器及组件库，专为超出普通 Web 查看器承载能力的大型工程装配模型设计。它的内存管理、八叉树分块流式加载、实例级拾取、全屏框选和属性懒加载索引，均围绕十万级构件场景从底层设计，而非在通用网格查看器上外挂 BIM 功能。

项目读写自定义单文件容器 **NBIM v11**（`.nbim`），将量化几何、分块属性库与场景结构树封装在单一文件中，并按视口优先级流式加载，在全部分块到达之前即可快速呈现可交互首帧。

## 核心亮点

| 亮点 | 实际价值 |
| --- | --- |
| 八叉树分块流式加载与 `BatchedMesh` | 将 23 万以上构件合并为数百次 draw call，2.9 GB NBIM v11 单文件数秒可交互，JS 堆稳定在约 3 GB 以内。 |
| 预算驱动的内存驻留策略 | 依据 JS 堆上限与 manifest 内存统计动态推导 `maxLoadedChunks` / `maxCachedChunks` / `maxConcurrentChunkLoads`，相机移动时自动回收远景分块。 |
| 多格式 BIM / CAD / 3D 解析与离线转换 | 支持 IFC（`web-ifc`）、STEP/IGES（`occt-import-js`）、GLB/GLTF、FBX、OBJ、STL、PLY、3DS、DAE 与 NBIM v11，并支持纯 CPU 离线合并导出为 NBIM v11。 |
| 十万级构件交互与按需属性检索 | 基于 `batchId` 映射实现实例级单击高亮，按分块包围盒剔除实现全屏框选（33,588 个构件约 70 ms），属性文档超 2 万条时按需解析与懒建索引。 |
| 可嵌入 React 组件与 MD3 界面体系 | 提供 `<ThreeViewer />` 与 `SceneManager`，内置明暗主题、中英文运行时切换、测量、剖切、碰撞检测、爆炸视图、视点与截图工具。 |

## 架构概览

代码库将 React 界面编排、Three.js 场景与分块流式引擎、二进制容器与格式解码划分为三个清晰层次：

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                   React UI & Viewer State (src/ThreeViewer.tsx)            │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │  Components & Theme  │  │     Viewer Hooks     │  │  Selection &     │  │
│  │  Toolbar, ToolsDock, │  │  File loading, stats │  │  Lazy Property   │  │
│  │  SceneTree, Panels   │  │  viewpoints, search  │  │  Index (viewer/) │  │
│  └──────────────────────┘  └──────────────────────┘  └──────────────────┘  │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │ API calls / callbacks
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│              Scene & Chunk Streaming Engine (src/utils/scene-manager/)     │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │  SceneManager Core   │  │  Chunk Scheduling &  │  │  Tools & Picking │  │
│  │  On-demand render,   │─▶│  BatchedMesh Pool    │  │  batchId pick,   │  │
│  │  camera, visibility  │  │  + chunkWorker.ts    │  │  boxSelect, clip │  │
│  └──────────────────────┘  └──────────────────────┘  └──────────────────┘  │
└──────────────────┬──────────────────────────────────────┬──────────────────┘
                   │ NBIM v11 I/O                         │ Format loaders
                   ▼                                      ▼
┌─────────────────────────────────────┐  ┌───────────────────────────────────┐
│   NBIM v11 Core (scene-core/)       │  │   Format Loaders (src/loader/)    │
│   nbimIO.ts  · nbimChunk.ts         │  │   ifcLoader.ts   (web-ifc)        │
│   nbip.ts    · codec.ts             │  │   occtLoader.ts  (occt-import-js) │
│   [Header|Chunks|NBIP|Manifest]     │  │   Three loaders + public/libs/    │
└─────────────────────────────────────┘  └───────────────────────────────────┘
```

### NBIM v11 单文件容器结构

`.nbim` v11 文件按顺序组织为：1024 字节小端文件头、量化几何分块数据、NBIP 分块压缩属性区段以及压缩 manifest：

| 字段 | 说明 |
| --- | --- |
| Magic | `NBM1`（`0x314d424e`） |
| 版本 | `11` |
| 文件头大小 | `1024` 字节 |
| Flags | bit 0：manifest gzip；bit 1：属性分块 gzip；bit 2：manifest brotli |

几何按分块量化（position 采用 int16 配合分块 scale/offset，法线采用 int8 并在 GPU 侧归一化还原，索引采用 u16/u32）。属性采用去重字符串池与列式记录并切分为独立压缩块，查询单个构件属性时无需加载整个属性区段。

## 快速安装

环境要求：**Node.js >= 20**（CI 环境使用 Node.js 22），以及支持 **WebGL2** 的现代浏览器。

```bash
git clone https://github.com/zly258/3dbrowser.git
cd 3dbrowser
npm ci
```

若将 `ThreeViewer` 嵌入到其他宿主应用中，请将 `public/libs`（包含 `web-ifc`、`occt-import-js`、Draco 与 Basis 的 WASM/worker 解码器）复制到宿主静态资源目录；若访问路径不是 `./libs`，请通过 `libPath` 属性指定。

## 快速开始

### 启动本地查看器

运行 Vite 开发服务器：

```bash
npm run dev
```

在支持 WebGL2 的浏览器中打开 `http://localhost:5173`，将 `.nbim`、`.ifc`、`.glb`、`.step` 或其他支持格式的模型拖入视口即可浏览。

### 作为 React 组件嵌入

```tsx
import { ThreeViewer } from './src';

export function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ThreeViewer
        libPath="/libs"
        defaultTheme="dark"
        defaultLang="zh"
        showStats
        initialFiles={['https://example.com/models/building.glb']}
        onSelect={(uuid, object) => console.log('Selected:', uuid, object)}
      />
    </div>
  );
}
```

## 常用命令

以下脚本均定义于 `package.json`：

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器（端口 `5173`）。 |
| `npm run build` | 构建 ES 组件库产物、生成类型声明并执行 `scripts/post-build.js`。 |
| `npm run build:pages` | 构建 GitHub Pages 独立演示站点至 `dist-pages/`。 |
| `npm run preview` | 本地预览 Vite 生产构建结果。 |
| `npm run typecheck` | 执行 TypeScript 类型检查（`tsc -p tsconfig.json --noEmit`）。 |
| `npm run lint` | 对 `src` 与 `scripts` 执行 ESLint 检查。 |
| `npm run test:nbim` | 运行 28 项 NBIM v11 / NBIP 往返自测（`scripts/run.mjs nbim11-selftest`）。 |
| `npm run stats:nbim -- <file.nbim>` | 输出指定 `.nbim` 文件的只读容器统计信息。 |
| `npm run ui:audit:strict` | 以严格模式审计设计令牌、对比度、圆角、z-index 与字号阶梯。 |
| `npm run ui:coverage` | 检查 TSX 中使用的每个 `className` 是否均存在对应样式规则。 |
| `npm run check` | 依次执行 `typecheck`、`lint`、`test:nbim`、`ui:audit:strict` 与 `ui:coverage`。 |

## API 示例

### `ThreeViewer` 属性

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `libPath` | `string` | `'./libs'` | WASM / worker 解码器目录路径（相对于 `window.location`）。 |
| `allowDragOpen` | `boolean` | `true` | 是否允许拖拽打开模型文件。 |
| `hiddenMenus` | `string[]` | `[]` | 需要隐藏的菜单或工具 ID（见下方列表）。 |
| `defaultTheme` | `'light' \| 'dark'` | `'light'` | 无本地偏好时的默认主题。 |
| `defaultLang` | `'zh' \| 'en'` | `'en'` | 无本地偏好时的默认界面语言。 |
| `showStats` | `boolean` | `true` | 是否显示性能统计面板。 |
| `showOutline` | `boolean` | `true` | 是否显示场景结构树面板。 |
| `showProperties` | `boolean` | `true` | 是否显示对象属性面板。 |
| `initialSettings` | `Partial<SceneSettings>` | — | 初始场景设置（光照、背景与显示参数）。 |
| `initialFiles` | `string \| File \| (string \| File)[]` | — | 组件挂载时自动加载的文件或 URL（仅支持单文件或列表，不支持整目录）。 |
| `onSelect` | `(uuid: string, object: any) => void` | — | 选中对象或实例时的回调函数。 |
| `onLoad` | `(manager: SceneManager) => void` | — | `SceneManager` 初始化完成后的回调。 |
| `hideDeleteModel` | `boolean` | `false` | 是否隐藏删除模型按钮。 |
| `performancePreset` | `PerformancePreset` | `'quality'` | 渲染与内存预设模式。 |
| `chunkOptions` | `SceneChunkOptions` | — | 分块缓存大小、内存上限、并发加载数与 LOD 策略配置。 |

`hiddenMenus` 可选 ID：`file`、`open_file`、`open_url`、`export`、`batch_convert`、`clear`、`view`、`fit_view`、`views`、`interface`、`outline`、`props`、`pick`、`tool`、`measure`、`boxSelect`、`clip`、`viewpoint`、`screenshot`、`search`、`clash`、`explode`、`settings`、`about`、`stats`、`sun`。

### 通过 `SceneManager` 进行编程控制

```ts
import type { SceneManager } from './src';

const handleLoad = (manager: SceneManager) => {
  manager.fitView(); // 按当前可见内容自适应取景
  manager.setView('front'); // front | back | top | bottom | left | right | se | sw | ne | nw
  manager.loadNbim('path/to/model.nbim');
};
```

其他常用 `SceneManager` 方法包括：`removeModel`、`clear`、`exportNbim`、`getCameraState`、`getMemoryReport`、`fitViewToObject`、`collectBoundsForUuids`、`applyVisibilityBatch`、`getNbimProperties` 与 `getNbimIfcPropertyGroups`。

## 配置与集成

### 支持的文件格式

| 类别 | 格式 |
| --- | --- |
| BIM | IFC（基于 `web-ifc`） |
| 通用 3D | GLB / GLTF、FBX、OBJ、STL、PLY、3DS、DAE |
| CAD | STEP / STP、IGES / IGS（基于 `occt-import-js`） |
| 原生格式 | NBIM v11（`.nbim`） |

### 实测规模与已知边界

以下数据来自脱敏后的真实生产模型，均在 **headless Chrome + 软件渲染（SwiftShader）** 环境下测得，属于保守下限（真实 GPU 环境表现更快）：

- **参考模型规模**：140 个钢结构源文件合并为单个 **2.9 GB** NBIM v11 文件（231,353 个构件节点、52,506,466 唯一三角面、737,330 个实例、968,683 个渲染实例、186,284,229 个渲染三角面）。
- **运行表现**：首屏可交互耗时 **3.0 – 4.5 s**；全景环绕 JS 堆稳定在 **2.0 – 3.1 GB**；软件渲染下全景约 26 fps、近景约 54 fps；全屏框选 33,588 个构件约 **70 ms**；交互拖动时像素比自适应 `0.8 -> 1.0`。
- **NBIM v11 压缩比**：305 个文件（总计 15.28 GB）批量转换后为 **0.303 GB**（整体 **50.5x**，单个模型区间为 49.4x 至 78.3x）。
- **已知边界**：
  - **仅支持 NBIM v11**：旧版 NBIM（v8/v9）文件会被明确拒绝并提示升级为 v11 单文件。
  - **超大规模按需驻留**：2.9 GB / 1,271 块的模型在 4 GB JS 堆下约常驻 400 块；超出预算的远景分块以 ghost 线框代理显示。
  - **属性检索懒建索引**：属性文档超过 20,000 条时，搜索索引在首次检索时单遍构建。
  - **真实棱边深度截断**：超大模型仅对近景分块渲染 CAD 风格棱边。

### 界面样式体系

设计令牌统一定义在 `src/styles/variables.css`，由 `src/styles/index.css` 按顺序引入各模块样式。界面采用 44px 顶栏、三栏骨架（左侧场景树、弹性视口、右侧属性面板）与 24px 底栏，遵循 Material Design 3 尺寸体系（正文 12px、控件 26px、胶囊按钮），暗色模式通过 `.theme-dark` 令牌切换。修改样式后请运行 `npm run ui:audit:strict` 与 `npm run ui:coverage`。

## 社区与支持

- **在线演示**：[zly258.github.io/3dbrowser](https://zly258.github.io/3dbrowser/)
- **问题反馈与功能建议**：[GitHub Issues](https://github.com/zly258/3dbrowser/issues)
- **赞助支持**：[直达爱发电打赏页](https://ifdian.net/order/create?user_id=3db8e630e6dc11f1b37452540025c377) | [爱发电创作者主页](https://ifdian.net/a/zhangly1403)

## 许可证

本项目基于 [GNU 通用公共许可证第 3 版 (GPL-3.0)](./LICENSE) 开源。
