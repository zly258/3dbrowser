interface BoxSelectState {
    active: boolean;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    rectElement: HTMLDivElement | null;
}

interface BoxSelectResult {
    state: BoxSelectState;
    needsRender: boolean;
}

function ensureRectElement(state: BoxSelectState) {
    if (state.rectElement) return state.rectElement;

    const rectElement = document.createElement("div");
    rectElement.style.cssText = `
        position: fixed; border: 1px dashed #00aaff;
        background: rgba(0, 170, 255, 0.08); pointer-events: none; z-index: 1000;
    `;
    document.body.appendChild(rectElement);
    state.rectElement = rectElement;
    return rectElement;
}

function updateRectElement(state: BoxSelectState) {
    const rectElement = ensureRectElement(state);
    rectElement.style.left = `${Math.min(state.startX, state.endX)}px`;
    rectElement.style.top = `${Math.min(state.startY, state.endY)}px`;
    rectElement.style.width = `${Math.abs(state.endX - state.startX)}px`;
    rectElement.style.height = `${Math.abs(state.endY - state.startY)}px`;
}

export function createInitialBoxSelectState(): BoxSelectState {
    return {
        active: false,
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0,
        rectElement: null
    };
}

export function applyStartBoxSelect(
    prevState: BoxSelectState,
    clientX: number,
    clientY: number
): BoxSelectResult {
    const state: BoxSelectState = {
        ...prevState,
        active: true,
        startX: clientX,
        startY: clientY,
        endX: clientX,
        endY: clientY
    };
    updateRectElement(state);
    return { state, needsRender: true };
}

export function applyUpdateBoxSelect(
    prevState: BoxSelectState,
    clientX: number,
    clientY: number
): BoxSelectResult {
    if (!prevState.active) {
        return { state: prevState, needsRender: false };
    }

    const state: BoxSelectState = {
        ...prevState,
        endX: clientX,
        endY: clientY
    };
    updateRectElement(state);
    return { state, needsRender: true };
}

export function applyCancelBoxSelect(prevState: BoxSelectState): BoxSelectResult {
    if (prevState.rectElement) {
        prevState.rectElement.remove();
    }

    return {
        state: {
            ...prevState,
            active: false,
            rectElement: null
        },
        needsRender: true
    };
}

export function applyEndBoxSelect(
    prevState: BoxSelectState,
    canvas: HTMLCanvasElement,
    selectByScreenRect: (x1: number, y1: number, x2: number, y2: number) => string[]
): { state: BoxSelectState; selected: string[]; needsRender: boolean } {
    if (!prevState.active) {
        return {
            state: prevState,
            selected: [],
            needsRender: false
        };
    }

    const { state, needsRender } = applyCancelBoxSelect(prevState);
    const { startX, startY, endX, endY } = prevState;
    const dx = Math.abs(endX - startX);
    const dy = Math.abs(endY - startY);
    if (dx < 5 || dy < 5) {
        return { state, selected: [], needsRender };
    }

    const rect = canvas.getBoundingClientRect();
    const x1 = (Math.min(startX, endX) - rect.left) / rect.width * 2 - 1;
    const y1 = -(Math.max(startY, endY) - rect.top) / rect.height * 2 + 1;
    const x2 = (Math.max(startX, endX) - rect.left) / rect.width * 2 - 1;
    const y2 = -(Math.min(startY, endY) - rect.top) / rect.height * 2 + 1;

    return {
        state,
        selected: selectByScreenRect(x1, y1, x2, y2),
        needsRender
    };
}

