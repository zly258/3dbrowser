declare const __APP_VERSION__: string;

/** Vite 的 `?url` 资源导入：返回资源 URL 字符串。 */
declare module "*?url" {
    const url: string;
    export default url;
}
