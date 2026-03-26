# 3dbrowser Example

[Live Preview](https://zly258.github.io/3dbrowser/)

这个仓库只用于演示 `3dbrowser` 的页面效果、GitHub Pages 发布和示例集成方式。

## 仓库职责

- 在线演示站点
- GitHub Pages 自动发布
- 示例页面与示例配置
- 本地引用的 `3dbrowser-lib` 演示产物

## 不包含的内容

- 不作为主源码开发仓库
- 不承载组件库完整开发历史
- 不作为源码发布入口

## 本地运行

```bash
npm ci
npm run build
```

## 发布说明

- `main` 分支用于示例站点发布
- `.github/workflows/deploy.yml` 负责 Pages 构建与部署
- `3dbrowser-lib/` 是示例页面引用的本地构建产物

## 关联说明

- 源码仓库：维护组件库源码
- 当前仓库：维护示例和部署

## License

Free for non-commercial use only. Commercial use is prohibited.
