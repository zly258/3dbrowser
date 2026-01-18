# 3DBrowser Example

这是一个基于 `@zhangly1403/3dbrowser` 构建的 3D 模型浏览器示例，支持 **在线模式** 和 **本地模式**。

## 功能特性

- **在线模式**：通过预定义的文件列表，从服务器（或 `example/public`）加载 3D 模型。
- **本地模式**：支持将本地文件（GLB, FBX, IFC, NBIM, LMB 等）拖拽至浏览器直接查看。
- **多格式支持**：内置支持多种工业和通用 3D 格式。
- **UI 自定义**：在线模式下自动隐藏了“打开文件”等相关菜单，提供更纯粹的浏览体验。

## 本地开发

1. 安装依赖：
   ```bash
   npm install
   ```

2. 启动示例开发服务器：
   ```bash
   npm run dev:example
   ```

3. 访问 `http://localhost:5173/example/index.html`。

## 部署到 GitHub Pages

部署静态网站到 GitHub Pages 最简单方便的方式是使用 GitHub Actions 自动构建和部署。

### 步骤 1: 准备模型文件

将您想要在线展示的模型文件放入 `example/public` 目录中。

### 步骤 2: 修改 Vite 配置 (可选)

确保 `vite.config.ts` 中的 `base` 设置正确。如果您部署在 `https://<username>.github.io/<repo>/`，则 `base` 应设置为 `./` 或 `/<repo>/`。本项目目前配置为 `base: './'`，这通常适用于大多数部署场景。

### 步骤 3: 使用 GitHub Actions 自动部署

本项目已内置了 GitHub Actions 配置文件 `.github/workflows/deploy.yml`。

1. 推送代码到 GitHub 的 `main` 分支。
2. 在仓库设置中（Settings -> Pages）将 "Build and deployment" 的 "Source" 设置为 "GitHub Actions"。
3. 每次推送代码后，它会自动运行 `npm run build:example` 并将结果部署到 GitHub Pages。

### 手动构建

如果您想手动构建并上传到其他静态空间：

```bash
npm run build:example
```

构建结果将生成在 `dist-example` 目录下。

## 在线映射说明

在 `example/App.tsx` 中，您可以通过修改 `onlineModels` 数组来增加或减少在线可用的模型：

```typescript
const onlineModels = [
    { id: '1', name: '我的模型', url: './public/my_model.glb', format: 'glb' },
    // ...
];
```

注意：模型文件必须放置在 `example/public` 目录下，或者使用完整的外部 URL。
