export interface PropertyEntry {
    id: string;
    group: string;
    key: string;
    value: string;
    path: string;
    source?: string;
    rawKey?: string;
    normalizedGroup: string;
    normalizedKey: string;
    normalizedPath: string;
    normalizedValue: string;
}

export interface PropertyListItemInput {
    key: string;
    value: unknown;
    id?: string;
    rawKey?: string;
    source?: string;
}

export interface PropertyGroup {
    name: string;
    items: PropertyEntry[];
}

export type PropertyGroups = PropertyGroup[];

export type PropertyGroupInput = Record<string, unknown> | PropertyListItemInput[];

export function normalizePropertyToken(value: unknown): string {
    return String(value ?? "")
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, " ")
        .toLocaleLowerCase();
}

export function stringifyPropertyValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map((item) => stringifyPropertyValue(item)).filter(Boolean).join(", ");
    if (typeof value === "object") {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}

function toListItems(input: PropertyGroupInput): PropertyListItemInput[] {
    if (Array.isArray(input)) return input;
    return Object.entries(input).map(([key, value]) => ({ key, value }));
}

export function createPropertyEntries(groupName: string, input: PropertyGroupInput, fallbackSource?: string): PropertyEntry[] {
    return toListItems(input)
        .map((item, index) => {
            const key = String(item.key ?? "").trim();
            const value = stringifyPropertyValue(item.value);
            if (!key || !value) return null;
            const path = `${groupName}.${key}`;
            return {
                id: item.id || `${groupName}::${key}::${index}`,
                group: groupName,
                key,
                value,
                path,
                rawKey: item.rawKey,
                source: item.source || fallbackSource,
                normalizedGroup: normalizePropertyToken(groupName),
                normalizedKey: normalizePropertyToken(key),
                normalizedPath: normalizePropertyToken(path),
                normalizedValue: normalizePropertyToken(value)
            } satisfies PropertyEntry;
        })
        .filter(Boolean) as PropertyEntry[];
}

export function buildPropertyGroupsFromRecord(
    groups: Record<string, PropertyGroupInput> | null | undefined,
    fallbackSource?: string
): PropertyGroups {
    if (!groups) return [];
    return Object.entries(groups)
        .map(([groupName, input]) => ({
            name: groupName,
            items: createPropertyEntries(groupName, input, fallbackSource)
        }))
        .filter((group) => group.items.length > 0);
}

export function flattenPropertyGroups(groups: PropertyGroups | null | undefined): PropertyEntry[] {
    if (!groups) return [];
    return groups.flatMap((group) => group.items);
}

export function filterPropertyGroups(groups: PropertyGroups, query: string): PropertyGroups {
    const normalizedQuery = normalizePropertyToken(query);
    if (!normalizedQuery) return groups;

    return groups
        .map((group) => ({
            ...group,
            items: group.items.filter((item) =>
                item.normalizedGroup.includes(normalizedQuery)
                || item.normalizedKey.includes(normalizedQuery)
                || item.normalizedPath.includes(normalizedQuery)
                || item.normalizedValue.includes(normalizedQuery)
            )
        }))
        .filter((group) => group.items.length > 0);
}

export function serializePropertyGroups(groups: PropertyGroups): string {
    return groups
        .map((group) => [`[${group.name}]`, ...group.items.map((item) => `${item.key}: ${item.value}`)].join("\n"))
        .join("\n\n");
}
