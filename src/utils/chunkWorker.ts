
/**
 * NBIM Chunk Parser Worker
 */

interface GeometryData {
  position: Float32Array;
  /** 归一化 int8，12B/顶点 → 3B/顶点，渲染时由 GPU 还原到 [-1,1] */
  normal: Int8Array;
  index: Uint32Array | null;
  /** worker 顺带算好的局部包围盒 [minX,minY,minZ,maxX,maxY,maxZ]，
   *  主线程直接写入 BufferGeometry，避免首次框选/高亮/逐实例剔除时再扫一遍顶点。 */
  box?: Float32Array;
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
  triangles?: number;
  lodStats?: {
    minInstanceWorldSize: number;
    originalVerts: number;
    keptVerts: number;
  };
}

interface OctreeLeafPlan {
  bounds: [number, number, number, number, number, number];
  itemIndices: Uint32Array;
  level: number;
}

function computeGeometryBounds(result: ParseResult) {
  for (const geometry of result.geometries) {
    if (geometry.box) continue;
    const position = geometry.position;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < position.length; i += 3) {
      const x = position[i], y = position[i + 1], z = position[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    geometry.box = Number.isFinite(minX)
      ? new Float32Array([minX, minY, minZ, maxX, maxY, maxZ])
      : new Float32Array(6);
  }
}

function computeTriangles(geometries: GeometryData[], instances: InstanceData[]) {
  const triByGeometry = geometries.map((geometry) =>
    geometry.index && geometry.index.length > 0
      ? geometry.index.length / 3
      : geometry.position.length / 9
  );
  let triangles = 0;
  for (const instance of instances) {
    triangles += triByGeometry[instance.geoIdx] || 0;
  }
  return Math.max(0, Math.round(triangles));
}

function geometryDiagonal(geometry: GeometryData) {  const position = geometry.position;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < position.length; i += 3) {
    const x = position[i], y = position[i + 1], z = position[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX)) return 0;
  const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 远景粗 LOD：按实例世界尺寸剔除小构件，丢弃不再被引用的几何并重映射 geoIdx。
 * 不抽面，保留构件原始形状，避免细杆件在远处被抽变形。
 */
function filterInstancesBySize(result: ParseResult, minInstanceWorldSize: number): ParseResult {
  const { geometries, instances, originalUuid } = result;
  if (!(minInstanceWorldSize > 0) || instances.length === 0) {
    return {
      ...result,
      lodStats: { minInstanceWorldSize: 0, originalVerts: geometries.reduce((s, g) => s + g.position.length / 3, 0), keptVerts: geometries.reduce((s, g) => s + g.position.length / 3, 0) }
    };
  }

  const diagByGeo = geometries.map(geometryDiagonal);
  const originalVerts = geometries.reduce((sum, g) => sum + g.position.length / 3, 0);

  let kept = instances.filter((instance) => {
    const m = instance.matrix;
    const scale = (Math.abs(m[0]) + Math.abs(m[5]) + Math.abs(m[10])) / 3;
    const diag = (diagByGeo[instance.geoIdx] || 0) * scale;
    return diag >= minInstanceWorldSize;
  });

  // 极端情况：整块都小于阈值时至少保留最大的那个实例，避免出现空分块。
  if (kept.length === 0) {
    let bestIndex = 0;
    let bestDiag = -1;
    instances.forEach((instance, index) => {
      const m = instance.matrix;
      const scale = (Math.abs(m[0]) + Math.abs(m[5]) + Math.abs(m[10])) / 3;
      const diag = (diagByGeo[instance.geoIdx] || 0) * scale;
      if (diag > bestDiag) { bestDiag = diag; bestIndex = index; }
    });
    kept = [instances[bestIndex]];
  }

  const usedOldIndices = Array.from(new Set(kept.map((instance) => instance.geoIdx))).sort((a, b) => a - b);
  const newGeometries: GeometryData[] = [];
  const remap = new Map<number, number>();
  for (const oldIndex of usedOldIndices) {
    remap.set(oldIndex, newGeometries.length);
    newGeometries.push(geometries[oldIndex]);
  }
  for (const instance of kept) {
    instance.geoIdx = remap.get(instance.geoIdx) ?? 0;
  }

  const keptVerts = newGeometries.reduce((sum, g) => sum + g.position.length / 3, 0);
  return {
    geometries: newGeometries,
    instances: kept,
    originalUuid,
    triangles: computeTriangles(newGeometries, kept),
    lodStats: { minInstanceWorldSize, originalVerts, keptVerts }
  };
}

self.onmessage = async function (e: MessageEvent) {
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
    if (version !== 8 && version !== 9) {
      throw new Error(`Unsupported NBIM chunk version: ${version}. Only V8/V9 are supported.`);
    }

    let result: ParseResult;
    if (version === 9) {
      const payload = await decompressV9Payload(buffer as ArrayBuffer);
      result = parseChunkBinaryV9(payload, originalUuid, bimIdTable || []);
    } else {
      result = parseChunkBinaryV8(buffer, originalUuid, bimIdTable || []);
    }
    const minInstanceWorldSize = Number(e.data.minInstanceWorldSize) || 0;
    if (minInstanceWorldSize > 0) {
      result = filterInstancesBySize(result, minInstanceWorldSize);
    }
    computeGeometryBounds(result);

    const transferables: Transferable[] = [];
    result.geometries.forEach(geo => {
      if (geo.position) transferables.push(geo.position.buffer);
      if (geo.normal) transferables.push(geo.normal.buffer);
      if (geo.index) transferables.push(geo.index.buffer);
      if (geo.box) transferables.push(geo.box.buffer);
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
    // 法线直接从浮点量化为归一化 int8：合并缓冲随之减到 1/4，光照由 GPU 归一化属性还原。
    const normArr = new Int8Array(vertCount * 3);
    for (let n = 0; n < normArr.length; n++) {
      const value = dv.getFloat32(offset.value + n * 4, true);
      const clamped = value > 1 ? 1 : value < -1 ? -1 : value;
      normArr[n] = Math.round(clamped * 127);
    }
    offset.value += vertCount * 12;
    
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
 * 解析实例矩阵
 */
function parseMatrix(dv: DataView, offset: { value: number }): Float32Array {
  const matrix = new Float32Array(16);
  for (let k = 0; k < 16; k++) {
    matrix[k] = dv.getFloat32(offset.value, true); offset.value += 4;
  }
  return matrix;
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

  return { geometries, instances, originalUuid, triangles: computeTriangles(geometries, instances) };
}

const V9_MAGIC = 0x3956424e;

async function decompressV9Payload(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== V9_MAGIC) throw new Error("无效的 NBIM v9 分块");
  const payloadLength = dv.getUint32(8, true);
  const compressedLength = dv.getUint32(12, true);
  if (typeof DecompressionStream === "undefined") {
    throw new Error("当前环境不支持 DecompressionStream(gzip)，无法读取 v9 分块");
  }
  const compressed = buffer.slice(16, 16 + compressedLength);
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
  const payload = await new Response(stream).arrayBuffer();
  if (payload.byteLength !== payloadLength) {
    throw new Error(`NBIM v9 解压长度不符: ${payload.byteLength} != ${payloadLength}`);
  }
  return payload;
}

function parseChunkBinaryV9(payload: ArrayBuffer, originalUuid: string, bimIdTable: string[]): ParseResult {
  const dv = new DataView(payload);
  let offset = 0;
  const geoCount = dv.getUint32(offset, true); offset += 4;
  const scaleX = dv.getFloat32(offset, true); offset += 4;
  const scaleY = dv.getFloat32(offset, true); offset += 4;
  const scaleZ = dv.getFloat32(offset, true); offset += 4;
  const offX = dv.getFloat32(offset, true); offset += 4;
  const offY = dv.getFloat32(offset, true); offset += 4;
  const offZ = dv.getFloat32(offset, true); offset += 4;
  const scales = [scaleX, scaleY, scaleZ];
  const offsets = [offX, offY, offZ];

  const geometries: GeometryData[] = [];
  for (let i = 0; i < geoCount; i++) {
    const vertCount = dv.getUint32(offset, true); offset += 4;
    const indexCount = dv.getUint32(offset, true); offset += 4;
    const indexType = dv.getUint8(offset); offset += 1;

    const position = new Float32Array(vertCount * 3);
    for (let v = 0; v < vertCount * 3; v++) {
      const q = dv.getInt16(offset, true); offset += 2;
      position[v] = (q + 32768) * scales[v % 3] + offsets[v % 3];
    }
    const normal = new Int8Array(payload, offset, vertCount * 3).slice();
    offset += vertCount * 3;

    let index: Uint32Array | null = null;
    if (indexCount > 0) {
      index = new Uint32Array(indexCount);
      if (indexType === 1) {
        for (let k = 0; k < indexCount; k++) { index[k] = dv.getUint16(offset, true); offset += 2; }
      } else {
        for (let k = 0; k < indexCount; k++) { index[k] = dv.getUint32(offset, true); offset += 4; }
      }
    }
    geometries.push({ position, normal, index });
  }

  const instanceCount = dv.getUint32(offset, true); offset += 4;
  const instances: InstanceData[] = [];
  for (let i = 0; i < instanceCount; i++) {
    const bimIdIndex = dv.getUint32(offset, true); offset += 4;
    dv.getUint32(offset, true); offset += 4;
    const color = dv.getUint32(offset, true); offset += 4;
    const matrix = new Float32Array(16);
    for (let k = 0; k < 16; k++) { matrix[k] = dv.getFloat32(offset, true); offset += 4; }
    const geoIdx = dv.getUint32(offset, true); offset += 4;
    instances.push({
      bimId: bimIdTable[bimIdIndex] ?? String(bimIdIndex),
      color,
      matrix,
      geoIdx
    });
  }

  return { geometries, instances, originalUuid, triangles: computeTriangles(geometries, instances) };
}
