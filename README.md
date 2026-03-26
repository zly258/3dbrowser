# 3DBrowser Example

独立示例项目，直接引用 npm 包 `@zhangly1403/3dbrowser`。

## 本地运行

```bash
npm install
npm run dev
```

## 说明

- `scripts/prepare-libs.mjs` 会把 `node_modules/@zhangly1403/3dbrowser/dist/libs` 同步到 `public/libs`。
- `ThreeViewer` 使用 `libPath="/libs"`。
- 推送到 `main` 后，GitHub Actions 会自动发布到 GitHub Pages。
