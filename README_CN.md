# 3D 浏览器

一个基于 React、Three.js 和 Vite 构建的现代化 3D 模型浏览器。该应用程序允许您在网页浏览器中查看和交互 3D 模型，提供直观的用户界面。

## 功能特性

- **3D 模型查看器**: 加载和显示多种 3D 模型格式
- **交互式控制**: 旋转、缩放和平移 3D 模型
- **场景管理**: 组织和管​​理多个 3D 对象
- **属性面板**: 实时查看和编辑对象属性
- **设置面板**: 自定义查看器设置和偏好
- **响应式设计**: 支持桌面和移动设备

## 技术栈

- **前端框架**: React 19, TypeScript
- **3D 引擎**: Three.js
- **构建工具**: Vite
- **3D 格式**: 支持多种 3D 文件格式
- **样式设计**: CSS-in-JS 现代设计

## 系统要求

- Node.js (版本 16 或更高)
- npm 或 yarn 包管理器

## 安装指南

1. 克隆仓库：
   ```bash
   git clone <仓库地址>
   cd 3dbrowser
   ```

2. 安装依赖：
   ```bash
   npm install
   ```

3. 设置环境变量（如需要）：
   ```bash
   # 复制示例环境文件
   cp .env.local.example .env.local
   
   # 编辑 .env.local 并添加所需的 API 密钥
   ```

4. 启动开发服务器：
   ```bash
   npm run dev
   ```

5. 打开浏览器并访问 `http://localhost:5173`

## 可用脚本

- `npm run dev` - 启动开发服务器
- `npm run build` - 构建生产版本
- `npm run preview` - 预览生产构建

## 项目结构

```
3dbrowser/
├── components/          # React 组件
│   ├── ConfirmModal.tsx     # 确认模态框
│   ├── LoadingOverlay.tsx   # 加载遮罩
│   ├── MenuBar.tsx          # 菜单栏
│   ├── PropertiesPanel.tsx  # 属性面板
│   ├── SceneTree.tsx        # 场景树
│   ├── SettingsPanel.tsx    # 设置面板
│   └── ToolPanels.tsx       # 工具面板
├── public/              # 静态资源
├── src/                 # 源代码
│   ├── index.tsx        # 主应用入口
│   ├── SceneManager.ts  # 3D 场景管理
│   └── ...
├── package.json         # 项目配置
├── tsconfig.json       # TypeScript 配置
└── vite.config.ts      # Vite 配置
```

## 贡献指南

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/新功能`
3. 提交更改：`git commit -m '添加新功能'`
4. 推送到分支：`git push origin feature/新功能`
5. 提交 Pull Request

## 许可证

本项目采用 MIT 许可证 - 详见 LICENSE 文件。

## 开发说明

### 主要组件说明

- **SceneManager.ts**: 负责 3D 场景的创建、管理和渲染
- **MenuBar.tsx**: 提供应用的主要导航和操作菜单
- **PropertiesPanel.tsx**: 显示和编辑选中对象的属性
- **SceneTree.tsx**: 展示场景中所有对象的层级结构
- **SettingsPanel.tsx**: 应用设置和偏好配置

### 3D 功能

- 支持多种 3D 模型格式加载
- 提供相机控制（旋转、缩放、平移）
- 实时场景渲染和性能优化
- 对象选择和交互功能

### 开发建议

- 使用 TypeScript 确保类型安全
- 遵循 React Hooks 最佳实践
- 保持 Three.js 场景的优化和性能
- 使用响应式设计确保多设备兼容