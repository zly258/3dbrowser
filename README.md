# 3D Browser

<div align="center">
  <h1>Professional 3D Model Viewer</h1>
  <p><em>Modern Cross-platform 3D model viewer with a clean classic interface</em></p>
  <p><strong>Version 1.1.0</strong></p>
  <div>
    <a href="#english">English</a> | <a href="#chinese">中文</a>
  </div>
</div>

---

<a name="english"></a>

## UI Preview

<div align="center">
  <img src="images/electron-en.png" alt="3D Browser English UI Preview" width="800" style="border-radius: 2px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); margin: 10px 0;"/>
</div>

## Key Features

- **Cross-Platform Desktop App**: High-performance desktop application powered by **Electron**, supporting Windows and Linux.
- **Clean Classic Interface**: Intuitive menu-driven UI designed for focus and productivity.
- **High-Performance Rendering**: Powered by **NBIM** and **BatchedMesh** technologies, capable of smoothly rendering over 100,000 independent meshes with minimal draw calls.
- **Multi-format Support**: Load and display various 3D model formats including IFC, GLB/GLTF, 3D Tiles, FBX, OBJ, and LMB.
- **3D Tiles Streaming**: Efficient loading solution for large-scale geospatial data.
- **Advanced Measurement Tools**: Support for point-to-point distance, three-point angle, and scene coordinate measurement.
- **Sectioning Tools**: Dynamic clipping planes on X, Y, and Z axes for deep model analysis.
- **Search and Filter**: Real-time search and filtering in both Scene Tree and Properties Panel for quick component localization.
- **Multi-format Export**: Support for NBIM, LMB, GLB, and 3D Tiles format export.
- **Bilingual Interface**: Full-spectrum bilingual support (English/Chinese) with dynamic switching.
- **Theme System**: Dark and light theme options for different working environments.
- **View Control**: Integrated dropdown menu for 10 standard perspectives including isometric views.

## Tech Stack

- **Framework**: React 19, TypeScript 5.8
- **3D Engine**: Three.js 0.181
- **Desktop**: Electron 39
- **Build Tool**: Vite 6.2, Electron Builder 26
- **Format Support**: Web-IFC, 3D Tiles Renderer
- **Styling**: Modern CSS-in-JS

## System Requirements

- Node.js (Version 18 or higher)
- npm or yarn package manager
- Modern browser or Windows/Linux Desktop environment

## Quick Start

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd 3dbrowser
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Development**:
   - **Web**: `npm run dev`
   - **Desktop**: `npm run electron:dev`

4. **Open your browser and navigate to** `http://localhost:5173` (for web)

## Available Scripts

| Command | Description |
|------|------|
| `npm run dev` | Start web development server |
| `npm run build" | Build web production assets |
| `npm run electron:dev` | Start Electron desktop app in dev mode |
| `npm run electron:build` | Build and package desktop installers |

## Packaging

To generate desktop installers for Windows and Linux:

```bash
# Package for both Windows and Linux
npm run electron:build -- --win --linux

# Package for Windows only (NSIS and Portable)
npm run electron:build -- --win
```
*Output will be generated in the `dist_electron` directory.*

## Core Components

- **SceneManager.ts**: Core 3D engine handling scene management, rendering, and camera controls.
- **MenuBar.tsx**: Classic menu-driven interface with file operations, view controls, and tool access.
- **ToolPanels.tsx**: Measurement, clipping, and export tool panels.
- **SceneTree.tsx**: Hierarchical view of scene objects with selection and real-time search support.
- **PropertiesPanel.tsx**: Object properties and measurement results display.
- **SettingsPanel.tsx**: Application settings including lighting, themes, and language.

## Advanced Features

- **Measurement Tools**: Point-to-point distance, three-point angle, and coordinate display.
- **Sectioning Tools**: Dynamic clipping planes on X, Y, and Z axes.
- **Search System**: Real-time filtering for both the object tree and properties.
- **Extreme Performance**: Progressive loading and high-performance rendering using **BatchedMesh**, maintaining object independence for interaction while rendering 100k+ elements.
- **Internationalization**: Complete bilingual support for all UI elements, placeholders, and status messages.

## NBIM Format Structure

NBIM is a high-performance binary 3D format optimized for web streaming:
- **Octree Spatial Partitioning**: The scene is organized into a hierarchical Octree structure. Large models are subdivided into spatial chunks, allowing for efficient frustum culling and progressive level-of-detail (LOD) loading.
- **Binary V7 Specification**: Uses a specialized binary layout for rapid parsing. Each chunk contains optimized geometry buffers (Position, Normal, Index) and instance metadata.
- **Batched Mesh Integration**: Data is streamed directly into `THREE.BatchedMesh` containers, reducing Draw Calls while maintaining individual object identity and metadata.
- **Proxy System**: Uses lightweight proxy objects for selection and properties interaction, avoiding the memory overhead of thousands of independent `THREE.Mesh` instances.

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a pull request

## License

### Free for Non-Commercial Use (Commercial Use Prohibited)

This project is intended for learning and research purposes only. **Commercial use of any kind is strictly prohibited**. For commercial licensing, please contact the original author for authorization.

### Usage Terms

- ✅ **Allowed**: Personal learning, research, and educational purposes
- ✅ **Allowed**: Learning and reference for non-commercial projects
- ✅ **Allowed**: Code modification for non-commercial purposes
- ❌ **Prohibited**: Direct or indirect commercial use
- ❌ **Prohibited**: Sale or lease of commercial products
- ❌ **Prohibited**: Integration or deployment in commercial projects

### Attribution Requirements

**Attribution is mandatory** when using this project:

- **Must cite**: `d:\workspace\nodejs\3dbrowser\README.md`
- **Must cite**: Original author attribution
- **Recommended**: Project source and author information

### Attribution Example

When using this project's code or documentation, please attribute as follows:

```markdown
Based on 3D Browser development
Original source: d:\workspace\nodejs\3dbrowser\README.md
Author: zhangly1403@163.com
```

### Disclaimer

Users assume all risks when using this project. The author assumes no responsibility for any direct or indirect losses arising from the use of this project.

---



---

<a name="chinese"></a>

## 界面预览

<div align="center">
  <img src="images/electron-zh.png" alt="3D Browser 中文界面预览" width="800" style="border-radius: 2px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); margin: 10px 0;"/>
</div>

## 特色功能

- **跨平台桌面端**: 基于 **Electron** 的高性能桌面应用程序，支持 Windows 和 Linux 系统。
- **经典简洁界面**: 直观的菜单驱动界面，专为高效工作流设计。
- **高性能渲染**: 采用 **NBIM** 与 **BatchedMesh** 技术，支持 10 万+ 独立网格（Mesh）的流畅渲染，极大地降低了绘制调用（Draw Calls）。
- **多格式支持**: 支持 IFC、GLB/GLTF、3D Tiles、FBX、OBJ、LMB 等多种 3D 文件格式。
- **3D Tiles 流式加载**: 针对大规模地理空间数据的高效加载方案。
- **高级测量工具**: 支持点对点距离、三点角度和场景内坐标测量。
- **剖切工具**: 任意轴向动态剖切平面，深度分析模型内部结构。
- **搜索与筛选**: 场景大纲和属性面板均支持实时搜索与过滤，快速定位组件。
- **多格式导出**: 支持 NBIM、LMB、GLB 和 3D Tiles 格式导出。
- **双语界面**: 全方位中英文双语支持，支持动态切换。
- **主题系统**: 支持深色和浅色主题，适应不同使用环境。
- **视图控制**: 集成式视图下拉菜单，支持包括轴侧视图在内的 10 种标准视角。

## 技术栈

- **前端框架**: React 19, TypeScript 5.8
- **3D 引擎**: Three.js 0.181
- **桌面框架**: Electron 39
- **构建工具**: Vite 6.2, Electron Builder 26
- **核心技术**: NBIM Binary V7, BatchedMesh Optimization
- **格式支持**: Web-IFC, 3D Tiles Renderer
- **样式方案**: 现代 CSS-in-JS

## 系统要求

- Node.js (版本 18 或更高)
- npm 或 yarn 包管理器
- 现代浏览器 或 Windows/Linux 桌面环境

## 快速开始

1. **克隆仓库**:
   ```bash
   git clone <repository-url>
   cd 3dbrowser
   ```

2. **安装依赖**:
   ```bash
   npm install
   ```

3. **启动开发**:
   - **Web 端**: `npm run dev`
   - **桌面端**: `npm run electron:dev`

4. **打开浏览器并访问** `http://localhost:5173` (Web 端)

## 可用脚本

| 命令 | 描述 |
|------|------|
| `npm run dev` | 启动 Web 开发服务器 |
| `npm run build` | 构建 Web 生产环境产物 |
| `npm run electron:dev` | 以开发模式启动 Electron 桌面应用 |
| `npm run electron:build` | 构建并打包桌面安装程序 |

## 应用打包

为 Windows 和 Linux 生成安装包：

```bash
# 同时打包 Windows 和 Linux 版本
npm run electron:build -- --win --linux

# 仅打包 Windows 版本 (包含安装包和便携版)
npm run electron:build -- --win
```
*打包产物将存放在 `dist_electron` 目录下。*

## 核心组件

- **SceneManager.ts**: 核心 3D 引擎，集成 NBIM 解析、BatchedMesh 优化管理及相机控制。
- **MenuBar.tsx**: 经典菜单界面，提供文件操作、视图控制和工具访问。
- **ToolPanels.tsx**: 测量、剖切和导出工具面板。
- **SceneTree.tsx**: 场景对象层级视图，支持对象选择与实时搜索。
- **PropertiesPanel.tsx**: 对象属性和测量结果显示。
- **SettingsPanel.tsx**: 应用设置，包括光照、主题和语言。

## 高级功能

- **测量工具**: 点对点距离、三点角度和场景内坐标显示。
- **剖切工具**: X、Y、Z 轴动态剖切平面。
- **搜索系统**: 大纲树实时节点过滤及属性面板键值对搜索。
- **性能优化**: 极致的渲染性能，通过 BatchedMesh 实现 10 万级构件的流畅交互，支持 NBIM 格式的渐进式加载。
- **国际化**: 全方位双语支持，包含 UI 占位符、搜索提示及加载进度文本。

## NBIM 格式结构

NBIM 是一种专为 Web 端流式传输优化的二进制 3D 格式：
- **八叉树（Octree）空间划分**: 场景通过层级化的八叉树结构进行组织。大规模模型被细分为多个空间分块（Chunks），实现了高效的视锥体剔除（Frustum Culling）和渐进式加载。
- **二进制 V7 规范**: 采用专用的二进制布局进行快速解析。每个分块包含经过优化的几何体缓冲区（位置、法线、索引）以及实例元数据。
- **Batched Mesh 集成**: 数据流式加载后直接注入 `THREE.BatchedMesh` 容器，在保持构件独立身份和元数据的同时，极大减少了绘制调用（Draw Calls）。
- **代理系统**: 采用轻量化代理对象处理点选和属性交互，避免了数万个独立 `THREE.Mesh` 实例带来的内存开销。

## 贡献指南

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/新功能`
3. 提交更改：`git commit -m '添加新功能'`
4. 推送到分支：`git push origin feature/新功能`
5. 提交 Pull Request

---

## 许可证

### 非商业用途免费（禁止用于商业目的）

本项目仅供学习和研究使用，**禁止用于任何商业目的**。如需商业使用，请联系原作者获得授权。

### 使用条款

- ✅ **允许**: 个人学习、研究、教育用途
- ✅ **允许**: 非商业项目的学习和参考
- ✅ **允许**: 修改代码用于非商业目的
- ❌ **禁止**: 直接或间接商业使用
- ❌ **禁止**: 商业产品的销售或租赁
- ❌ **禁止**: 商业项目的集成或部署

### 署名要求

使用本项目时**必须注明出处**，具体要求如下：

- **必须标注**: `d:\workspace\nodejs\3dbrowser\README.md`
- **必须标注**: 原作者署名
- **推荐标注**: 项目来源和作者信息

### 署名示例

在使用本项目的代码或文档时，请按以下格式署名：

```markdown
本项目基于 3D Browser 开发
原始出处: d:\workspace\nodejs\3dbrowser\README.md
作者: zhangly1403@163.com
```

### 免责声明

使用本项目的风险由用户自行承担。作者不对使用本项目造成的任何直接或间接损失承担责任。

---



<div align="center">
  <p>Built with React, Three.js, and Vite</p>
</div>
