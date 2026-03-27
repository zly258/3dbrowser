export type PropertyGroups = Record<string, Record<string, string>>;

interface BuildSelectedPropertyGroupsArgs {
    basicLabel: string;
    geoLabel: string;
    basicProps: Record<string, string>;
    geoProps: Record<string, string>;
    ifcProps?: PropertyGroups | null;
    nbimProps?: Record<string, string> | null;
    nbimLabel?: string;
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
    const groups: PropertyGroups = {
        [basicLabel]: basicProps,
        [geoLabel]: geoProps
    };

    if (ifcProps) {
        Object.assign(groups, ifcProps);
    }

    if (nbimProps) {
        groups[nbimLabel] = nbimProps;
    }

    return groups;
}
