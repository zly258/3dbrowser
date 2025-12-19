import * as THREE from "three";

// 八叉树项接口
interface OctreeItem {
  id: string; // 几何体_uuid + 材质_uuid
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrix: THREE.Matrix4; // 世界矩阵
  center: THREE.Vector3;
}

interface OctreeNode {
  bounds: THREE.Box3;
  children: OctreeNode[] | null;
  items: OctreeItem[];
  level: number;
}

interface OctreeConfig {
  maxItemsPerNode: number;
  maxDepth: number;
}

/**
 * 计算几何体的内存占用大小（以MB为单位）
 */
export function calculateGeometryMemory(geometry: THREE.BufferGeometry): number {
  let bytes = 0;
  if (geometry.attributes) {
    for (const name in geometry.attributes) {
      const attr = geometry.attributes[name];
      if (attr.array) {
        bytes += attr.array.byteLength;
      }
    }
  }
  if (geometry.index && geometry.index.array) {
    bytes += geometry.index.array.byteLength;
  }
  return bytes / (1024 * 1024);
}

/**
 * 从根对象收集所有可渲染项
 * @param root 根对象
 * @returns 可渲染项数组
 */
function collectItems(root: THREE.Object3D): OctreeItem[] {
  const items: OctreeItem[] = [];
  const _v3 = new THREE.Vector3();
  const _m4 = new THREE.Matrix4();

  // 根对象可能已居中（应用了偏移），所以updateMatrixWorld确保
  // 我们捕获视觉状态（在原点居中）。
  // 这对GLB精度有好处。
  root.updateMatrixWorld(true);

  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const geometry = mesh.geometry;
      const material = mesh.material;
      
      if (!geometry) return;

      const matUuid = Array.isArray(material) ? material[0]?.uuid : material?.uuid;
      const id = `${geometry.uuid}_${matUuid}`;

      if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
        const instancedMesh = mesh as THREE.InstancedMesh;
        for (let i = 0; i < instancedMesh.count; i++) {
          instancedMesh.getMatrixAt(i, _m4);
          _m4.premultiply(instancedMesh.matrixWorld);
          _v3.setFromMatrixPosition(_m4);
          items.push({
            id,
            geometry,
            material: material as THREE.Material,
            matrix: _m4.clone(),
            center: _v3.clone()
          });
        }
      } else {
        _m4.copy(mesh.matrixWorld);
        _v3.setFromMatrixPosition(_m4);
        items.push({
            id,
            geometry,
            material: material as THREE.Material,
            matrix: _m4.clone(),
            center: _v3.clone()
        });
      }
    }
  });

  return items;
}

/**
 * 构建八叉树
 * @param items 可渲染项数组
 * @param bounds 边界框
 * @param config 八叉树配置
 * @param level 当前层级
 * @returns 八叉树节点
 */
function buildOctree(items: OctreeItem[], bounds: THREE.Box3, config: OctreeConfig, level = 0): OctreeNode {
  if (items.length <= config.maxItemsPerNode || level >= config.maxDepth) {
    return { bounds: bounds.clone(), children: null, items, level };
  }

  const center = bounds.getCenter(new THREE.Vector3());
  const min = bounds.min;
  const max = bounds.max;
  const childrenBounds: THREE.Box3[] = [];

  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      for (let k = 0; k < 2; k++) {
        const bMin = new THREE.Vector3(
          i === 0 ? min.x : center.x,
          j === 0 ? min.y : center.y,
          k === 0 ? min.z : center.z
        );
        const bMax = new THREE.Vector3(
          i === 0 ? center.x : max.x,
          j === 0 ? center.y : max.y,
          k === 0 ? center.z : max.z
        );
        childrenBounds.push(new THREE.Box3(bMin, bMax));
      }
    }
  }

  const childrenItems: OctreeItem[][] = Array(8).fill(null).map(() => []);

  for (const item of items) {
    let found = false;
    for (let i = 0; i < 8; i++) {
      if (childrenBounds[i].containsPoint(item.center)) {
        childrenItems[i].push(item);
        found = true;
        break;
      }
    }
    if (!found) childrenItems[0].push(item);
  }

  const children: OctreeNode[] = [];
  let hasChildren = false;
  for (let i = 0; i < 8; i++) {
    if (childrenItems[i].length > 0) {
      children.push(buildOctree(childrenItems[i], childrenBounds[i], config, level + 1));
      hasChildren = true;
    }
  }

  if (!hasChildren) {
    return { bounds: bounds.clone(), children: null, items, level };
  }

  return { bounds: bounds.clone(), children, items: [], level };
}

/**
 * 从项数组创建场景
 * @param items 可渲染项数组
 * @returns 创建的场景
 */
function createSceneFromItems(items: OctreeItem[]): THREE.Scene {
  const scene = new THREE.Scene();
  const groups = new Map<string, OctreeItem[]>();
  
  for (const item of items) {
    if (!groups.has(item.id)) {
      groups.set(item.id, []);
    }
    groups.get(item.id)!.push(item);
  }

  for (const groupItems of groups.values()) {
    if (groupItems.length === 0) continue;
    const template = groupItems[0];
    const geometry = template.geometry.clone();
    const material = template.material;

    const instancedMesh = new THREE.InstancedMesh(geometry, material, groupItems.length);
    instancedMesh.name = "tile_part";

    for (let i = 0; i < groupItems.length; i++) {
      instancedMesh.setMatrixAt(i, groupItems[i].matrix);
    }
    scene.add(instancedMesh);
  }
  
  return scene;
}

/**
 * 导出内部接口以便在其他文件中使用
 */
export { OctreeItem, OctreeNode, OctreeConfig };

/**
 * 导出内部函数以便在其他文件中使用
 */
export { collectItems, buildOctree, createSceneFromItems };