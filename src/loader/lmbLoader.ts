import * as THREE from "three";
import { Loader, FileLoader, LoadingManager } from "three";
import pako from "pako";

// --- 工具函数 --

export const setMaterialProperties = (material: THREE.Material) => {
  if (!material) return;
  material.side = THREE.DoubleSide; 
  // @ts-ignore
  material.flatShading = false;
  material.transparent = false;
  material.depthWrite = true;
  material.depthTest = true;
};

export const generateUniqueId = (name: string) => {
  return `${name}_${Date.now()}`;
};

export function decompressVertice(baseVertex: Float32Array, vertexScale: Float32Array, vertex: Int16Array) {
  const baseX = baseVertex[0];
  const baseY = baseVertex[1];
  const baseZ = baseVertex[2];
  const scaleX = vertexScale[0];
  const scaleY = vertexScale[1];
  const scaleZ = vertexScale[2];

  const qX = vertex[0];
  const qY = vertex[1];
  const qZ = vertex[2];

  const rx = baseX + qX / scaleX;
  const ry = baseY + qY / scaleY;
  const rz = baseZ + qZ / scaleZ;

  return { rx, ry, rz };
}

export const decodeNormal = (packed: number) => {
  const INV_NORMAL_PRECISION = 1.0 / 511.0;
  let x = (packed >> 20) & 0x3ff;
  let y = (packed >> 10) & 0x3ff;
  let z = packed & 0x3ff;

  x = x >= 512 ? x - 1024 : x;
  y = y >= 512 ? y - 1024 : y;
  z = z >= 512 ? z - 1024 : z;

  let nx = x * INV_NORMAL_PRECISION;
  let ny = y * INV_NORMAL_PRECISION;
  let nz = z * INV_NORMAL_PRECISION;

  const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (length > 0) {
    nx /= length;
    ny /= length;
    nz /= length;
  }

  return { nx, ny, nz };
};

export const parseColor = (color: number) => {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return (r << 16) | (g << 8) | b;
};

export const extractScaleFromMatrix3 = (matrix: Float32Array) => {
  if (!matrix || matrix.length < 9) {
    return [1, 1, 1];
  }

  const sx = Math.sqrt(matrix[0] * matrix[0] + matrix[1] * matrix[1] + matrix[2] * matrix[2]);
  const sy = Math.sqrt(matrix[3] * matrix[3] + matrix[4] * matrix[4] + matrix[5] * matrix[5]);
  const sz = Math.sqrt(matrix[6] * matrix[6] + matrix[7] * matrix[7] + matrix[8] * matrix[8]);

  const processScale = (scale: number) => {
    if (Math.abs(scale - 0.01) < 1e-6) return 0.01;
    if (Math.abs(scale - 0.02) < 1e-6) return 0.02;
    return scale;
  };

  return [processScale(sx), processScale(sy), processScale(sz)];
};

export const normalizeMatrix3 = (matrix: Float32Array) => {
  if (!matrix || matrix.length < 9) return Float32Array.from(matrix);

  const scales = extractScaleFromMatrix3(matrix);
  const normalized = Float32Array.from(matrix);

  for (let i = 0; i < 3; i++) {
    const offset = i * 3;
    const scale = scales[i];
    if (Math.abs(scale) > 1e-6) {
      normalized[offset] /= scale;
      normalized[offset + 1] /= scale;
      normalized[offset + 2] /= scale;
    }
  }
  return normalized;
};

export const composeMatrixByMatrix3 = (matrix: Float32Array, position: Float32Array) => {
  const matrix4 = new THREE.Matrix4();

  if (matrix && matrix.length >= 9 && position && position.length >= 3) {
    if (matrix.some((x) => isNaN(x)) || position.some((x) => isNaN(x))) {
      matrix4.identity();
      return matrix4;
    }

    const scales = extractScaleFromMatrix3(matrix);
    const normalizedRotation = normalizeMatrix3(matrix);

    const array = [
      normalizedRotation[0] * scales[0], normalizedRotation[1] * scales[0], normalizedRotation[2] * scales[0], 0,
      normalizedRotation[3] * scales[1], normalizedRotation[4] * scales[1], normalizedRotation[5] * scales[1], 0,
      normalizedRotation[6] * scales[2], normalizedRotation[7] * scales[2], normalizedRotation[8] * scales[2], 0,
      position[0], position[1], position[2], 1,
    ];

    matrix4.fromArray(array);
  } else {
    matrix4.identity();
    if (position && position.length >= 3 && !position.some((x) => isNaN(x))) {
      matrix4.setPosition(position[0], position[1], position[2]);
    }
  }

  return matrix4;
};


// --- 加载器类 --

export class LMBLoader extends Loader {
  manager: LoadingManager;

  constructor(manager?: LoadingManager) {
    super(manager);
    this.manager = manager || THREE.DefaultLoadingManager;
  }

  async loadAsync(url: string, onProgress?: (progress: any) => void): Promise<THREE.Group> {
    const loader = new FileLoader(this.manager);
    loader.setResponseType("arraybuffer");

    let buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      loader.load(url, (data) => resolve(data as ArrayBuffer), onProgress, reject);
    });

    const isCompressed = url.toLowerCase().endsWith("lmbz");
    if (isCompressed) {
      try {
        const compressedData = new Uint8Array(buffer);
        const decompressedData = pako.inflate(compressedData);
        buffer = decompressedData.buffer;
      } catch (error) {
        console.error("Decompression error:", error);
        throw new Error("Failed to decompress file");
      }
    }

    return this.parse(buffer, onProgress);
  }

  parse(buffer: ArrayBuffer, onProgress: (progress: number) => void = () => {}) {
    const view = new DataView(buffer);
    let offset = 0;
    
    // 1. Header
    const position = new Float32Array(3);
    for (let i = 0; i < 3; i++) {
      position[i] = view.getFloat32(offset, true);
      offset += 4;
    }

    const colorCount = view.getUint32(offset, true);
    offset += 4;
    const nodeCount = view.getUint32(offset, true);
    offset += 4;

    let currentStep = 0;
    const totalSteps = colorCount + nodeCount;

    // 2. Colors
    const colors: number[] = [];
    for (let i = 0; i < colorCount; i++) {
      onProgress(currentStep / totalSteps);
      currentStep++;
      const color = view.getUint32(offset, true);
      colors.push(color);
      offset += 4;
    }

    // 创建根节点
    const root = new THREE.Group();
    root.name = "LMB_Root";
    
    // 将根节点定位到头部位置
    // 我们依赖LoaderUtils稍后在容器级别重新居中
    if (!isNaN(position[0])) {
         root.position.set(position[0], position[1], position[2]);
    }

    // 材质
    const materials = colors.map((color) => {
      // Phong材质对CAD颜色很稳定
      const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(parseColor(color)),
        side: THREE.DoubleSide,
        flatShading: false,
        shininess: 30
      });
      setMaterialProperties(material);
      return material;
    });

    // 3. Nodes
    for (let i = 0; i < nodeCount; i++) {
      onProgress(currentStep / totalSteps);
      currentStep++;
      const node = this.parseNode(buffer, view, offset);

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(node.vertices, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(node.normals, 3));
      geometry.setIndex(new THREE.Uint32BufferAttribute(node.indices, 1));
      
      // 立即计算边界以确保安全
      geometry.computeBoundingBox();

      // 使用节点名称（如果可用）
      const nodeName = node.name && node.name.length > 0 ? node.name : `Node_${i}`;

      if (node.instances.length > 0) {
        const instancedMesh = new THREE.InstancedMesh(
          geometry,
          materials[node.colorIndex],
          node.instances.length + 1
        );
        instancedMesh.name = nodeName;
        
        const nodeMatrix = composeMatrixByMatrix3(node.matrix, node.position);
        instancedMesh.setMatrixAt(0, nodeMatrix);
        instancedMesh.setColorAt(0, new THREE.Color(parseColor(colors[node.colorIndex])));

        node.instances.forEach((instance: any, index: number) => {
          const instanceMatrix = composeMatrixByMatrix3(instance.matrix, instance.position);
          instancedMesh.setMatrixAt(index + 1, instanceMatrix);
          instancedMesh.setColorAt(index + 1, new THREE.Color(parseColor(colors[instance.colorIndex])));
        });
        
        root.add(instancedMesh);
      } else {
        const mesh = new THREE.Mesh(geometry, materials[node.colorIndex]);
        mesh.name = nodeName;

        const matrix = composeMatrixByMatrix3(node.matrix, node.position);
        mesh.applyMatrix4(matrix);

        root.add(mesh);
      }

      offset = node.nextOffset;
    }

    onProgress(1.0);
    return root;
  }

  parseNode(buffer: ArrayBuffer, view: DataView, offset: number) {
    // 名称
    const nameLength = view.getUint16(offset, true);
    offset += 2;

    const name = new TextDecoder().decode(new Uint8Array(buffer, offset, nameLength));
    offset += nameLength;

    while (offset % 4 !== 0) offset++;

    // 变换
    const matrix = new Float32Array(9);
    for (let i = 0; i < 9; i++) {
      matrix[i] = view.getFloat32(offset, true);
      offset += 4;
    }

    const nodePosition = new Float32Array(3);
    for (let i = 0; i < 3; i++) {
      nodePosition[i] = view.getFloat32(offset, true);
      offset += 4;
    }

    const baseVertex = new Float32Array(3);
    for (let i = 0; i < 3; i++) {
      baseVertex[i] = view.getFloat32(offset, true);
      offset += 4;
    }

    const vertexScale = new Float32Array(3);
    for (let i = 0; i < 3; i++) {
      vertexScale[i] = view.getFloat32(offset, true);
      offset += 4;
    }

    // Vertices
    const vertexCount = view.getUint32(offset, true);
    offset += 4;

    const vertices = new Float32Array(vertexCount * 3);
    vertices[0] = baseVertex[0];
    vertices[1] = baseVertex[1];
    vertices[2] = baseVertex[2];
    for (let i = 0; i < vertexCount - 1; i++) {
      const packedvertex = new Int16Array(3);
      for (let j = 0; j < 3; j++) {
        packedvertex[j] = view.getInt16(offset, true);
        offset += 2;
      }
      const { rx, ry, rz } = decompressVertice(baseVertex, vertexScale, packedvertex);
      vertices[(i + 1) * 3] = rx;
      vertices[(i + 1) * 3 + 1] = ry;
      vertices[(i + 1) * 3 + 2] = rz;
    }

    while (offset % 4 !== 0) offset++;

    // 法线
    const normalCount = vertexCount;
    const normals = new Float32Array(normalCount * 3);
    for (let i = 0; i < normalCount; i++) {
      const compressedNormal = view.getUint32(offset, true);
      offset += 4;
      const { nx, ny, nz } = decodeNormal(compressedNormal);

      normals[i * 3] = nx;
      normals[i * 3 + 1] = ny;
      normals[i * 3 + 2] = nz;
    }

    while (offset % 4 !== 0) offset++;

    // Indices
    const indexCount = view.getUint32(offset, true);
    offset += 4;

    const indexSize = vertexCount <= 255 ? 1 : vertexCount <= 65535 ? 2 : 4;
    let indices;

    if (vertexCount <= 255) indices = new Uint8Array(indexCount);
    else if (vertexCount <= 65535) indices = new Uint16Array(indexCount);
    else indices = new Uint32Array(indexCount);

    for (let i = 0; i < indexCount; i++) {
      if (indexSize === 1) indices[i] = view.getUint8(offset);
      else if (indexSize === 2) indices[i] = view.getUint16(offset, true);
      else indices[i] = view.getUint32(offset, true);
      offset += indexSize;
    }

    if (indexSize < 4) {
      while (offset % 4 !== 0) offset++;
    }

    // 颜色索引
    const colorIndex = view.getUint32(offset, true);
    offset += 4;

    // 实例
    const instanceCount = view.getUint32(offset, true);
    offset += 4;

    const instances = [];
    if (instanceCount > 0) {
      for (let i = 0; i < instanceCount; i++) {
        const instanceNameLength = view.getUint16(offset, true);
        offset += 2;

        const instanceName = new TextDecoder().decode(new Uint8Array(buffer, offset, instanceNameLength));
        offset += instanceNameLength;

        const alignmentPadding = (4 - (offset % 4)) % 4;
        offset += alignmentPadding;

        const instanceMatrix = new Float32Array(9);
        for (let j = 0; j < 9; j++) {
          instanceMatrix[j] = view.getFloat32(offset, true);
          offset += 4;
        }

        const instancePosition = new Float32Array(3);
        for (let j = 0; j < 3; j++) {
          instancePosition[j] = view.getFloat32(offset, true);
          offset += 4;
        }

        const instanceColorIndex = view.getUint32(offset, true);
        offset += 4;

        instances.push({
          name: instanceName,
          matrix: instanceMatrix,
          position: instancePosition,
          colorIndex: instanceColorIndex,
        });
      }
    }

    return {
      name,
      matrix,
      position: nodePosition,
      vertices,
      normals,
      indices,
      colorIndex,
      instances,
      nextOffset: offset,
    };
  }
}