import * as THREE from "three";

type OptimizedGeometryMapping = {
    mesh: THREE.BatchedMesh;
    instanceId: number;
    originalColor: number;
    geometry?: THREE.BufferGeometry;
};

function resolveWorldMatrix(mesh: THREE.Mesh, instanceId?: number) {
    const matrix = new THREE.Matrix4();
    if (instanceId !== undefined && mesh.isInstancedMesh) {
        (mesh as THREE.InstancedMesh).getMatrixAt(instanceId, matrix);
        return matrix;
    }

    return matrix.copy(mesh.matrixWorld);
}

export function computeGeometryVolume(
    geometry: THREE.BufferGeometry,
    mesh: THREE.Mesh,
    instanceId?: number
) {
    const position = geometry.attributes.position;
    const index = geometry.index;
    const worldMatrix = resolveWorldMatrix(mesh, instanceId);
    const vertexA = new THREE.Vector3();
    const vertexB = new THREE.Vector3();
    const vertexC = new THREE.Vector3();
    const cross = new THREE.Vector3();
    let volume = 0;

    if (index) {
        for (let i = 0; i < index.count; i += 3) {
            vertexA.fromBufferAttribute(position, index.getX(i)).applyMatrix4(worldMatrix);
            vertexB.fromBufferAttribute(position, index.getX(i + 1)).applyMatrix4(worldMatrix);
            vertexC.fromBufferAttribute(position, index.getX(i + 2)).applyMatrix4(worldMatrix);
            volume += vertexA.dot(cross.crossVectors(vertexB, vertexC)) / 6;
        }
    } else {
        for (let i = 0; i < position.count; i += 3) {
            vertexA.fromBufferAttribute(position, i).applyMatrix4(worldMatrix);
            vertexB.fromBufferAttribute(position, i + 1).applyMatrix4(worldMatrix);
            vertexC.fromBufferAttribute(position, i + 2).applyMatrix4(worldMatrix);
            volume += vertexA.dot(cross.crossVectors(vertexB, vertexC)) / 6;
        }
    }

    return Math.abs(volume);
}

export function computeGeometryArea(
    geometry: THREE.BufferGeometry,
    mesh: THREE.Mesh,
    instanceId?: number
) {
    const position = geometry.attributes.position;
    const index = geometry.index;
    const worldMatrix = resolveWorldMatrix(mesh, instanceId);
    const vertexA = new THREE.Vector3();
    const vertexB = new THREE.Vector3();
    const vertexC = new THREE.Vector3();
    const edgeAB = new THREE.Vector3();
    const edgeAC = new THREE.Vector3();
    let area = 0;

    if (index) {
        for (let i = 0; i < index.count; i += 3) {
            vertexA.fromBufferAttribute(position, index.getX(i)).applyMatrix4(worldMatrix);
            vertexB.fromBufferAttribute(position, index.getX(i + 1)).applyMatrix4(worldMatrix);
            vertexC.fromBufferAttribute(position, index.getX(i + 2)).applyMatrix4(worldMatrix);
            area += edgeAB.subVectors(vertexB, vertexA).cross(edgeAC.subVectors(vertexC, vertexA)).length() / 2;
        }
    } else {
        for (let i = 0; i < position.count; i += 3) {
            vertexA.fromBufferAttribute(position, i).applyMatrix4(worldMatrix);
            vertexB.fromBufferAttribute(position, i + 1).applyMatrix4(worldMatrix);
            vertexC.fromBufferAttribute(position, i + 2).applyMatrix4(worldMatrix);
            area += edgeAB.subVectors(vertexB, vertexA).cross(edgeAC.subVectors(vertexC, vertexA)).length() / 2;
        }
    }

    return area;
}

export function getObjectGeometryDataFromScene(options: {
    uuid: string;
    optimizedMapping: Map<string, OptimizedGeometryMapping[]>;
    contentGroup: THREE.Group;
}) {
    const { uuid, optimizedMapping, contentGroup } = options;
    let area = 0;
    let volume = 0;

    const mappings = optimizedMapping.get(uuid);
    if (mappings && mappings.length > 0) {
        mappings.forEach((mapping) => {
            if (!mapping.geometry) return;
            area += computeGeometryArea(mapping.geometry, mapping.mesh, mapping.instanceId);
            volume += computeGeometryVolume(mapping.geometry, mapping.mesh, mapping.instanceId);
        });
        return { area, volume };
    }

    const object = contentGroup.getObjectByProperty("uuid", uuid);
    if (object && (object as THREE.Mesh).isMesh) {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) {
            area = computeGeometryArea(mesh.geometry, mesh);
            volume = computeGeometryVolume(mesh.geometry, mesh);
        }
    }

    return { area, volume };
}

