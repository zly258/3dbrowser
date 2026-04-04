export function stripFileExtension(name: string) {
    return name.replace(/\.[^./\\]+$/, "");
}

export function sanitizeFileStem(name: string) {
    const sanitized = name
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\s+/g, " ")
        .trim();
    return sanitized || "model";
}
