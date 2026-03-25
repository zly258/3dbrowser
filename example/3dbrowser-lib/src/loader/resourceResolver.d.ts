export interface ResourceResolver {
    resolve: (url: string) => string;
    dispose: () => void;
    has: (url: string) => boolean;
}
export declare function createResourceResolver(files: (File | string)[]): ResourceResolver | null;
