import { useSyncExternalStore } from "react";

/**
 * 光标世界坐标的外部订阅源。
 *
 * 为什么不用 `useState`：坐标会随指针移动每帧变化（约 60 次/秒）。放在 `ThreeViewer`
 * 的 state 里，等于每次悬停都重渲染整棵组件树（SceneTree、PropertiesPanel、所有面板、
 * ViewCube、Toolbar）——而它实际只驱动状态栏右边那一个数字读数。
 *
 * 这里把坐标放进模块级订阅源，只有真正读取它的 `StatusBarCoords` 叶子节点会重渲染。
 */
export interface MouseCoords {
    x: number;
    y: number;
    z: number;
}

let current: MouseCoords | null = null;
const listeners = new Set<() => void>();

function emit() {
    for (const listener of listeners) listener();
}

/** 写入坐标。数值未变时直接返回，避免无谓通知。 */
export function setMouseCoords(next: MouseCoords | null) {
    if (current === null && next === null) return;
    if (
        current !== null && next !== null &&
        current.x === next.x && current.y === next.y && current.z === next.z
    ) {
        return;
    }
    current = next;
    emit();
}

function getMouseCoords(): MouseCoords | null {
    return current;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** 订阅光标世界坐标；仅在数值变化时触发所在组件重渲染。 */
export function useMouseCoords(): MouseCoords | null {
    return useSyncExternalStore(subscribe, getMouseCoords, getMouseCoords);
}
