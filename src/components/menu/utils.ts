export function cx(...items: Array<string | false | null | undefined>): string {
    return items.filter(Boolean).join(" ");
}

export function isMenuHidden(hiddenMenus: string[] | undefined, id: string): boolean {
    return (hiddenMenus || []).includes(id);
}
