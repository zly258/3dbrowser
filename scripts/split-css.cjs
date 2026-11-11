/**
 * 已废弃：早期把单文件 CSS 拆分为 src/styles/*.css 的一次性脚本。
 *
 * 现在的样式层是手写的模块化文件（variables/reset/layout/toolbar/panel/
 * statusBar/tabs/canvas/overlays/search/components），令牌唯一来源是
 * variables.css。本脚本会覆盖这些文件，因此不再执行任何写入。
 *
 * 如需拆分新的单文件样式，请手动在 src/styles 下新建文件并在 index.css
 * 中按顺序追加 @import。
 */
console.log('[split-css] 已废弃：样式层已是模块化手写文件，脚本不做任何写入。');
process.exit(0);
