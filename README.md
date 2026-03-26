# 3dbrowser Source

`3dbrowser` 组件库源码仓库。

这个仓库只用于维护源码、构建脚本和运行时资源，不作为在线示例站点仓库。

## 仓库职责

- `src/`：核心源码
- `public/libs/`：WASM、解码器与运行时资源
- `scripts/`：辅助脚本
- `dist/`：构建产物

## 发布边界

- 源码仓库：只同步组件库源码，不同步示例站点
- 示例仓库：单独维护示例页面、Pages 工作流和示例产物

## 本地开发

```bash
npm install
npm run build
```

## 运行时资源

业务项目接入时，需要把 `dist/libs` 复制到目标应用静态目录，并通过 `libPath` 指向该路径。

## 说明

如果你要查看演示页面或示例工程，请使用示例仓库，不要把本仓库当成演示仓库。

## License

Free for non-commercial use only. Commercial use is prohibited.
