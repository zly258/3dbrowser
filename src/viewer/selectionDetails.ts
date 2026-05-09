import * as THREE from "three";
import { buildSelectedPropertyGroups } from "./selectionProperties";
import { createPropertyEntries, type PropertyGroupInput, type PropertyGroups } from "./propertyIndex";
import type { SceneManager, StructureTreeNode } from "../utils/scene-manager/SceneManager";

export interface ClashSummaryRecord {
    total: number;
    newCount: number;
    confirmedCount: number;
    resolvedCount: number;
    worstStatus: "new" | "confirmed" | "resolved";
}

export function resolveSelectionTarget(
    sceneManager: SceneManager,
    selectionObject: any,
    focusUuid: string
): THREE.Object3D | StructureTreeNode | any {
    let realObject = focusUuid === (selectionObject?.uuid || selectionObject?.id) && selectionObject instanceof THREE.Object3D
        ? selectionObject
        : sceneManager.contentGroup.getObjectByProperty("uuid", focusUuid);

    if (!realObject) {
        const nodes = sceneManager.getStructureNodes(focusUuid);
        if (nodes && nodes.length > 0) {
            realObject = nodes[0] as any;
        }
    }

    return realObject || selectionObject;
}

export function resolveTargetElevation(target: any) {
    if (typeof target?.userData?.ifcMetadata?.elevation === "number") {
        return target.userData.ifcMetadata.elevation;
    }

    if (!(target instanceof THREE.Object3D)) return undefined;

    let cursor: THREE.Object3D | null = target;
    while (cursor) {
        const elevation = cursor.userData?.ifcMetadata?.elevation;
        if (typeof elevation === "number" && Number.isFinite(elevation)) {
            return elevation;
        }
        cursor = cursor.parent;
    }

    return undefined;
}

export async function fetchIfcGroups(
    target: any,
    cache: Map<string, Record<string, PropertyGroupInput>>,
): Promise<Record<string, PropertyGroupInput> | null> {
    const resolveIfcContext = (candidate: any) => {
        let cursor = candidate instanceof THREE.Object3D ? candidate : null;
        let expressID: number | undefined = candidate?.userData?.expressID;

        while (cursor) {
            if (cursor.userData?.expressID !== undefined && expressID === undefined) {
                expressID = cursor.userData.expressID;
            }
            if (cursor.userData?.ifcManager && cursor.userData?.modelID !== undefined) {
                return {
                    ifcRoot: cursor,
                    expressID
                };
            }
            cursor = cursor.parent;
        }

        return null;
    };

    const ifcContext = resolveIfcContext(target);
    if (!ifcContext?.ifcRoot || ifcContext.expressID === undefined) return null;

    try {
        const cacheKey = `${ifcContext.ifcRoot.userData.modelID}:${ifcContext.expressID}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        const ifcManager = ifcContext.ifcRoot.userData.ifcManager;
        const ifcProps = await ifcManager.getItemProperties(ifcContext.ifcRoot.userData.modelID, ifcContext.expressID);
        const groups = ifcProps?.rawGroups || ifcProps?.groups || ifcProps?.normalizedGroups || null;
        if (groups) {
            cache.set(cacheKey, groups);
        }
        return groups;
    } catch (error) {
        console.error("IFC Props Error", error);
        return null;
    }
}


function buildPropertyGroupsFromRows(rows: Array<{ group?: string; key?: string; value?: unknown; rawKey?: string; source?: string; path?: string }> | null | undefined): Record<string, PropertyGroupInput> | null {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const grouped: Record<string, any[]> = {};
    rows.forEach((row, index) => {
        const group = String(row.group || "NBIM").trim();
        const key = String(row.key || "").trim();
        if (!group || !key) return;
        if (!grouped[group]) grouped[group] = [];
        grouped[group].push({
            key,
            value: row.value,
            rawKey: row.rawKey,
            source: row.source || "property-index",
            id: `property-index::${row.path || `${group}.${key}`}::${index}`
        });
    });
    return Object.keys(grouped).length > 0 ? grouped : null;
}

interface BuildSelectionPropertyGroupsArgs {
    sceneManager: SceneManager;
    focusUuid: string;
    target: any;
    t: (key: string) => string;
    ifcGroups: Record<string, PropertyGroupInput> | null;
    clashSummary?: ClashSummaryRecord;
    isDev?: boolean;
}

export function buildSelectionPropertyGroups({
    sceneManager,
    focusUuid,
    target,
    t,
    ifcGroups,
    clashSummary,
    isDev = false
}: BuildSelectionPropertyGroupsArgs): PropertyGroups {
    const basicProps: Record<string, string> = {};
    const geoProps: Record<string, string> = {};
    const targetElevation = resolveTargetElevation(target);
    const resolvedName = [target?.name, target?.userData?.name]
        .find((value) => typeof value === "string" && value.trim().length > 0);

    const wrappedId = sceneManager.getBimIdByUuid(focusUuid) || focusUuid;
    if (resolvedName) {
        basicProps[t("prop_name")] = resolvedName;
    }
    basicProps[t("prop_id")] = wrappedId;
    basicProps[t("prop_type")] = target.type || (target.children ? "Group" : "Mesh");
    if (typeof targetElevation === "number" && Number.isFinite(targetElevation)) {
        basicProps[t("prop_storey_elevation")] = String(targetElevation);
    }

    if (target.getWorldPosition) {
        const worldPosition = new THREE.Vector3();
        target.getWorldPosition(worldPosition);
        geoProps[t("prop_pos")] = `${worldPosition.x.toFixed(2)}, ${worldPosition.y.toFixed(2)}, ${worldPosition.z.toFixed(2)}`;
    }

    if (target.isMesh || target.type === "Mesh") {
        if (target instanceof THREE.Mesh) {
            const box = new THREE.Box3().setFromObject(target);
            const size = new THREE.Vector3();
            box.getSize(size);
            geoProps[t("prop_dim")] = `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;

            if (target.geometry) {
                geoProps[t("prop_vert")] = (target.geometry.attributes.position?.count || 0).toLocaleString();
                geoProps[t("prop_tri")] = target.geometry.index
                    ? (target.geometry.index.count / 3).toLocaleString()
                    : ((target.geometry.attributes.position?.count || 0) / 3).toLocaleString();
            }
        } else if (target.userData?.boundingBox) {
            const size = new THREE.Vector3();
            target.userData.boundingBox.getSize(size);
            geoProps[t("prop_dim")] = `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;
        }

        if (target.isInstancedMesh) {
            geoProps[t("prop_inst")] = target.count.toLocaleString();
        }

        const geometryData = sceneManager.getObjectGeometryData(focusUuid);
        if (geometryData.area > 0) {
            geoProps[t("prop_area")] = geometryData.area.toFixed(3);
        }
        if (geometryData.volume > 0) {
            geoProps[t("prop_volume")] = geometryData.volume.toFixed(3);
        }
    } else if (target.userData?.boundingBox) {
        const size = new THREE.Vector3();
        target.userData.boundingBox.getSize(size);
        geoProps[t("prop_dim")] = `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;
    }

    const searchDoc = sceneManager.getNbimPropertySearchDocument(focusUuid);
    const indexedGroups = buildPropertyGroupsFromRows(searchDoc?.rows);
    const nbimProps = sceneManager.getNbimProperties(focusUuid);
    const nbimIfcGroups = sceneManager.getNbimIfcPropertyGroups(focusUuid, "raw");

    if (isDev && nbimProps && Object.keys(nbimProps).length > 0) {
        console.group(`NBIM 选中属性: ${focusUuid}`);
        console.log(nbimProps);
        console.log(JSON.stringify(nbimProps, null, 2));
        console.groupEnd();
    }

    if (isDev && nbimIfcGroups) {
        console.group(`NBIM IFC 组属性: ${focusUuid}`);
        console.log(nbimIfcGroups);
        console.log(JSON.stringify(nbimIfcGroups, null, 2));
        console.groupEnd();
    }

    const groups = buildSelectedPropertyGroups({
        basicLabel: t("pg_basic"),
        geoLabel: t("pg_geo"),
        basicProps,
        geoProps,
        ifcProps: ifcGroups || indexedGroups || nbimIfcGroups || null,
        nbimProps: null
    });

    if (clashSummary) {
        const clashLabel = t("pg_clash");
        groups.push({
            name: clashLabel,
            items: createPropertyEntries(clashLabel, [
                { key: t("clash_group_all"), value: String(clashSummary.total) },
                { key: t("clash_group_new"), value: String(clashSummary.newCount) },
                { key: t("clash_group_confirmed"), value: String(clashSummary.confirmedCount) },
                { key: t("clash_group_resolved"), value: String(clashSummary.resolvedCount) },
                { key: t("prop_status"), value: t(`clash_group_${clashSummary.worstStatus}`) }
            ].map((item, index) => ({ ...item, id: `clash-summary::${index}` })))
        });
    }

    return groups;
}
