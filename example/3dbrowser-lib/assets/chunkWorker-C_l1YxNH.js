(function () {
  'use strict';

  self.onmessage = function(e) {
    const { buffer, version, originalUuid, bimIdTable } = e.data;
    try {
      let result;
      if (version >= 8) {
        result = parseChunkBinaryV8(buffer, originalUuid, bimIdTable || []);
      } else {
        result = parseChunkBinaryV7(buffer, originalUuid);
      }
      const transferables = [];
      result.geometries.forEach((geo) => {
        if (geo.position) transferables.push(geo.position.buffer);
        if (geo.normal) transferables.push(geo.normal.buffer);
        if (geo.index) transferables.push(geo.index.buffer);
      });
      result.instances.forEach((inst) => {
        if (inst.matrix) transferables.push(inst.matrix.buffer);
      });
      self.postMessage({ type: "success", result }, transferables);
    } catch (err) {
      self.postMessage({ type: "error", error: err.message || String(err) });
    }
  };
  function parseGeometries(dv, buffer, offset) {
    const geoCount = dv.getUint32(offset.value, true);
    offset.value += 4;
    const geometries = [];
    for (let i = 0; i < geoCount; i++) {
      const vertCount = dv.getUint32(offset.value, true);
      offset.value += 4;
      const indexCount = dv.getUint32(offset.value, true);
      offset.value += 4;
      const posArr = new Float32Array(buffer.slice(offset.value, offset.value + vertCount * 12));
      offset.value += vertCount * 12;
      const normArr = new Float32Array(buffer.slice(offset.value, offset.value + vertCount * 12));
      offset.value += vertCount * 12;
      const geo = {
        position: posArr,
        normal: normArr,
        index: null
      };
      if (indexCount > 0) {
        const indexArr = new Uint32Array(buffer.slice(offset.value, offset.value + indexCount * 4));
        offset.value += indexCount * 4;
        geo.index = indexArr;
      }
      geometries.push(geo);
    }
    const hasAnyIndex = geometries.some((g) => g.index !== null);
    if (hasAnyIndex) {
      geometries.forEach((g) => {
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
  function parseMatrix(dv, offset) {
    const matrix = new Float32Array(16);
    for (let k = 0; k < 16; k++) {
      matrix[k] = dv.getFloat32(offset.value, true);
      offset.value += 4;
    }
    return matrix;
  }
  function parseChunkBinaryV7(buffer, originalUuid) {
    const dv = new DataView(buffer);
    const offset = { value: 0 };
    const geometries = parseGeometries(dv, buffer, offset);
    const instanceCount = dv.getUint32(offset.value, true);
    offset.value += 4;
    const instances = [];
    for (let i = 0; i < instanceCount; i++) {
      const bimIdNum = dv.getUint32(offset.value, true);
      offset.value += 4;
      dv.getUint32(offset.value, true);
      offset.value += 4;
      const hex = dv.getUint32(offset.value, true);
      offset.value += 4;
      const matrix = parseMatrix(dv, offset);
      const geoIdx = dv.getUint32(offset.value, true);
      offset.value += 4;
      instances.push({
        bimId: String(bimIdNum),
        color: hex,
        matrix,
        geoIdx
      });
    }
    return { geometries, instances, originalUuid };
  }
  function parseChunkBinaryV8(buffer, originalUuid, bimIdTable) {
    const dv = new DataView(buffer);
    const offset = { value: 0 };
    const geometries = parseGeometries(dv, buffer, offset);
    const instanceCount = dv.getUint32(offset.value, true);
    offset.value += 4;
    const instances = [];
    for (let i = 0; i < instanceCount; i++) {
      const bimIdIndex = dv.getUint32(offset.value, true);
      offset.value += 4;
      dv.getUint32(offset.value, true);
      offset.value += 4;
      const hex = dv.getUint32(offset.value, true);
      offset.value += 4;
      const matrix = parseMatrix(dv, offset);
      const geoIdx = dv.getUint32(offset.value, true);
      offset.value += 4;
      instances.push({
        bimId: bimIdTable[bimIdIndex] ?? String(bimIdIndex),
        color: hex,
        matrix,
        geoIdx
      });
    }
    return { geometries, instances, originalUuid };
  }

})();
