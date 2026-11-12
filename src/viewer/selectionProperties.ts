import {
    buildPropertyGroupsFromRecord,
    createPropertyEntries,
    type PropertyEntry,
    type PropertyGroup,
    type PropertyGroupInput,
    type PropertyGroups
} from "./propertyIndex";

interface BuildSelectedPropertyGroupsArgs {
    basicLabel: string;
    geoLabel: string;
    basicProps: Record<string, string>;
    geoProps: Record<string, string>;
    ifcProps?: Record<string, PropertyGroupInput> | null;
    nbimProps?: PropertyGroupInput | null;
    nbimLabel?: string;
}

/**
 * 合并同名属性分组并去重条目。
 * NBIM 属性文档自带“基本信息”分组，与面板的基础信息分组同名；不合并会触发 React
 * 重复 key（同一组件树里出现两个同名分组），也可能让同名条目重复堆叠。
 */
export function mergePropertyGroupsByName(groups: PropertyGroups): PropertyGroups {
    const order: string[] = [];
    const byName = new Map<string, PropertyGroup>();
    const usedIds = new Set<string>();

    const pushItem = (target: PropertyGroup, item: PropertyEntry) => {
        let id = item.id;
        if (!id || usedIds.has(id)) {
            let suffix = 2;
            const base = id || `${item.group}::${item.key}`;
            while (usedIds.has(`${base}#${suffix}`)) suffix++;
            id = `${base}#${suffix}`;
        }
        usedIds.add(id);
        target.items.push(id === item.id ? item : { ...item, id });
    };

    groups.forEach((group) => {
        if (!group.items.length) return;
        let target = byName.get(group.name);
        if (!target) {
            target = { name: group.name, items: [] };
            byName.set(group.name, target);
            order.push(group.name);
        }
        const existingKeys = new Set(target.items.map((item) => `${item.normalizedKey}\u0000${item.normalizedValue}`));
        group.items.forEach((item) => {
            const key = `${item.normalizedKey}\u0000${item.normalizedValue}`;
            if (existingKeys.has(key)) return;
            existingKeys.add(key);
            pushItem(target, item);
        });
    });

    return order.map((name) => byName.get(name)!);
}

export function buildSelectedPropertyGroups({
    basicLabel,
    geoLabel,
    basicProps,
    geoProps,
    ifcProps,
    nbimProps,
    nbimLabel = "BIM 属性"
}: BuildSelectedPropertyGroupsArgs): PropertyGroups {
    const groups: PropertyGroups = [
        {
            name: basicLabel,
            items: createPropertyEntries(basicLabel, basicProps, "basic")
        },
        {
            name: geoLabel,
            items: createPropertyEntries(geoLabel, geoProps, "geometry")
        }
    ];

    if (ifcProps) {
        groups.push(...buildPropertyGroupsFromRecord(ifcProps, "ifc"));
    }

    if (nbimProps) {
        groups.push({
            name: nbimLabel,
            items: createPropertyEntries(nbimLabel, nbimProps, "nbim")
        });
    }

    return mergePropertyGroupsByName(groups);
}
