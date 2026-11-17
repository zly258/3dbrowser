# 3dbrowser

面向超大模型的浏览器端 3D / BIM 查看器。单个 **2.9 GB** 的 NBIM 文件（231,353 个构件、1.86 亿渲染三角面）可在数秒内于单个标签页打开，JS 堆稳定控制在约 3 GB 以内。

React 19 · Three.js · TypeScript · NBIM v11

---

## 这是什么

`3dbrowser` 是一个用于在浏览器里查看大型 BIM / 3D 模型的 React 组件库与应用。它读取自定义单文件容器 **NBIM v11**（几何、属性、结构树全部打包在一个文件里），按八叉树分块流式加载，因此首帧远早于最后一块到达。

它不是"通用 glTF 查看器 + BIM 功能"：内存模型、点选、框选、属性检索都是围绕十万级构件设计的。

---

## 功能

**支持格式**

| 类别 | 格式 |
| --- | --- |
| BIM | IFC（基于 `web-ifc`） |
| 通用 | GLB / GLTF、FBX、OBJ、STL、PLY、3DS、DAE |
| CAD | STEP / STP、IGES / IGS（基于 `occt-import-js`） |
| 原生 | **NBIM v11**（`.nbim`） |

**查看与检查**

- **测量** —— 距离、角度、点位坐标。
- **剖切** —— 实时裁剪面，打开面板时按当前模型自动重算范围。
- **场景树** —— 交互式结构视图，支持搜索、显隐切换、定位到视图。
- **属性** —— 逐构件元数据，选中时按需解析。
- **显示样式** —— *着色*（仅实体）与 *真实*（着色 + CAD 式棱边：梁柱硬边、圆柱竖棱与端部圆环）。样式取自本地偏好，**顶栏不再提供切换**。
- **框选** —— 全屏框选，十万级构件下仍保持毫秒级响应。
- **实例级点选** —— 单击精确命中光标下的那一个实例，仅高亮该实例（带发光），高亮色可配置。
- **碰撞检测、爆炸视图、视点、截图** —— 从工具菜单进入。

**界面**

- Material Design 3 语言：44px 顶栏、三栏骨架、24px 底栏、胶囊按钮、毛玻璃下拉。
- **工具坞** —— 工具条可放在顶栏，也可作为底部居中胶囊坞，支持「仅图标」与「上图标下文字」两种呈现。
- 浅色与暗色主题由同一套令牌驱动。
- 中英文运行时切换。

**离线转换**

- 原始源文件（IFC / GLB / FBX / OBJ 等）可在纯 CPU 环境合并导出为单个 NBIM v11 文件，不占用显存。

---

## 实测规模

下列数据来自真实生产模型，已做脱敏处理：隐去文件名、路径、客户与项目信息，仅保留汇总的几何量与耗时。所有耗时均在 **headless Chrome + 软件渲染（SwiftShader）** 下测得，属于偏保守的下限；真实 GPU 环境会更快。

### 模型规模

| 指标 | 模型 A（多文件钢结构工程） |
| --- | ---: |
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
| 全景环绕时的 JS 堆 | 2.0 – 3.1 GB，稳定 | 优化前 3.5 → 7.5 GB，最终 OOM |
| 全景帧率 | ~26 fps | 软件渲染 |
| 近景帧率 | ~54 fps | 软件渲染 |
| 全屏框选 33,588 个构件 | ~70 ms | 框选覆盖整个视口 |
| 拖动时 / 松手后的像素比 | 0.8 → 1.0 | 自适应画质 |

### 压缩效果（NBIM v11）

| 模型 | 源体积 | v11 体积 | 压缩比 | 分块 | 构件数 |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 1162 MB | **22.3 MB** | 49.6× | 464 | 146,407 |
| B | 912 MB | **17.6 MB** | 49.4× | 319 | 114,909 |
| C | 633 MB | **9.8 MB** | 61.4× | 108 | 78,822 |
| F | 34 MB | **0.43 MB** | 78.3× | 8 | 2,424 |

批量 305 个文件（15.28 GB）→ **0.303 GB**，整体 **50.5×**。

---

## 性能来源

- **分块 NBIM + `BatchedMesh`**：几何按八叉树切成块，每块一个 `BatchedMesh`，23 万构件只需数百次 draw call，而不是 23 万次。
- **预算驱动的驻留**：`maxLoadedChunks` / `maxCachedChunks` / `maxConcurrentChunkLoads` 由 JS 堆上限、`manifest.stats.memory` 里的*实际*解码几何量，以及实测约 4× 的 BatchedMesh 占用系数推导。整模型装得下就全量加载；装不下则按屏幕中心度/距离加载到预算为止，远景/陈旧分块随相机移动回收。
- **量化几何**：position 用 int16（每块独立 scale/offset），法线 int8（由 GPU 归一化还原），索引 u16/u32，分块 payload 用 gzip / brotli 压缩。
- **按需渲染**：只有相机、加载、选中状态变化时才绘制一帧，空闲时几乎零开销。
- **优先级加载**：超大模型先加载最中心/最近的分块；点选与框选对每个已加载分块都有效。
- **实例感知拾取**：`batchId` → uuid/来源的映射让单击能定位到具体实例；框选先用整块包围盒剔除，再落到实例级。
- **属性索引懒加载**：超过 2 万条属性文档时不常驻内存，选中时按需解析；搜索时一次性单遍构建。
- **逐实例几何视图按需构建**：拾取只用包围盒；边线/碰撞/面积才构建零拷贝视图，用完立即释放。

---

## 已知边界

- **NBIM 才是快路径**：源模型建议先导出为单个 NBIM v11 文件。原始多文件格式的加载时间会花在转换上，而不是流式渲染。
- **只读 v11**：旧版 NBIM（v8/v9）会被明确拒绝——*「这是旧版 NBIM（v8/v9）文件，当前版本已不再支持旧格式，请改用 v11 单文件（.nbim）」*。
- **超大模型是流式而非全量驻留**：2.9 GB / 1,271 块的 NBIM 在 4 GB JS 堆下约驻留 400 块（解码几何约 1.9 GB，总堆约 3.4–3.5 GB）。一次加载全部 1,271 块需要约 9 GB，有 OOM 风险；远处未访问分块在进入预算前以 ghost 线框显示。
- **首次属性搜索可能稍慢**：属性文档超过 2 万条时，索引在首次使用时构建。
- **软件渲染帧率是下限而非目标**：上述帧率均在没有 GPU 的环境测得，真实 GPU 浏览器会明显更快。
- **真实样式棱边按深度截断**：超大模型只给最近的分块描边；远处棱边在常规缩放下本来也看不清。

---

## 快速开始

环境要求：**Node.js ≥ 20**，支持 WebGL2 的现代浏览器。

```bash
git clone https://github.com/zly258/3dbrowser.git
cd 3dbrowser
# 用惯用的包管理器按 package-lock.json 安装依赖
node node_modules/vite/bin/vite.js      # 开发服务器 → http://localhost:5173
```

生产构建：

```bash
node node_modules/vite/bin/vite.js build
node node_modules/typescript/bin/tsc -p tsconfig.lib.json --skipLibCheck
node scripts/post-build.js
```

### 静态资源

解码 IFC 与 OCC 所需的 WASM / worker 文件位于 `public/libs`（web-ifc、occt-import-js、Draco、Basis）。若要把查看器嵌入其他宿主页面，把该目录复制到宿主的静态目录，并在 `libPath` 指向的位置不是 `./libs` 时传入该属性。

### 使用组件

```tsx
import { ThreeViewer } from './src';

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ThreeViewer
        libPath="/libs"
        defaultTheme="dark"
        defaultLang="zh"
        showStats
        initialFiles={['https://example.com/models/building.glb']}
        onSelect={(uuid, object) => console.log('选中对象:', uuid, object)}
      />
    </div>
  );
}
```

---

## 参数说明

### `ThreeViewer` 属性

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `libPath` | `string` | `'./libs'` | 包含 WASM / worker 文件的目录（相对于 `window.location`） |
| `allowDragOpen` | `boolean` | `true` | 是否允许拖拽打开文件 |
| `hiddenMenus` | `string[]` | `[]` | 需要隐藏的菜单 / 工具 ID，见下表 |
| `defaultTheme` | `'light' \| 'dark'` | `'light'` | 无本地偏好时的默认外观（暗色会同步深色视口底色） |
| `defaultLang` | `'zh' \| 'en'` | `'en'` | 默认界面语言 |
| `showStats` | `boolean` | `true` | 显示性能统计面板 |
| `showOutline` | `boolean` | `true` | 显示场景结构面板 |
| `showProperties` | `boolean` | `true` | 显示对象属性面板 |
| `initialSettings` | `Partial<SceneSettings>` | — | 初始场景设置（光照、背景等） |
| `initialFiles` | `string \| File \| (string \| File)[]` | — | 挂载时自动加载的单个文件或文件列表（URL 或 `File`；不支持整目录） |
| `onSelect` | `(uuid: string, object: any) => void` | — | 对象选中时的回调 |
| `onLoad` | `(manager: SceneManager) => void` | — | 场景管理器就绪后的回调 |
| `hideDeleteModel` | `boolean` | `false` | 隐藏删除模型按钮 |
| `performancePreset` | `PerformancePreset` | `'quality'` | 渲染 / 内存预设 |
| `chunkOptions` | `SceneChunkOptions` | — | 分块缓存大小、内存上限、并发数 |

`hiddenMenus` 可用 ID：`file`、`open_file`、`open_url`、`export`、`batch_convert`、`clear`、`view`、`fit_view`、`views`、`interface`、`outline`、`props`、`pick`、`tool`、`measure`、`boxSelect`、`clip`、`viewpoint`、`screenshot`、`search`、`clash`、`explode`、`settings`、`about`、`stats`、`sun`。

### `SceneManager`

需要更细的控制时，可通过 `onLoad` 直接操作场景管理器：

```ts
import type { SceneManager } from './src';

const handleLoad = (manager: SceneManager) => {
  manager.fitView();                  // 按可见内容取景
  manager.setView('front');           // front / back / top / bottom / left / right / se / sw / ne / nw
  manager.loadNbim('path/to/model.nbim');
};
```

其它常用成员：`removeModel`、`clear`、`exportNbim`、`getCameraState`、`getMemoryReport`、`fitViewToObject`、`collectBoundsForUuids`、`applyVisibilityBatch`、`getNbimProperties`、`getNbimIfcPropertyGroups`。

---

## NBIM v11 容器

单文件结构：1024 字节文件头 → 分块数据 → 属性区段 → manifest。

| 字段 | 值 |
| --- | --- |
| Magic | `NBM1`（`0x314d424e`） |
| 版本 | `11` |
| 文件头 | 1024 字节 |
| Flags | bit 0 manifest gzip · bit 1 属性分块 · bit 2 manifest brotli |

几何按块量化（position int16 + 每块 scale/offset、法线 int8、索引 u16/u32）。属性以去重字符串池 + 列式记录存储，按 64 KB 分块，因此读取单个构件的属性无需载入整个属性区段。

完整规范见 `docs/nbim11-format.md`，实测统计见 `docs/stats-nbim11.md`。

---

## 目录结构

```
src/
  components/     React 界面（顶栏、面板、场景树、属性、视图立方、工具坞）
  hooks/          查看器状态、文件加载、选择、搜索、视点
  loader/         IFC / OCC 加载器与资源解析
  utils/
    scene-core/   NBIM v11 读写、NBIP 属性库、分块编解码
    scene-manager/ 场景、分块、拾取、框选、棱边、剖切、测量
  styles/         手写 CSS 模块，令牌集中在 variables.css
  theme/          图标集、双语字典、主题管理
scripts/          构建收尾、UI 审计、覆盖率检查、NBIM 自测与统计
docs/             格式规范、统计数据、回归清单（仅本地保留）
public/libs/      WASM / worker 解码器（web-ifc、occt-import-js、Draco、Basis）
```

### 脚本

```bash
node scripts/run.mjs nbim11-selftest      # NBIM v11 往返自测（28 项）
node scripts/nbim-stats.mjs <文件.nbim>    # 只读容器统计
node scripts/ui-audit.mjs --strict        # 设计令牌、对比度、圆角/z-index/字号阶梯
node scripts/class-coverage.cjs           # TSX 中每个 className 都有样式规则
```

---

## 界面样式规范

全站共用一套浅色 Material Design 3 CAD 查看器语言，字体链 `Nunito` / `Noto Sans SC` + 系统中文回退。令牌唯一来源 `src/styles/variables.css`，组件样式是手写模块文件，由 `src/styles/index.css` 按顺序引入。

- **密度**：正文 12px，控件 26px，说明文字 11px，底栏 24px。
- **骨架**：顶栏 44px + 三栏（左 `clamp(200px,20vw,264px)`、视口 `flex:1; min-width:0`、右 `clamp(240px,25vw,340px)`）+ 底栏 24px。页面本身不滚动，滚动只发生在面板内部。
- **配色**：`#F8FAFC` 页面底 + `#FFFFFF` 表面，主文字 `#1E293B` / 次文字 `#475569`，边框 `#E2E8F0` / `#F1F5F9`，单一强调色 `#2563EB` + danger/success/warn 语义色，对比度均 ≥ 4.5:1。
- **形与图标**：按钮一律胶囊（999px），输入 6px，菜单/浮动面板 12px，模态与加载卡 16px，滚动条 6px 半透明胶囊。
- **状态**：任何改 `background` 的规则必须同时声明 `color`；禁用态用令牌换色（禁止 `opacity`）；白字只允许压在强调色 / 危险 / 深色提示底上。
- **暗色主题**：只替换令牌取值（`.theme-dark`），不改组件结构。

交付前执行：

```bash
node scripts/ui-audit.mjs --strict
node scripts/class-coverage.cjs
```

---

## 测试

- **自测** —— `node scripts/run.mjs nbim11-selftest`，28 项，覆盖 NBIP 往返、单文件端到端、5,000 构件规模、索引 delta 编码、字符串池边界（多字节 / 空串 / 超长 / 前缀共享）。
- **回归清单** —— 覆盖加载 / 结构树 / 单选 / 高亮 / 框选 / 属性 / 浏览 / 删除 / 多模型，见 `docs/testing/regression-checklist.md`。

---

## 许可证

### 非商业用途免费 —— 禁止商用

本项目仅供学习和研究使用，**禁止用于任何商业目的**。如需商业授权或企业级支持，请联系 `zhangly1403@qq.com`。

English documentation: [README.md](README.md)
