import * as THREE from "three";
import { applyIndustrialMaterialStyle, toIndustrialDisplayColor } from "./renderStyle";

export function reconstructBatchedMeshFromWorkerData(options: {
    data: any;
    material: THREE.Material;
    resolveUuidByBimId: (originalUuid: string, bimId: string) => string;
}) {
    const { data, material, resolveUuidByBimId } = options;
    const { geometries: geoData, instances: instData, originalUuid } = data;

    const hasAnyIndex = geoData.some((geometry: any) => geometry.index && geometry.index.length > 0);

    const geometries: THREE.BufferGeometry[] = geoData.map((geometryData: any) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(geometryData.position, 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(geometryData.normal, 3, true));
        if (geometryData.index && geometryData.index.length > 0) {
            geometry.setIndex(new THREE.BufferAttribute(geometryData.index, 1));
        } else if (hasAnyIndex) {
            const count = geometryData.position.length / 3;
            const index = new Uint32Array(count);
            for (let i = 0; i < count; i++) {
                index[i] = i;
            }
            geometry.setIndex(new THREE.BufferAttribute(index, 1));
        }
        // worker 已算好局部包围盒：写入 BufferGeometry，BatchedMesh 会复制，
        // 首次框选/高亮/逐实例剔除就不必再扫一遍顶点。
        if (geometryData.box && geometryData.box.length >= 6) {
            const box = geometryData.box;
            geometry.boundingBox = new THREE.Box3(
                new THREE.Vector3(box[0], box[1], box[2]),
                new THREE.Vector3(box[3], box[4], box[5])
            );
            const center = geometry.boundingBox.getCenter(new THREE.Vector3());
            const radius = geometry.boundingBox.getSize(new THREE.Vector3()).length() * 0.5;
            geometry.boundingSphere = new THREE.Sphere(center, radius);
        }
        return geometry;
    });

    let totalVerts = 0;
    let totalIndices = 0;
    geometries.forEach((geometry) => {
        totalVerts += geometry.attributes.position.count;
        if (geometry.index) {
            totalIndices += geometry.index.count;
        }
    });

    applyIndustrialMaterialStyle(material);
    const batchedMesh = new THREE.BatchedMesh(instData.length, totalVerts, totalIndices, material);
    // 分块级剔除由 SceneManager + 设置控制；逐实例剔除保持 three 默认开启
    // （实测开启 470–583ms/帧，关闭反而 822–1014ms）。
    batchedMesh.frustumCulled = false;

    const geometryIds = geometries.map((geometry) => batchedMesh.addGeometry(geometry));
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const batchIdToUuid = new Map<number, string>();

    // 旧版 three 没有 getGeometryRangeAt 时无法按需切视图，只能保留源几何引用；
    // r181 纯属兜底分支，正常不会走到。
    const canBuildViews = typeof (batchedMesh as any).getGeometryRangeAt === "function";
    const legacyGeometryById = canBuildViews ? null : new Map<number, THREE.BufferGeometry>();

    instData.forEach((instance: any) => {
        color.copy(toIndustrialDisplayColor(instance.color));
        matrix.fromArray(instance.matrix);

        const instanceId = batchedMesh.addInstance(geometryIds[instance.geoIdx]);
        batchedMesh.setMatrixAt(instanceId, matrix);
        batchedMesh.setColorAt(instanceId, color);

        batchIdToUuid.set(instanceId, resolveUuidByBimId(originalUuid, instance.bimId));
        if (legacyGeometryById) legacyGeometryById.set(instanceId, geometries[instance.geoIdx]);
    });

    batchedMesh.userData.batchIdToUuid = batchIdToUuid;
    if (legacyGeometryById) {
        batchedMesh.userData.batchIdToGeometry = legacyGeometryById;
    }
    batchedMesh.computeBoundingBox();
    batchedMesh.computeBoundingSphere();

    if (canBuildViews) {
        // 合并缓冲已持有一份几何；逐实例视图由 batchedGeometryView 按需构建，
        // worker 源数组不再被引用，交给 GC 回收（全模型约 916MB）。
        geometries.forEach((geometry) => {
            geometry.dispose();
        });
        geometries.length = 0;
    }

    return batchedMesh;
}