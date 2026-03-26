# 3DBrowser Example

独立示例项目，使用仓库内的编译产物本地库（`file:./3dbrowser-lib`），不依赖远程 npm 版本。

## 本地开发

```bash
npm install
npm run dev
```

## 构建发布

```bash
npm run build
```

- `scripts/prepare-libs.mjs` 会把 `@zhangly1403/3dbrowser` 内的 `libs` 同步到 `public/libs`。
- 页面仅渲染全屏 `ThreeViewer`，不再使用额外外层样式。
