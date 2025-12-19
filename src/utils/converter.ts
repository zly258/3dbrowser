import * as THREE from "three";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// --- 现有3D瓦片逻辑 --
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

// 从根对象收集所有可渲染项
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

export async function convertLMBTo3DTiles(
  root: THREE.Object3D, 
  onProgress: (msg: string) => void
): Promise<Map<string, Blob>> {
  
  onProgress("分析场景对象...");
  const items = collectItems(root);
  const totalItems = items.length;
  
  if (totalItems === 0) throw new Error("No meshes found in scene");

  // 从根用户数据确定全局偏移
  const globalOffset = new THREE.Vector3(0, 0, 0);
  if (root.userData.originalCenter) {
      globalOffset.copy(root.userData.originalCenter);
      console.log("使用全局偏移进行瓦片集变换:", globalOffset);
  }

  // 动态配置
  let maxItemsPerNode = 2000;
  if (totalItems < 5000) maxItemsPerNode = 5000;
  else if (totalItems > 100000) maxItemsPerNode = 4000;
  else maxItemsPerNode = 2500;

  let maxDepth = 5;
  if (totalItems > 200000) maxDepth = 7;
  else if (totalItems > 50000) maxDepth = 6;

  onProgress(`找到 ${totalItems} 个对象. 配置: 容量=${maxItemsPerNode}, 深度=${maxDepth}...`);

  const bounds = new THREE.Box3();
  for (const item of items) {
    bounds.expandByPoint(item.center);
  }
  // 边界缓冲
  bounds.min.subScalar(1);
  bounds.max.addScalar(1);

  const config: OctreeConfig = { maxItemsPerNode, maxDepth };
  const octree = buildOctree(items, bounds, config);

  const fileBlobs = new Map<string, Blob>();
  const exporter = new GLTFExporter();

  let tileCount = 0;
  const countTiles = (node: OctreeNode) => {
    if (node.items.length > 0) tileCount++;
    if (node.children) node.children.forEach(countTiles);
  };
  countTiles(octree);

  let processedCount = 0;
  onProgress(`预计生成 ${tileCount} 个瓦片...`);

  const processNode = async (node: OctreeNode, path: string): Promise<any> => {
    // 瓦片内容空间中的标准边界框（局部/居中）
    const boundingVolume = {
      box: [
        (node.bounds.min.x + node.bounds.max.x) / 2,
        (node.bounds.min.y + node.bounds.max.y) / 2,
        (node.bounds.min.z + node.bounds.max.z) / 2,
        (node.bounds.max.x - node.bounds.min.x) / 2, 0, 0,
        0, (node.bounds.max.y - node.bounds.min.y) / 2, 0,
        0, 0, (node.bounds.max.z - node.bounds.min.z) / 2
      ]
    };

    const tileObj: any = {
      boundingVolume: boundingVolume,
      geometricError: 500 / Math.pow(2, node.level),
      refine: "ADD"
    };

    if (node.items.length > 0) {
      const scene = createSceneFromItems(node.items);
      const glbBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        exporter.parse(
          scene,
          (result) => resolve(result as ArrayBuffer),
          (err) => reject(err),
          { binary: true }
        );
      });

      processedCount++;
      const percent = Math.floor((processedCount / tileCount) * 100);
      onProgress(`生成瓦片 (${processedCount}/${tileCount}): ${percent}%`);

      const filename = `tile_${path}.glb`;
      fileBlobs.set(filename, new Blob([glbBuffer], { type: "model/gltf-binary" }));
      
      tileObj.content = {
        uri: filename
      };
    }

    if (node.children) {
      const childPromises = node.children.map((child, i) => 
        processNode(child, path + "_" + i)
      );
      tileObj.children = await Promise.all(childPromises);
    }

    return tileObj;
  };

  onProgress("开始生成 GLB 瓦片...");
  const rootTile = await processNode(octree, "root");

  // 创建变换矩阵将模型放回世界坐标
  const transform = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      globalOffset.x, globalOffset.y, globalOffset.z, 1
  ];

  rootTile.transform = transform;

  const tileset = {
    asset: {
      version: "1.1",
      // 重要提示：GLTFExporter默认导出为Y轴向上。
      // 我们在这里设置"Y"，这样3d-tiles-renderer会自动将其旋转到Z轴向上。
      gltfUpAxis: "Y" 
    },
    geometricError: 1000,
    root: rootTile
  };

  const tilesetJson = JSON.stringify(tileset, null, 2);
  fileBlobs.set("tileset.json", new Blob([tilesetJson], { type: "application/json" }));

  return fileBlobs;
}

export async function createZip(files: Map<string, Blob>): Promise<Blob> {
    const zip = new JSZip();
    files.forEach((blob, name) => zip.file(name, blob));
    return zip.generateAsync({ type: "blob" });
}

// --- NEW EXPORT FUNCTIONS ---

export async function exportGLB(root: THREE.Object3D): Promise<Blob> {
    const exporter = new GLTFExporter();
    return new Promise((resolve, reject) => {
        exporter.parse(
            root,
            (result) => {
                const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
                resolve(blob);
            },
            (err) => reject(err),
            { binary: true }
        );
    });
}

// 自定义LMB导出器实现
// 这镜像了LMB加载器结构：
// 头部：位置(3f)，颜色数量(u32)，节点数量(u32)
// 颜色：u32[]
// 节点：名称，矩阵(9f)，位置(3f)，基础顶点(3f)，顶点缩放(3f)，顶点数量(u32)，顶点(压缩)，法线(压缩)，索引，颜色索引，实例数量，实例...

export async function exportLMB(root: THREE.Object3D, onProgress: (msg: string) => void): Promise<Blob> {
    onProgress("准备LMB导出...");
    
    // 1. 展平网格
    const meshes: THREE.Mesh[] = [];
    const colors: number[] = [];
    const colorMap = new Map<string, number>();

    root.updateMatrixWorld(true);
    
    // 全局中心处理
    const globalOffset = new THREE.Vector3(0,0,0);
    if(root.userData.originalCenter) globalOffset.copy(root.userData.originalCenter);

    root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && obj.visible) {
            meshes.push(obj as THREE.Mesh);
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            const hex = mat.color ? mat.color.getHex() : 0xffffff;
            if (!colorMap.has(hex.toString())) {
                colorMap.set(hex.toString(), colors.length);
                colors.push(hex);
            }
        }
    });

    const parts: ArrayBuffer[] = [];
    const textEncoder = new TextEncoder();

    // 2. 头部
    const header = new ArrayBuffer(4 * 3 + 4 + 4);
    const headerView = new DataView(header);
    // 位置（使用全局偏移来恢复原始位置）
    headerView.setFloat32(0, globalOffset.x, true);
    headerView.setFloat32(4, globalOffset.y, true);
    headerView.setFloat32(8, globalOffset.z, true);
    headerView.setUint32(12, colors.length, true);
    headerView.setUint32(16, meshes.length, true);
    parts.push(header);

    // 3. 颜色
    const colorsBuffer = new ArrayBuffer(colors.length * 4);
    const colorsView = new DataView(colorsBuffer);
    for(let i=0; i<colors.length; i++) {
        // LMB存储颜色为(r<<16)|(g<<8)|b。THREE.Color.getHex()正好做这个。
        colorsView.setUint32(i * 4, colors[i], true);
    }
    parts.push(colorsBuffer);

    // 4. Nodes
    for (let i = 0; i < meshes.length; i++) {
        const percent = Math.floor((i / meshes.length) * 100);
        if(i % 10 === 0) onProgress(`Encoding mesh ${i+1}/${meshes.length} (${percent}%)`);

        const mesh = meshes[i];
        const geo = mesh.geometry;
        if(!geo.getAttribute('position')) continue;

        const posAttr = geo.getAttribute('position');
        const normAttr = geo.getAttribute('normal');
        const indexAttr = geo.index;
        
        // 名称
        const nameBytes = textEncoder.encode(mesh.name || `Node_${i}`);
        const nameLen = new ArrayBuffer(2);
        new DataView(nameLen).setUint16(0, nameBytes.length, true);
        parts.push(nameLen);
        parts.push(nameBytes.buffer);
        
        // 填充
        const paddingLen = (4 - ((2 + nameBytes.length) % 4)) % 4;
        if(paddingLen > 0) parts.push(new Uint8Array(paddingLen).buffer);

        // 变换（矩阵3x3）+ 位置
        // 如果mesh的matrixWorld中有旋转/缩放，需要分解
        // 但LMB存储3x3矩阵和位置。
        // 我们将旋转*缩放存储在3x3中，位置存储在3f中。
        const m = mesh.matrixWorld;
        const e = m.elements;
        // matrixWorld是列优先：0,1,2（x轴），4,5,6（y轴），8,9,10（z轴），12,13,14（位置）
        // LMB加载器期望矩阵有9个浮点数。
        const matBuf = new ArrayBuffer(9 * 4);
        const matView = new DataView(matBuf);
        // 我们写入旋转/缩放矩阵
        const indices = [0,1,2, 4,5,6, 8,9,10];
        for(let k=0; k<9; k++) matView.setFloat32(k*4, e[indices[k]], true);
        parts.push(matBuf);

        const posBuf = new ArrayBuffer(3 * 4);
        const posView = new DataView(posBuf);
        // 写入相对于根的位置。由于我们将容器移动到原点，matrixWorld位置相对于场景是局部的。
        // 我们已经在头部写入了globalOffset。
        posView.setFloat32(0, e[12], true);
        posView.setFloat32(4, e[13], true);
        posView.setFloat32(8, e[14], true);
        parts.push(posBuf);

        // 压缩参数计算
        // 计算顶点边界框以确定基础和缩放
        let minX=Infinity, minY=Infinity, minZ=Infinity;
        let maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
        
        for(let k=0; k<posAttr.count; k++){
            const x = posAttr.getX(k);
            const y = posAttr.getY(k);
            const z = posAttr.getZ(k);
            if(x<minX) minX=x; if(y<minY) minY=y; if(z<minZ) minZ=z;
            if(x>maxX) maxX=x; if(y>maxY) maxY=y; if(z>maxZ) maxZ=z;
        }
        
        // 处理平面几何
        if(maxX === minX) maxX += 0.001;
        if(maxY === minY) maxY += 0.001;
        if(maxZ === minZ) maxZ += 0.001;

        const rangeX = (maxX - minX);
        const rangeY = (maxY - minY);
        const rangeZ = (maxZ - minZ);
        
        // 我们想要将[min, max]大致映射到int16范围。
        // 加载器逻辑：rx = baseX + qX / scaleX  => qX = (rx - baseX) * scaleX
        // 如果我们映射min->-32000和max->32000
        // 居中它。
        const baseX = (minX + maxX) / 2;
        const baseY = (minY + maxY) / 2;
        const baseZ = (minZ + maxZ) / 2;
        
        // qX范围大约是+/- (范围/2) * 缩放。我们希望这大约是32767。
        // 缩放 = 32767 / (范围/2)
        const scaleX = 32767.0 / (rangeX * 0.5);
        const scaleY = 32767.0 / (rangeY * 0.5);
        const scaleZ = 32767.0 / (rangeZ * 0.5);

        const compressionBuf = new ArrayBuffer(6 * 4);
        const compView = new DataView(compressionBuf);
        // 基础顶点
        compView.setFloat32(0, baseX, true);
        compView.setFloat32(4, baseY, true);
        compView.setFloat32(8, baseZ, true);
        // 缩放
        compView.setFloat32(12, scaleX, true);
        compView.setFloat32(16, scaleY, true);
        compView.setFloat32(20, scaleZ, true);
        parts.push(compressionBuf);

        // 顶点
        const vertCount = posAttr.count;
        const countBuf = new ArrayBuffer(4);
        new DataView(countBuf).setUint32(0, vertCount, true);
        parts.push(countBuf);
        
        // 顶点数据（Int16）
        // 第一个顶点作为浮点数存储在加载器中？
        // 加载器："vertices[0] = baseVertex[0]... for i=0 to count-1... getInt16"
        // 等等，加载器读取baseVertex（浮点数）然后读取count-1个顶点？
        // 让我们检查加载器：
        // const vertices = new Float32Array(vertexCount * 3);
        // vertices[0] = baseVertex[0] ...
        // 循环i=0到vertexCount-2（实际上是count-1次迭代）
        // 这暗示缓冲区中的第一个顶点IS baseVertex？
        // 不。"vertices[0] = baseVertex[0]"。
        // 它使用头部中的`baseVertex`作为网格的第一个顶点。
        // 循环填充vertices[1]到末尾。
        // 这意味着`posAttr`中的第一个顶点必须存储在`baseVertex`槽中？
        // 不，加载器逻辑似乎暗示`baseVertex`是第一个顶点。
        // "const baseVertex = new Float32Array(3) ... 读取3个浮点数"
        // "vertices[0] = baseVertex[0]"
        // 所以我们必须用实际的第一个顶点覆盖计算的中心基础BaseVertex？
        // 如果我们这样做，我们会失去量化的中心效率。
        // 但我们必须遵循加载器规范。
        
        // 仔细重新阅读加载器：
        // const baseVertex = ... 读取浮点数
        // const vertexScale = ... 读取浮点数
        // const vertexCount ...
        // vertices[0] = baseVertex ...
        // 循环i=0; i < vertexCount - 1
        // packed = 读取3 * int16
        // {rx, ry, rz} = 解压缩(baseVertex, vertexScale, packed)
        // vertices[i+1] = rx...
        
        // 所以：
        // 1. 几何体中的第一个顶点作为浮点数存储在"BaseVertex"字段中。
        // 2. 后续顶点作为Int16增量/压缩存储，相对于那个第一个顶点？
        // 解压缩：`rx = baseX + qX / scaleX`。
        // 是的，它是相对于BaseVertex（第一个顶点）的。
        
        // 调整后的逻辑：
        const firstX = posAttr.getX(0);
        const firstY = posAttr.getY(0);
        const firstZ = posAttr.getZ(0);
        
        // 在compressionBuf中重新写入BaseVertex槽位为第一个顶点
        compView.setFloat32(0, firstX, true);
        compView.setFloat32(4, firstY, true);
        compView.setFloat32(8, firstZ, true);
        
        // 基于第一个顶点作为锚点重新计算缩放
        // qX = (x - firstX) * scaleX。
        // 最大增量 = Max(x) - firstX。最小增量 = Min(x) - firstX。
        // 范围大致相同，但偏移不同。
        const maxDeltaX = Math.max(Math.abs(maxX - firstX), Math.abs(minX - firstX));
        const maxDeltaY = Math.max(Math.abs(maxY - firstY), Math.abs(minY - firstY));
        const maxDeltaZ = Math.max(Math.abs(maxZ - firstZ), Math.abs(minZ - firstZ));
        
        // 我们需要 maxDelta * scale <= 32767
        const finalScaleX = maxDeltaX > 0.0001 ? 32767.0 / maxDeltaX : 1;
        const finalScaleY = maxDeltaY > 0.0001 ? 32767.0 / maxDeltaY : 1;
        const finalScaleZ = maxDeltaZ > 0.0001 ? 32767.0 / maxDeltaZ : 1;
        
        compView.setFloat32(12, finalScaleX, true);
        compView.setFloat32(16, finalScaleY, true);
        compView.setFloat32(20, finalScaleZ, true);

        // 写入压缩顶点（跳过第一个）
        const vertDataSize = (vertCount - 1) * 6; // 3 * 2 字节
        const vertBuf = new ArrayBuffer(vertDataSize > 0 ? vertDataSize : 0);
        if (vertDataSize > 0) {
            const vView = new DataView(vertBuf);
            for(let k=1; k<vertCount; k++) {
                const x = posAttr.getX(k);
                const y = posAttr.getY(k);
                const z = posAttr.getZ(k);
                
                // q = (x - firstX) * scaleX
                const qx = Math.round((x - firstX) * finalScaleX);
                const qy = Math.round((y - firstY) * finalScaleY);
                const qz = Math.round((z - firstZ) * finalScaleZ);
                
                const offset = (k-1)*6;
                vView.setInt16(offset, qx, true);
                vView.setInt16(offset+2, qy, true);
                vView.setInt16(offset+4, qz, true);
            }
        }
        parts.push(vertBuf);

        // 法线
        // 加载器期望每个顶点一个法线
        const normBuf = new ArrayBuffer(vertCount * 4);
        const normView = new DataView(normBuf);
        for(let k=0; k<vertCount; k++) {
            let nx = 0, ny = 0, nz = 1;
            if(normAttr) {
                nx = normAttr.getX(k);
                ny = normAttr.getY(k);
                nz = normAttr.getZ(k);
            }
            // 打包法线（加载器逻辑）
            // decodeNormal逻辑：packed = ((x+1)*511/2)<<20 | ((y+1)*511/2)<<10 | ((z+1)*511/2)
            // x,y,z在[-1,1]范围内
            const packNormal = (x:number, y:number, z:number) => {
                const bias = (v:number) => Math.max(0, Math.min(1023, Math.round((v + 1) * 511)));
                return (bias(x) << 20) | (bias(y) << 10) | bias(z);
            };
            normView.setUint32(k*4, packNormal(nx, ny, nz), true);
        }
        parts.push(normBuf);

        // 索引
        const indexCount = indexAttr ? indexAttr.count : vertCount;
        const indexSize = vertCount <= 255 ? 1 : vertCount <= 65535 ? 2 : 4;
        const indexBuf = new ArrayBuffer(indexCount * indexSize);
        const idxView = new DataView(indexBuf);
        
        if(indexAttr) {
            for(let k=0; k<indexCount; k++) {
                const idx = indexAttr.getX(k);
                if(indexSize === 1) idxView.setUint8(k, idx);
                else if(indexSize === 2) idxView.setUint16(k*2, idx, true);
                else idxView.setUint32(k*4, idx, true);
            }
        } else {
            // 没有索引缓冲区，使用顺序的
            for(let k=0; k<indexCount; k++) {
                if(indexSize === 1) idxView.setUint8(k, k);
                else if(indexSize === 2) idxView.setUint16(k*2, k, true);
                else idxView.setUint32(k*4, k, true);
            }
        }
        parts.push(indexBuf);

        // 颜色索引
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const hex = mat.color ? mat.color.getHex() : 0xffffff;
        const colorIdx = colorMap.get(hex.toString()) || 0;
        const colorIdxBuf = new ArrayBuffer(4);
        new DataView(colorIdxBuf).setUint32(0, colorIdx, true);
        parts.push(colorIdxBuf);

        // 实例（现在为0）
        const instBuf = new ArrayBuffer(4);
        new DataView(instBuf).setUint32(0, 0, true);
        parts.push(instBuf);
    }

    onProgress("完成LMB文件...");

    // 组合所有部分
    const totalSize = parts.reduce((sum, buf) => sum + buf.byteLength, 0);
    const finalBuffer = new ArrayBuffer(totalSize);
    const finalView = new Uint8Array(finalBuffer);
    let offset = 0;
    for(const buf of parts) {
        finalView.set(new Uint8Array(buf), offset);
        offset += buf.byteLength;
    }

    return new Blob([finalBuffer], { type: 'application/octet-stream' });
}