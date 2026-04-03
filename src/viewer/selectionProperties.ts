import {
    buildPropertyGroupsFromRecord,
    createPropertyEntries,
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

    return groups;
}
