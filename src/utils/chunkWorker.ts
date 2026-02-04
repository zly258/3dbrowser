
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

self.onmessage = function (e: MessageEvent) {
  const { buffer, version, originalUuid, bimIdTable } = e.data;
  
  try {
    let result: ParseResult;
    if (version >= 8) {
      result = parseChunkBinaryV8(buffer, originalUuid, bimIdTable || []);
    } else {
      result = parseChunkBinaryV7(buffer, originalUuid);
    }
    
    // 发送结果，并将所有 ArrayBuffer 加入 transferable 列表
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
