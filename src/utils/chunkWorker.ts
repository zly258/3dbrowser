
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

function parseChunkBinaryV7(buffer: ArrayBuffer, originalUuid: string): ParseResult {
  const dv = new DataView(buffer);
  let offset = 0;

  const geoCount = dv.getUint32(offset, true); offset += 4;
  const geometries: GeometryData[] = [];
  
  for (let i = 0; i < geoCount; i++) {
    const vertCount = dv.getUint32(offset, true); offset += 4;
    const indexCount = dv.getUint32(offset, true); offset += 4;
    
    // 使用 slice 确保每个属性有自己的 Buffer，方便 transferable
    const posArr = new Float32Array(buffer.slice(offset, offset + vertCount * 12)); offset += vertCount * 12;
    const normArr = new Float32Array(buffer.slice(offset, offset + vertCount * 12)); offset += vertCount * 12;
    
    const geo: GeometryData = {
      position: posArr,
      normal: normArr,
      index: null
    };
    
    if (indexCount > 0) {
      const indexArr = new Uint32Array(buffer.slice(offset, offset + indexCount * 4)); offset += indexCount * 4;
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

  const instanceCount = dv.getUint32(offset, true); offset += 4;
  const instances: InstanceData[] = [];

  for (let i = 0; i < instanceCount; i++) {
    const bimIdNum = dv.getUint32(offset, true); offset += 4;
    dv.getUint32(offset, true); offset += 4; // 类型
    const hex = dv.getUint32(offset, true); offset += 4;

    const matrix = new Float32Array(16);
    for (let k = 0; k < 16; k++) {
      matrix[k] = dv.getFloat32(offset, true); offset += 4;
    }
    const geoIdx = dv.getUint32(offset, true); offset += 4;

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
  let offset = 0;

  const geoCount = dv.getUint32(offset, true); offset += 4;
  const geometries: GeometryData[] = [];
  
  for (let i = 0; i < geoCount; i++) {
    const vertCount = dv.getUint32(offset, true); offset += 4;
    const indexCount = dv.getUint32(offset, true); offset += 4;
    
    const posArr = new Float32Array(buffer.slice(offset, offset + vertCount * 12)); offset += vertCount * 12;
    const normArr = new Float32Array(buffer.slice(offset, offset + vertCount * 12)); offset += vertCount * 12;
    
    const geo: GeometryData = {
      position: posArr,
      normal: normArr,
      index: null
    };
    
    if (indexCount > 0) {
      const indexArr = new Uint32Array(buffer.slice(offset, offset + indexCount * 4)); offset += indexCount * 4;
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

  const instanceCount = dv.getUint32(offset, true); offset += 4;
  const instances: InstanceData[] = [];

  for (let i = 0; i < instanceCount; i++) {
    const bimIdIndex = dv.getUint32(offset, true); offset += 4;
    dv.getUint32(offset, true); offset += 4; // 类型
    const hex = dv.getUint32(offset, true); offset += 4;

    const matrix = new Float32Array(16);
    for (let k = 0; k < 16; k++) {
      matrix[k] = dv.getFloat32(offset, true); offset += 4;
    }
    const geoIdx = dv.getUint32(offset, true); offset += 4;

    instances.push({
      bimId: bimIdTable[bimIdIndex] ?? String(bimIdIndex),
      color: hex,
      matrix: matrix,
      geoIdx: geoIdx
    });
  }

  return { geometries, instances, originalUuid };
}
