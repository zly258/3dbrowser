# 3D Browser / 3D 浏览器

<div align="center">
  <h1>专业级3D模型浏览器</h1>
  <p><em>Professional 3D Model Viewer with Ribbon Interface</em></p>
  <div>
    <a href="#-中文"><img src="https://img.shields.io/badge/语言-中文-brightgreen" alt="Language Chinese"></a>
    <a href="#-english"><img src="https://img.shields.io/badge/Language-English-blue" alt="Language English"></a>
  </div>
</div>

## 📖 目录

- [🌟 特色功能](#-特色功能)
- [🛠️ 技术栈](#️-技术栈)
- [📋 系统要求](#-系统要求)
- [🚀 快速开始](#-快速开始)
- [📖 可用脚本](#-可用脚本)
- [📁 项目结构](#-项目结构)
- [🎯 核心组件](#-核心组件)
- [🔧 高级功能](#-高级功能)
- [🤝 贡献指南](#-贡献指南)
- [📝 开发说明](#-开发说明)
- [📄 许可证](#-许可证)

## 🌟 特色功能

### 中文

- **功能区界面**: 类似专业CAD软件的现代功能区界面，提升工作效率
- **多格式支持**: 支持IFC、GLB/GLTF、3D Tiles、FBX、OBJ、LMB等多种3D文件格式
- **3D Tiles流式加载**: 针对大规模地理空间数据的高效加载方案
- **高级测量工具**: 支持点对点距离、三点角度和场景内坐标测量
- **剖切工具**: 任意轴向动态剖切平面，深度分析模型内部结构
- **爆炸视图**: 交互式模型爆炸技术，清晰展示组件间关系
- **多格式导出**: 支持LMB、GLB和3D Tiles格式导出
- **双语界面**: 完整的中英文双语支持，一键切换
- **主题系统**: 支持深色和浅色主题，适应不同使用环境
- **模块化架构**: 清晰的项目目录结构，易于维护和扩展
- **优化视图标签**: 支持东南、西南、东北、西北等 isometric 视角

### English

- **Ribbon Interface**: Modern ribbon-style UI similar to professional CAD software, enhancing workflow efficiency
- **Multi-format Support**: Load and display various 3D model formats (IFC, GLB/GLTF, 3D Tiles, FBX, OBJ, LMB)
- **3D Tiles Streaming**: Efficient loading solution for large-scale geospatial data
- **Advanced Measurement Tools**: Support for point-to-point distance, three-point angle, and scene coordinate measurement
- **Sectioning Tools**: Dynamic clipping planes on any axis for deep model analysis
- **Explode View**: Interactive model explosion technology, clearly showing component relationships
- **Multi-format Export**: Support for LMB, GLB, and 3D Tiles format export
- **Bilingual Interface**: Complete Chinese and English bilingual support with one-click switching
- **Theme System**: Dark and light theme options for different environments
- **Modular Architecture**: Clear project directory structure, easy to maintain and extend
- **Optimized View Labels**: Support for southeast, southwest, northeast, northwest isometric perspectives

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | ![React](https://img.shields.io/badge/React-19.2.0-61DAFB?logo=react) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8.2-3178C6?logo=typescript) |
| 3D引擎 | ![Three.js](https://img.shields.io/badge/Three.js-0.181.2-000000?logo=three.js) |
| 构建工具 | ![Vite](https://img.shields.io/badge/Vite-6.2.0-646CFF?logo=vite) |
| 3D格式支持 | IFC, GLB/GLTF, 3D Tiles, FBX, OBJ, LMB |
| 样式方案 | CSS-in-JS with modern design |
| 特殊库 | ![WebIFC](https://img.shields.io/badge/WebIFC-0.0.74-FF6E6E) ![3D Tiles Renderer](https://img.shields.io/badge/3D%20Tiles%20Renderer-0.3.31-9F7AEA) |

## 📋 系统要求

- **Node.js** (版本 16 或更高)
- **npm** 或 **yarn** 包管理器
- 现代浏览器 (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)

## 🚀 快速开始

### 中文

1. **克隆仓库**:
   ```bash
   git clone <repository-url>
   cd 3dbrowser
   ```

2. **安装依赖**:
   ```bash
   npm install
   ```

3. **启动开发服务器**:
   ```bash
   npm run dev
   ```

4. **打开浏览器并访问** `http://localhost:5173`

### English

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd 3dbrowser
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Open your browser and navigate to** `http://localhost:5173`

## 📖 可用脚本

| 命令 | 描述 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 预览生产构建 |

## 📁 项目结构

```
3dbrowser/
├── src/                    # 源代码目录
│   ├── components/         # React组件
│   │   ├── ConfirmModal.tsx     # 确认模态框
│   │   ├── LoadingOverlay.tsx   # 加载遮罩
│   │   ├── MenuBar.tsx          # 功能区菜单栏
│   │   ├── PropertiesPanel.tsx  # 属性面板
│   │   ├── SceneTree.tsx        # 场景树
│   │   ├── SettingsPanel.tsx    # 设置面板
│   │   └── ToolPanels.tsx       # 工具面板
│   ├── loader/            # 3D模型加载工具
│   │   ├── LoaderUtils.ts       # 主加载工具
│   │   ├── IFCLoader.ts         # IFC格式加载器
│   │   └── lmbLoader.ts         # 自定义LMB格式加载器
│   ├── theme/             # 主题和样式
│   │   ├── Styles.ts           # CSS-in-JS样式
│   │   ├── Icons.tsx          # 图标组件
│   │   └── Locales.ts         # 国际化资源
│   └── utils/             # 工具函数
│       ├── converter.ts        # 格式转换工具
│       ├── octree.ts           # 八叉树空间分割
│       ├── threeDTiles.ts      # 3D瓦片转换
│       ├── exportGLB.ts        # GLB格式导出
│       └── exportLMB.ts        # LMB格式导出
├── SceneManager.ts        # 3D场景管理
├── index.html             # HTML入口文件
├── index.tsx              # 主React应用
├── metadata.json          # 应用元数据
├── package.json           # 项目配置
├── tsconfig.json          # TypeScript配置
├── vite.config.ts         # Vite配置
└── images/                # 截图和预览图片
    └── preview1.png       # 主应用预览
```

## 🎯 核心组件说明

### 中文

- **SceneManager.ts**: 核心3D引擎，负责场景管理、渲染和相机控制
- **MenuBar.tsx**: 功能区界面，提供文件操作和工具访问
- **ToolPanels.tsx**: 测量、剖切、爆炸视图和导出工具
- **SceneTree.tsx**: 场景对象层级视图，支持对象选择
- **PropertiesPanel.tsx**: 对象属性和测量结果显示
- **SettingsPanel.tsx**: 应用设置，包括光照、主题和语言
- **IFCLoader.ts**: 独立的IFC格式加载器模块
- **utils/**: 模块化工具函数，包括转换器、导出器和本地化功能

### English

- **SceneManager.ts**: Core 3D engine handling scene management, rendering, and camera controls
- **MenuBar.tsx**: Ribbon-style interface with file operations and tool access
- **ToolPanels.tsx**: Measurement, clipping, explode view, and export tools
- **SceneTree.tsx**: Hierarchical view of scene objects with selection support
- **PropertiesPanel.tsx**: Object properties and measurement results display
- **SettingsPanel.tsx**: Application settings including lighting, themes, and language
- **IFCLoader.ts**: Independent IFC format loader module
- **utils/**: Modular utility functions including converters, exporters, and localization

## 🔧 高级功能

### 中文

- **功能区界面**: 专业CAD风格界面，支持选项卡导航和工具分组
- **测量工具**: 
  - 点对点距离测量
  - 三点角度测量
  - 场景内任意点坐标显示
- **剖切工具**: X、Y、Z轴动态剖切平面
- **爆炸视图**: 交互式模型爆炸，便于零件观察
- **导出功能**: 
  - GLB格式用于标准3D模型交换
  - LMB格式支持自定义压缩
  - 3D Tiles格式用于大规模网络流式加载
- **性能优化**: 大模型渐进式加载和内存管理
- **国际化**: 完整双语支持（英文/中文），支持动态切换
- **主题系统**: 深色和浅色主题选项

### English

- **Ribbon Interface**: Professional CAD-style interface with tabbed navigation and tool grouping
- **Measurement Tools**: 
  - Distance measurement between points
  - Angle measurement with 3-point selection
  - Coordinate display for any point in the scene
- **Sectioning Tools**: Dynamic clipping planes on X, Y, and Z axes
- **Explode View**: Interactive model explosion for better part visualization
- **Export Capabilities**: 
  - GLB format for standard 3D model exchange
  - LMB format with custom compression
  - 3D Tiles format for large-scale web streaming
- **Performance Optimization**: Progressive loading and memory management for large models
- **Internationalization**: Full bilingual support (English/Chinese) with dynamic switching
- **Theme System**: Dark and light theme options

## 🤝 贡献指南

### 中文

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/新功能`
3. 提交更改：`git commit -m '添加新功能'`
4. 推送到分支：`git push origin feature/新功能`
5. 提交 Pull Request

### English

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a pull request

## 📝 开发说明

### 中文

- **架构**: React 18 + TypeScript + Three.js，模块化组件结构
- **状态管理**: React hooks进行本地状态管理
- **3D引擎**: Three.js，包含自定义加载器和优化
- **样式**: CSS-in-JS方法，支持主题切换（深色/浅色主题）
- **构建系统**: Vite用于快速开发和生产构建
- **性能**: 大3D模型渐进式加载和内存管理
- **模块化结构**: 分为components、loader、theme和utils目录
- **代码注释**: 所有注释使用中文，便于维护
- **国际化**: 完整双语支持（英文/中文），支持动态切换
- **视图系统**: 增强的8方向相机视角（上下前后左右东南西南东北西北）

### English

- **Architecture**: React 18 + TypeScript + Three.js with modular component structure
- **State Management**: React hooks for local state management
- **3D Engine**: Three.js with custom loaders and optimizations
- **Styling**: CSS-in-JS approach with theme support (dark/light themes)
- **Build System**: Vite for fast development and production builds
- **Performance**: Progressive loading and memory management for large 3D models
- **Modular Structure**: Organized into components, loader, theme, and utils directories
- **Code Comments**: All comments are written in Chinese for better maintainability
- **Internationalization**: Full bilingual support (English/Chinese) with dynamic switching
- **View System**: Enhanced with 8-directional camera perspectives (top, bottom, front, back, left, right, southeast, southwest, northeast, northwest)

## 📄 许可证

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

---

<div align="center">
  <p>Built with ❤️ using React, Three.js, and Vite</p>
  <p>使用 React、Three.js 和 Vite 构建，用心打造</p>
</div>