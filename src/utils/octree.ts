import * as THREE from "three";

// 八叉树项接口
interface OctreeItem {
  id: string; // 几何体_uuid + 材质_uuid
  uuid: string; // 原始 Object3D 的 uuid
  expressID?: number; // IFC expressID
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  color: number; // 原始颜色
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
 * 几何体标准化处理（对齐 refs 逻辑）
 * 强制转换为标准 BufferGeometry，处理 InterleavedBufferAttributes 等复杂情况
 * 这是解决“块加载不全”和 BatchedMesh 兼容性的关键
 */
export function sanitizeGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!source.getAttribute('position')) return new THREE.BoxGeometry(0.1, 0.1, 0.1);

  const geometry = new THREE.BufferGeometry();
  
  // 1. 复制坐标（position）
  const posAttr = source.getAttribute('position');
  const positions = new Float32Array(posAttr.count * 3);
  for (let i = 0; i < posAttr.count; i++) {
    positions[i * 3] = posAttr.getX(i);
    positions[i * 3 + 1] = posAttr.getY(i);
    positions[i * 3 + 2] = posAttr.getZ(i);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // 2. 复制法线（normal；不存在则重新计算）
  const normAttr = source.getAttribute('normal');
  if (normAttr) {
    const normals = new Float32Array(normAttr.count * 3);
    for (let i = 0; i < normAttr.count; i++) {
      normals[i * 3] = normAttr.getX(i);
      normals[i * 3 + 1] = normAttr.getY(i);
      normals[i * 3 + 2] = normAttr.getZ(i);
    }
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  } else {
    geometry.computeVertexNormals();
  }

  // 3. 复制索引（index；不存在则生成）
  if (source.getIndex()) {
    const sourceIndex = source.getIndex()!;
    const indices = new Uint32Array(sourceIndex.count);
    for (let i = 0; i < sourceIndex.count; i++) {
      indices[i] = sourceIndex.getX(i);
    }
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  }

  // 4. 移除冗余属性（uv/uv2/color 等），确保 BatchedMesh 兼容性
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('uv2');
  geometry.deleteAttribute('color');

  // 5. 计算包围盒
  geometry.computeBoundingBox();
  
  return geometry;
}

/**
 * 提取构件颜色
 */
function extractColor(mesh: THREE.Mesh): number {
  if (mesh.userData.color !== undefined) return mesh.userData.color;
  
  // 尝试从顶点颜色提取（针对某些 BIM 格式）
  const geo = mesh.geometry;
  if (geo && geo.attributes.color) {
    const colorAttr = geo.attributes.color;
    if (colorAttr.count > 0) {
      const r = colorAttr.getX(0);
      const g = colorAttr.getY(0);
      const b = colorAttr.getZ(0);
      // 处理 0-1 或 0-255 范围
      const color = new THREE.Color();
      if (r > 1 || g > 1 || b > 1) color.setRGB(r / 255, g / 255, b / 255);
      else color.setRGB(r, g, b);
      return color.getHex();
    }
  }

  const material = mesh.material;
  if (Array.isArray(material)) {
    for (const mat of material) {
      if ((mat as any).color) return (mat as any).color.getHex();
    }
  } else if ((material as any).color) {
    return (material as any).color.getHex();
  }
  
  return getColorByComponentType(mesh.name);
}

/**
 * 根据构件类型获取颜色
 */
function getColorByComponentType(name: string): number {
  const n = name.toLowerCase();
  if (n.includes('col') || n.includes('柱')) return 0xbfdbfe; // 蓝色（浅）
  if (n.includes('beam') || n.includes('梁')) return 0x93c5fd; // 蓝色（中）
  if (n.includes('slab') || n.includes('板')) return 0xe5e7eb; // 灰色（浅）
  if (n.includes('wall') || n.includes('墙')) return 0xf3f4f6; // 灰色（更浅）
  return 0x94a3b8; // 灰色（中）
}

/**
 * 从根对象收集所有可渲染项
 * @param root 根对象
 * @returns 可渲染项数组
 */
function collectItems(root: THREE.Object3D): OctreeItem[] {
  const items: OctreeItem[] = [];
  const _m4 = new THREE.Matrix4();

  // 根对象可能已居中（已应用偏移），因此需要调用 updateMatrixWorld 确保矩阵最新
  // 这里捕获的是当前视觉状态（以原点居中）
  // 这有助于提升导出 GLB 的数值精度
  root.updateMatrixWorld(true);

  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const geometry = mesh.geometry;
      const material = mesh.material;
      
      if (!geometry) return;

      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const worldMatrix = mesh.matrixWorld;
      
      // 使用包围盒中心点，对齐 refs 逻辑，处理几何体偏移情况
      const center = new THREE.Vector3();
      geometry.boundingBox!.getCenter(center);
      center.applyMatrix4(worldMatrix);

      const matUuid = Array.isArray(material) ? material[0]?.uuid : material?.uuid;
      const id = `${geometry.uuid}_${matUuid}`;

      if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
        const instancedMesh = mesh as THREE.InstancedMesh;
        for (let i = 0; i < instancedMesh.count; i++) {
          instancedMesh.getMatrixAt(i, _m4);
          _m4.premultiply(worldMatrix);
          
          const instanceCenter = new THREE.Vector3();
          geometry.boundingBox!.getCenter(instanceCenter);
          instanceCenter.applyMatrix4(_m4);

          items.push({
            id,
            uuid: mesh.uuid,
            expressID: instancedMesh.userData.expressID,
            geometry,
            material: material as THREE.Material,
            color: extractColor(mesh),
            matrix: _m4.clone(),
            center: instanceCenter
          });
        }
      } else {
        items.push({
            id,
            uuid: mesh.uuid,
            expressID: mesh.userData.expressID,
            geometry,
            material: material as THREE.Material,
            color: extractColor(mesh),
            matrix: worldMatrix.clone(),
            center: center
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
  
  const childrenItems: OctreeItem[][] = Array(8).fill(null).map(() => []);

  for (const item of items) {
    const c = item.center;
    // 使用与 refs 一致的位运算计算子块索引，更简洁高效
    const idx = (c.x >= center.x ? 1 : 0) | (c.y >= center.y ? 2 : 0) | (c.z >= center.z ? 4 : 0);
    childrenItems[idx].push(item);
  }

  const children: OctreeNode[] = [];
  let hasChildren = false;
  
  for (let i = 0; i < 8; i++) {
    if (childrenItems[i].length > 0) {
      const cMin = new THREE.Vector3((i & 1) ? center.x : min.x, (i & 2) ? center.y : min.y, (i & 4) ? center.z : min.z);
      const cMax = new THREE.Vector3((i & 1) ? max.x : center.x, (i & 2) ? max.y : center.y, (i & 4) ? max.z : center.z);
      const childBounds = new THREE.Box3(cMin, cMax);
      
      children.push(buildOctree(childrenItems[i], childBounds, config, level + 1));
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
 * 从项数组创建 BatchedMesh
 * @param items 可渲染项数组
 * @param material 材质
 * @returns 创建的 BatchedMesh
 */
function createBatchedMeshFromItems(items: OctreeItem[], material: THREE.Material): THREE.BatchedMesh | null {
  if (items.length === 0) return null;

  let vertexCount = 0;
  let indexCount = 0;

  // 预先处理所有几何体，确保它们是标准化的（对齐 refs）
  const sanitizedItems = items.map(item => ({
    ...item,
    geometry: sanitizeGeometry(item.geometry)
  }));

  for (const item of sanitizedItems) {
    vertexCount += item.geometry.attributes.position.count;
    if (item.geometry.index) {
      indexCount += item.geometry.index.count;
    }
  }

  const batchedMesh = new THREE.BatchedMesh(sanitizedItems.length, vertexCount, indexCount, material);
  
  batchedMesh.frustumCulled = true;

  const geometryMap = new Map<THREE.BufferGeometry, number>();
  const batchIdToExpressId = new Map<number, number>();
  const batchIdToUuid = new Map<number, string>();
  const batchIdToColor = new Map<number, number>();
  const batchIdToGeometry = new Map<number, THREE.BufferGeometry>();

  for (const item of sanitizedItems) {
    let geometryId = geometryMap.get(item.geometry);
    if (geometryId === undefined) {
      geometryId = batchedMesh.addGeometry(item.geometry);
      geometryMap.set(item.geometry, geometryId);
    }

    if (geometryId !== -1) {
      const instanceId = batchedMesh.addInstance(geometryId);
      batchedMesh.setMatrixAt(instanceId, item.matrix);
      
      const color = new THREE.Color(item.color);
      batchedMesh.setColorAt(instanceId, color);

      if (item.expressID !== undefined) {
        batchIdToExpressId.set(instanceId, item.expressID);
      }
      
      batchIdToUuid.set(instanceId, item.uuid);
      batchIdToColor.set(instanceId, item.color);
      batchIdToGeometry.set(instanceId, item.geometry);
    }
  }

  batchedMesh.userData.batchIdToExpressId = batchIdToExpressId;
  batchedMesh.userData.batchIdToUuid = batchIdToUuid;
  batchedMesh.userData.batchIdToColor = batchIdToColor;
  batchedMesh.userData.batchIdToGeometry = batchIdToGeometry;
  return batchedMesh;
}

/**
 * 将八叉树转换为一组 BatchedMesh 节点
 * @param node 八叉树节点
 * @param material 共享材质（通常 BIM 模型可以使用一个 StandardMaterial）
 * @param group 结果组
 */
function convertOctreeToBatchedMeshes(node: OctreeNode, material: THREE.Material, group: THREE.Group) {
  if (node.children) {
    for (const child of node.children) {
      convertOctreeToBatchedMeshes(child, material, group);
    }
  } else if (node.items.length > 0) {
    const batchedMesh = createBatchedMeshFromItems(node.items, material);
    if (batchedMesh) {
      batchedMesh.name = `chunk_l${node.level}`;
      // 存储包围盒用于视锥体剔除优化（如果需要）
      batchedMesh.userData.bounds = node.bounds;
      group.add(batchedMesh);
    }
  }
}

/**
 * 收集所有叶子节点
 */
export function collectLeafNodes(node: OctreeNode, leaves: OctreeNode[] = []) {
  if (node.children) {
    for (const child of node.children) {
      collectLeafNodes(child, leaves);
    }
  } else if (node.items.length > 0) {
    leaves.push(node);
  }
  return leaves;
}

/**
 * 导出内部接口以便在其他文件中使用
 */
export type { OctreeItem, OctreeNode, OctreeConfig };

/**
 * 导出内部函数以便在其他文件中使用
 */
export { collectItems, buildOctree, createSceneFromItems, createBatchedMeshFromItems, convertOctreeToBatchedMeshes };
