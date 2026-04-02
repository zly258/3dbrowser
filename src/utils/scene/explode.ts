import * as THREE from "three";

export function stableExplodeDirection(seed: string, target: THREE.Vector3) {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    const angle = (hash >>> 0) / 0xffffffff * Math.PI * 2;
    const z = (((hash >>> 9) & 0x3ff) / 1023) * 2 - 1;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    target.set(Math.cos(angle) * r, Math.sin(angle) * r, z).normalize();
    return target;
}

