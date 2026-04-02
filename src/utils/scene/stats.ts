import * as THREE from "three";

export function estimateTextureMemoryMb(root: THREE.Object3D) {
    let textureMemory = 0;
    const textures = new Set<THREE.Texture>();

    root.traverse((obj) => {
        if (obj.name === "__EdgesHelper") return;
        if (!(obj as THREE.Mesh).isMesh && !(obj as any).isBatchedMesh) return;

        const mesh = obj as any;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material: any) => {
            if (!material) return;
            Object.values(material).forEach((value) => {
                if (!(value instanceof THREE.Texture) || textures.has(value)) return;
                textures.add(value);
                const image = (value as any).image;
                const width = image?.width || 0;
                const height = image?.height || 0;
                if (width > 0 && height > 0) {
                    textureMemory += (width * height * 4) / (1024 * 1024);
                }
            });
        });
    });

    return parseFloat(textureMemory.toFixed(2));
}

