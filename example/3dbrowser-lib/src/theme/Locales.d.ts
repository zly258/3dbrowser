/**
 * 本地化翻译资源
 * 包含中英文双语支持
 */
export type Lang = 'zh' | 'en';
export type TFunc = (key: string) => string;
export type ProgressCallback = (percent: number, msg?: string) => void;
export declare const getTranslation: (lang: Lang, key: string) => string;
