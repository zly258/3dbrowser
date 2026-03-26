
/**
 * NBIM Chunk Parser Worker
 */

interface GeometryData {
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array | null;
}

interface InstanceData {
  bimId: string;
  color: number;
  matrix: Float32Array;
  geoIdx: number;
}

interface ParseResult {
  geometries: GeometryData[];
  instances: InstanceData[];
  originalUuid: string;
}

interface OctreeLeafPlan {
  bounds: [number, number, number, number, number, number];
  itemIndices: Uint32Array;
  level: number;
}

self.onmessage = function (e: MessageEvent) {
  const { taskType = "parseNbim" } = e.data;
  
  try {
    if (taskType === "buildOctreePlan") {
      const result = buildOctreePlan(
        e.data.centers,
        e.data.radii,
        e.data.bounds,
        e.data.maxItemsPerNode,
        e.data.maxDepth
      );
      const transferables: Transferable[] = result.map((leaf) => leaf.itemIndices.buffer);
      // @ts-ignore
      self.postMessage({ type: "success", result }, transferables);
      return;
    }

    const { buffer, version, originalUuid, bimIdTable } = e.data;
    let result: ParseResult;
    if (version >= 8) {
      result = parseChunkBinaryV8(buffer, originalUuid, bimIdTable || []);
    } else {
      result = parseChunkBinaryV7(buffer, originalUuid);
    }

    const transferables: Transferable[] = [];
    result.geometries.forEach(geo => {
      if (geo.position) transferables.push(geo.position.buffer);
      if (geo.normal) transferables.push(geo.normal.buffer);
      if (geo.index) transferables.push(geo.index.buffer);
    });
    result.instances.forEach(inst => {
      if (inst.matrix) transferables.push(inst.matrix.buffer);
    });

    // @ts-ignore - self.postMessage in Worker context
    self.postMessage({ type: 'success', result }, transferables);
  } catch (err: any) {
    // @ts-ignore
    self.postMessage({ type: 'error', error: err.message || String(err) });
  }
};

function buildOctreePlan(
  centers: Float32Array,
  radii: Float32Array,
  bounds: [number, number, number, number, number, number],
  maxItemsPerNode: number,
  maxDepth: number
): OctreeLeafPlan[] {
  const allIndices = new Uint32Array(radii.length);
  for (let i = 0; i < radii.length; i++) allIndices[i] = i;

  const leaves: OctreeLeafPlan[] = [];

  const recurse = (
    itemIndices: Uint32Array,
    nodeBounds: [number, number, number, number, number, number],
    level: number
  ) => {
    if (itemIndices.length <= maxItemsPerNode || level >= maxDepth) {
      leaves.push({
        bounds: nodeBounds,
        itemIndices,
        level
      });
      return;
    }

    const [minX, minY, minZ, maxX, maxY, maxZ] = nodeBounds;
    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;

    const buckets: number[][] = Array.from({ length: 8 }, () => []);

    for (let i = 0; i < itemIndices.length; i++) {
      const itemIndex = itemIndices[i];
      const offset = itemIndex * 3;
      const x = centers[offset];
      const y = centers[offset + 1];
      const z = centers[offset + 2];
      const bucket = (x >= centerX ? 1 : 0) | (y >= centerY ? 2 : 0) | (z >= centerZ ? 4 : 0);
      buckets[bucket].push(itemIndex);
    }

    let hasChildren = false;
    for (let i = 0; i < 8; i++) {
      if (buckets[i].length === 0) continue;
      hasChildren = true;
      const childBounds: [number, number, number, number, number, number] = [
        (i & 1) ? centerX : minX,
        (i & 2) ? centerY : minY,
        (i & 4) ? centerZ : minZ,
        (i & 1) ? maxX : centerX,
        (i & 2) ? maxY : centerY,
        (i & 4) ? maxZ : centerZ
      ];
      recurse(Uint32Array.from(buckets[i]), childBounds, level + 1);
    }

    if (!hasChildren) {
      leaves.push({
        bounds: nodeBounds,
        itemIndices,
        level
      });
    }
  };

  recurse(allIndices, bounds, 0);
  return leaves;
}

/**
 * 通用的几何体解析和索引一致性处理
 */
function parseGeometries(dv: DataView, buffer: ArrayBuffer, offset: { value: number }): GeometryData[] {
  const geoCount = dv.getUint32(offset.value, true); offset.value += 4;
  const geometries: GeometryData[] = [];
  
  for (let i = 0; i < geoCount; i++) {
    const vertCount = dv.getUint32(offset.value, true); offset.value += 4;
    const indexCount = dv.getUint32(offset.value, true); offset.value += 4;
    
    const posArr = new Float32Array(buffer.slice(offset.value, offset.value + vertCount * 12)); offset.value += vertCount * 12;
    const normArr = new Float32Array(buffer.slice(offset.value, offset.value + vertCount * 12)); offset.value += vertCount * 12;
    
    const geo: GeometryData = {
      position: posArr,
      normal: normArr,
      index: null
    };
    
    if (indexCount > 0) {
      const indexArr = new Uint32Array(buffer.slice(offset.value, offset.value + indexCount * 4)); offset.value += indexCount * 4;
      geo.index = indexArr;
    }
    geometries.push(geo);
  }

  // Ensure all geometries have indices if any of them do (BatchedMesh requirement)
  const hasAnyIndex = geometries.some(g => g.index !== null);
  if (hasAnyIndex) {
    geometries.forEach(g => {
      if (!g.index) {
        const count = g.position.length / 3;
        const index = new Uint32Array(count);
        for (let j = 0; j < count; j++) index[j] = j;
        g.index = index;
      }
    });
  }
  
  return geometries;
}

/**
 * 解析实例矩阵（V7 和 V8 通用部分）
 */
function parseMatrix(dv: DataView, offset: { value: number }): Float32Array {
  const matrix = new Float32Array(16);
  for (let k = 0; k < 16; k++) {
    matrix[k] = dv.getFloat32(offset.value, true); offset.value += 4;
  }
  return matrix;
}

function parseChunkBinaryV7(buffer: ArrayBuffer, originalUuid: string): ParseResult {
  const dv = new DataView(buffer);
  const offset = { value: 0 };

  const geometries = parseGeometries(dv, buffer, offset);
  const instanceCount = dv.getUint32(offset.value, true); offset.value += 4;
  const instances: InstanceData[] = [];

  for (let i = 0; i < instanceCount; i++) {
    const bimIdNum = dv.getUint32(offset.value, true); offset.value += 4;
    dv.getUint32(offset.value, true); offset.value += 4; // 类型
    const hex = dv.getUint32(offset.value, true); offset.value += 4;

    const matrix = parseMatrix(dv, offset);
    const geoIdx = dv.getUint32(offset.value, true); offset.value += 4;

    instances.push({
      bimId: String(bimIdNum),
      color: hex,
      matrix: matrix,
      geoIdx: geoIdx
    });
  }

  return { geometries, instances, originalUuid };
}

function parseChunkBinaryV8(buffer: ArrayBuffer, originalUuid: string, bimIdTable: string[]): ParseResult {
  const dv = new DataView(buffer);
  const offset = { value: 0 };

  const geometries = parseGeometries(dv, buffer, offset);
  const instanceCount = dv.getUint32(offset.value, true); offset.value += 4;
  const instances: InstanceData[] = [];

  for (let i = 0; i < instanceCount; i++) {
    const bimIdIndex = dv.getUint32(offset.value, true); offset.value += 4;
    dv.getUint32(offset.value, true); offset.value += 4; // 类型
    const hex = dv.getUint32(offset.value, true); offset.value += 4;

    const matrix = parseMatrix(dv, offset);
    const geoIdx = dv.getUint32(offset.value, true); offset.value += 4;

    instances.push({
      bimId: bimIdTable[bimIdIndex] ?? String(bimIdIndex),
      color: hex,
      matrix: matrix,
      geoIdx: geoIdx
    });
  }

  return { geometries, instances, originalUuid };
}
