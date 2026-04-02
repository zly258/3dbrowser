export function toggleUuidSelection(current: string[], uuid: string) {
    return current.includes(uuid)
        ? current.filter((id) => id !== uuid)
        : [...current, uuid];
}

export function getLastSelectedUuid(current: string[]) {
    return current.length > 0 ? current[current.length - 1] : null;
}

