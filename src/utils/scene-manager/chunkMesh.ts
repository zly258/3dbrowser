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
        geometry.setAttribute("normal", new THREE.BufferAttribute(geometryData.normal, 3));
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
    batchedMesh.frustumCulled = false;
    (batchedMesh as any).perInstanceFrustumCulling = false;

    const geometryIds = geometries.map((geometry) => batchedMesh.addGeometry(geometry));
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const batchIdToUuid = new Map<number, string>();
    const batchIdToBimId = new Map<number, string>();
    const batchIdToColor = new Map<number, number>();
    const batchIdToGeometry = new Map<number, THREE.BufferGeometry>();

    instData.forEach((instance: any) => {
        color.copy(toIndustrialDisplayColor(instance.color));
        matrix.fromArray(instance.matrix);

        const instanceId = batchedMesh.addInstance(geometryIds[instance.geoIdx]);
        batchedMesh.setMatrixAt(instanceId, matrix);
        batchedMesh.setColorAt(instanceId, color);

        const geometry = geometries[instance.geoIdx];
        if (!geometry.boundingBox) {
            geometry.computeBoundingBox();
        }
        if (geometry.boundingBox && (batchedMesh as any).setBoundingBoxAt) {
            (batchedMesh as any).setBoundingBoxAt(instanceId, geometry.boundingBox);
        }

        const bimId = instance.bimId;
        batchIdToUuid.set(instanceId, resolveUuidByBimId(originalUuid, bimId));
        batchIdToBimId.set(instanceId, bimId);
        batchIdToColor.set(instanceId, color.getHex());
        (batchedMesh.userData.batchIdToRawColor ??= new Map<number, number>()).set(instanceId, instance.color);
        batchIdToGeometry.set(instanceId, geometry);
    });

    batchedMesh.userData.batchIdToUuid = batchIdToUuid;
    batchedMesh.userData.batchIdToBimId = batchIdToBimId;
    batchedMesh.userData.batchIdToColor = batchIdToColor;
    batchedMesh.userData.batchIdToGeometry = batchIdToGeometry;
    batchedMesh.computeBoundingBox();
    batchedMesh.computeBoundingSphere();

    return batchedMesh;
}
