import * as THREE from "three";
import type { PropertyGroups } from "./propertyIndex";
import type { SceneManager } from "../utils/SceneManager";

export interface SelectionSummaryMetric {
    key: string;
    value: string;
}

export interface SelectionSummary {
    mode: "single" | "multi";
    title: string;
    subtitle?: string;
    metrics: SelectionSummaryMetric[];
}

const stringifyTypeDistribution = (counts: Map<string, number>) =>
    Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([type, count]) => `${type} x${count}`)
        .join(", ");

const findGroupValue = (groups: PropertyGroups | null, keys: string[]) => {
    if (!groups) return "";
    const normalizedKeys = keys.map((key) => key.toLowerCase());
    for (const group of groups) {
        for (const item of group.items) {
            if (normalizedKeys.includes(item.key.toLowerCase())) {
                return item.value;
            }
        }
    }
    return "";
};

const findNodePath = (nodes: any[], uuid: string, trail: any[] = []): any[] | null => {
    for (const node of nodes || []) {
        const nextTrail = [...trail, node];
        if (node?.uuid === uuid || node?.id === uuid) return nextTrail;
        if (Array.isArray(node?.children) && node.children.length > 0) {
            const childPath = findNodePath(node.children, uuid, nextTrail);
            if (childPath) return childPath;
        }
    }
    return null;
};

const findSummaryTarget = (sceneManager: SceneManager, treeRoot: any[], uuid: string) => {
    const object = sceneManager.contentGroup.getObjectByProperty("uuid", uuid);
    const nodePath = findNodePath(treeRoot, uuid);
    const node = nodePath?.[nodePath.length - 1] || null;
    const modelRoot = nodePath?.[0] || null;
    const parentNode = nodePath && nodePath.length > 1 ? nodePath[nodePath.length - 2] : null;
    return { object, node, modelRoot, parentNode };
};

export function buildSelectionSummary(args: {
    sceneManager: SceneManager | null;
    treeRoot: any[];
    selectedUuids: string[];
    selectedProps: PropertyGroups | null;
    t: (key: string) => string;
}): SelectionSummary | null {
    const { sceneManager, treeRoot, selectedUuids, selectedProps, t } = args;
    if (!sceneManager || selectedUuids.length === 0) return null;

    if (selectedUuids.length === 1) {
        const uuid = selectedUuids[0];
        const { object, node, modelRoot, parentNode } = findSummaryTarget(sceneManager, treeRoot, uuid);
        const name =
            findGroupValue(selectedProps, [t("prop_name"), "名称", "Name"])
            || object?.name
            || object?.userData?.name
            || node?.name
            || uuid;
        const type =
            findGroupValue(selectedProps, [t("prop_type"), "类型", "Type"])
            || object?.type
            || node?.type
            || "Object";
        const modelName = modelRoot?.name || object?.userData?.modelName || object?.userData?.rootName || "-";
        const parentName = parentNode?.name || object?.parent?.name || "-";
        const visible = object ? object.visible !== false : node?.visible !== false;
        const childrenCount = Array.isArray(node?.children)
            ? node.children.length
            : Array.isArray((object as any)?.children)
                ? (object as any).children.length
                : 0;
        const bounds = sceneManager.getBoundsForObject(uuid);
        const size = bounds?.getSize(new THREE.Vector3());
        const geometryData = sceneManager.getObjectGeometryData(uuid);

        const metrics: SelectionSummaryMetric[] = [
            { key: t("prop_name") || "名称", value: String(name) },
            { key: t("prop_type") || "类型", value: String(type) },
            { key: t("prop_id") || "ID", value: sceneManager.getBimIdByUuid(uuid) || uuid },
            { key: t("tb_model") || "模型", value: modelName },
            { key: t("summary_parent") || "父级", value: parentName },
            { key: t("summary_children") || "子节点", value: String(childrenCount) },
            { key: t("summary_visible") || "可见", value: visible ? (t("summary_yes") || "是") : (t("summary_no") || "否") }
        ];

        if (size) {
            metrics.push({
                key: t("prop_dim") || "尺寸",
                value: `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`
            });
        }
        if (geometryData.area > 0) {
            metrics.push({ key: t("prop_area") || "面积", value: geometryData.area.toFixed(3) });
        }
        if (geometryData.volume > 0) {
            metrics.push({ key: t("prop_volume") || "体积", value: geometryData.volume.toFixed(3) });
        }

        return {
            mode: "single",
            title: String(name),
            subtitle: `${t("prop_type") || "类型"}: ${type}`,
            metrics
        };
    }

    const modelNames = new Set<string>();
    const typeCounts = new Map<string, number>();
    let totalArea = 0;
    let totalVolume = 0;
    const bounds = sceneManager.collectBoundsForUuids(selectedUuids);
    const size = bounds.isEmpty() ? null : bounds.getSize(new THREE.Vector3());

    selectedUuids.forEach((uuid) => {
        const { object, node, modelRoot } = findSummaryTarget(sceneManager, treeRoot, uuid);
        const type = String(object?.type || node?.type || "Object");
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
        if (modelRoot?.name) modelNames.add(String(modelRoot.name));
        const geometryData = sceneManager.getObjectGeometryData(uuid);
        totalArea += geometryData.area;
        totalVolume += geometryData.volume;
    });

    const metrics: SelectionSummaryMetric[] = [
        { key: t("selected_count") || "已选择", value: String(selectedUuids.length) },
        { key: t("summary_models") || "模型数", value: String(modelNames.size || 1) },
        { key: t("summary_types") || "类型分布", value: stringifyTypeDistribution(typeCounts) || "-" }
    ];

    if (size) {
        metrics.push({
            key: t("summary_bounds") || "总体包围盒",
            value: `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`
        });
    }
    if (totalArea > 0) {
        metrics.push({ key: t("summary_total_area") || "总面积", value: totalArea.toFixed(3) });
    }
    if (totalVolume > 0) {
        metrics.push({ key: t("summary_total_volume") || "总体积", value: totalVolume.toFixed(3) });
    }

    return {
        mode: "multi",
        title: `${selectedUuids.length} ${t("selected_count") || "已选择"}`,
        subtitle: modelNames.size > 0 ? Array.from(modelNames).slice(0, 3).join(", ") : undefined,
        metrics
    };
}
