

import * as THREE from "three";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// --- EXISTING 3D TILES LOGIC ---
interface OctreeItem {
  id: string; // geometry_uuid + material_uuid
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrix: THREE.Matrix4; // World matrix
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

// Collect all renderable items from the root object
function collectItems(root: THREE.Object3D): OctreeItem[] {
  const items: OctreeItem[] = [];
  const _v3 = new THREE.Vector3();
  const _m4 = new THREE.Matrix4();

  // Root is likely centered (offset applied), so updateMatrixWorld ensures
  // we capture the visual state (centered at origin).
  // This is good for GLB precision.
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

  // Determine global offset from root user data
  const globalOffset = new THREE.Vector3(0, 0, 0);
  if (root.userData.originalCenter) {
      globalOffset.copy(root.userData.originalCenter);
      console.log("Using global offset for tileset transform:", globalOffset);
  }

  // Dynamic config
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
  // Bounds buffering
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
    // Standard bounding box in tile content space (local/centered)
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

  // Create the transform matrix to place the model back in world coordinates
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
      // Important: GLTFExporter exports in Y-up by default. 
      // We set "Y" here so 3d-tiles-renderer rotates it to Z-up automatically.
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

// Custom LMB Exporter implementation
// This mirrors the LMB Loader structure:
// Header: Pos(3f), ColorCount(u32), NodeCount(u32)
// Colors: u32[]
// Nodes: Name, Matrix(9f), Pos(3f), BaseVert(3f), VertScale(3f), VertCount(u32), Vertices(compressed), Normals(compressed), Indices, ColorIdx, InstCount, Instances...

export async function exportLMB(root: THREE.Object3D, onProgress: (msg: string) => void): Promise<Blob> {
    onProgress("Preparing LMB export...");
    
    // 1. Flatten meshes
    const meshes: THREE.Mesh[] = [];
    const colors: number[] = [];
    const colorMap = new Map<string, number>();

    root.updateMatrixWorld(true);
    
    // Global center handling
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

    // 2. Header
    const header = new ArrayBuffer(4 * 3 + 4 + 4);
    const headerView = new DataView(header);
    // Position (using global offset to restore original position)
    headerView.setFloat32(0, globalOffset.x, true);
    headerView.setFloat32(4, globalOffset.y, true);
    headerView.setFloat32(8, globalOffset.z, true);
    headerView.setUint32(12, colors.length, true);
    headerView.setUint32(16, meshes.length, true);
    parts.push(header);

    // 3. Colors
    const colorsBuffer = new ArrayBuffer(colors.length * 4);
    const colorsView = new DataView(colorsBuffer);
    for(let i=0; i<colors.length; i++) {
        // LMB stores color as (r<<16)|(g<<8)|b. THREE.Color.getHex() does exactly that.
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
        
        // Name
        const nameBytes = textEncoder.encode(mesh.name || `Node_${i}`);
        const nameLen = new ArrayBuffer(2);
        new DataView(nameLen).setUint16(0, nameBytes.length, true);
        parts.push(nameLen);
        parts.push(nameBytes.buffer);
        
        // Padding
        const paddingLen = (4 - ((2 + nameBytes.length) % 4)) % 4;
        if(paddingLen > 0) parts.push(new Uint8Array(paddingLen).buffer);

        // Transform (Matrix 3x3) + Position
        // Decomposition is needed if the mesh has rotation/scale in matrixWorld
        // But LMB stores a 3x3 matrix and a position. 
        // We will store rotation*scale in 3x3, and position in 3f.
        const m = mesh.matrixWorld;
        const e = m.elements;
        // matrixWorld is col-major: 0,1,2 (x axis), 4,5,6 (y axis), 8,9,10 (z axis), 12,13,14 (pos)
        // LMB Loader expects 9 floats for matrix. 
        const matBuf = new ArrayBuffer(9 * 4);
        const matView = new DataView(matBuf);
        // We write rotation/scale matrix
        const indices = [0,1,2, 4,5,6, 8,9,10];
        for(let k=0; k<9; k++) matView.setFloat32(k*4, e[indices[k]], true);
        parts.push(matBuf);

        const posBuf = new ArrayBuffer(3 * 4);
        const posView = new DataView(posBuf);
        // Write position relative to root. Since we moved container to origin, matrixWorld position is local to scene.
        // We already wrote globalOffset in header.
        posView.setFloat32(0, e[12], true);
        posView.setFloat32(4, e[13], true);
        posView.setFloat32(8, e[14], true);
        parts.push(posBuf);

        // Compression Params calculation
        // Compute bounding box of vertices to determine base and scale
        let minX=Infinity, minY=Infinity, minZ=Infinity;
        let maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
        
        for(let k=0; k<posAttr.count; k++){
            const x = posAttr.getX(k);
            const y = posAttr.getY(k);
            const z = posAttr.getZ(k);
            if(x<minX) minX=x; if(y<minY) minY=y; if(z<minZ) minZ=z;
            if(x>maxX) maxX=x; if(y>maxY) maxY=y; if(z>maxZ) maxZ=z;
        }
        
        // Handle flat geometry
        if(maxX === minX) maxX += 0.001;
        if(maxY === minY) maxY += 0.001;
        if(maxZ === minZ) maxZ += 0.001;

        const rangeX = (maxX - minX);
        const rangeY = (maxY - minY);
        const rangeZ = (maxZ - minZ);
        
        // We want to map [min, max] to int16 range roughly.
        // Loader logic: rx = baseX + qX / scaleX  => qX = (rx - baseX) * scaleX
        // If we map min->-32000 and max->32000
        // Center it. 
        const baseX = (minX + maxX) / 2;
        const baseY = (minY + maxY) / 2;
        const baseZ = (minZ + maxZ) / 2;
        
        // qX range is approx +/- (range/2) * scale. We want this to be ~32767.
        // scale = 32767 / (range/2)
        const scaleX = 32767.0 / (rangeX * 0.5);
        const scaleY = 32767.0 / (rangeY * 0.5);
        const scaleZ = 32767.0 / (rangeZ * 0.5);

        const compressionBuf = new ArrayBuffer(6 * 4);
        const compView = new DataView(compressionBuf);
        // BaseVertex
        compView.setFloat32(0, baseX, true);
        compView.setFloat32(4, baseY, true);
        compView.setFloat32(8, baseZ, true);
        // Scale
        compView.setFloat32(12, scaleX, true);
        compView.setFloat32(16, scaleY, true);
        compView.setFloat32(20, scaleZ, true);
        parts.push(compressionBuf);

        // Vertices
        const vertCount = posAttr.count;
        const countBuf = new ArrayBuffer(4);
        new DataView(countBuf).setUint32(0, vertCount, true);
        parts.push(countBuf);
        
        // Vertices Data (Int16)
        // First vertex is stored as float in Loader? 
        // Loader: "vertices[0] = baseVertex[0]... for i=0 to count-1... getInt16"
        // Wait, loader reads baseVertex (float) then reads count-1 vertices?
        // Let's check loader:
        // const vertices = new Float32Array(vertexCount * 3);
        // vertices[0] = baseVertex[0] ...
        // loop i=0 to vertexCount-2 (actually count-1 iterations)
        // This implies the First Vertex in the buffer IS baseVertex? 
        // No. "vertices[0] = baseVertex[0]". 
        // It uses `baseVertex` from header as the FIRST vertex of the mesh.
        // The loop fills vertices[1] to end.
        // This means the FIRST vertex in `posAttr` MUST BE stored in `baseVertex` slot?
        // NO, the loader logic seems to imply `baseVertex` IS the first vertex.
        // "const baseVertex = new Float32Array(3) ... read 3 floats"
        // "vertices[0] = baseVertex[0]"
        // So effectively, we must overwrite the computed center-based BaseVertex with the ACTUAL first vertex?
        // IF we do that, we lose the centering for quantization efficiency.
        // BUT we must follow the loader spec.
        
        // RE-READ LOADER CAREFULLY:
        // const baseVertex = ... read floats
        // const vertexScale = ... read floats
        // const vertexCount ...
        // vertices[0] = baseVertex ...
        // loop i=0; i < vertexCount - 1
        // packed = read 3 * int16
        // {rx, ry, rz} = decompress(baseVertex, vertexScale, packed)
        // vertices[i+1] = rx...
        
        // SO: 
        // 1. The first vertex in geometry is stored as floats in "BaseVertex" field.
        // 2. Subsequent vertices are stored as Int16 deltas/compressed relative to that first vertex?
        // decompress: `rx = baseX + qX / scaleX`.
        // Yes, it's relative to the BaseVertex (First Vertex).
        
        // Adjusted Logic:
        const firstX = posAttr.getX(0);
        const firstY = posAttr.getY(0);
        const firstZ = posAttr.getZ(0);
        
        // Re-write BaseVertex slot in compressionBuf to be First Vertex
        compView.setFloat32(0, firstX, true);
        compView.setFloat32(4, firstY, true);
        compView.setFloat32(8, firstZ, true);
        
        // Recalculate Scale based on First Vertex being the anchor
        // qX = (x - firstX) * scaleX.
        // Max delta = Max(x) - firstX. Min delta = Min(x) - firstX.
        // range is roughly same, but offset differs.
        const maxDeltaX = Math.max(Math.abs(maxX - firstX), Math.abs(minX - firstX));
        const maxDeltaY = Math.max(Math.abs(maxY - firstY), Math.abs(minY - firstY));
        const maxDeltaZ = Math.max(Math.abs(maxZ - firstZ), Math.abs(minZ - firstZ));
        
        // We need maxDelta * scale <= 32767
        const finalScaleX = maxDeltaX > 0.0001 ? 32767.0 / maxDeltaX : 1;
        const finalScaleY = maxDeltaY > 0.0001 ? 32767.0 / maxDeltaY : 1;
        const finalScaleZ = maxDeltaZ > 0.0001 ? 32767.0 / maxDeltaZ : 1;
        
        compView.setFloat32(12, finalScaleX, true);
        compView.setFloat32(16, finalScaleY, true);
        compView.setFloat32(20, finalScaleZ, true);

        // Write Compressed Vertices (Skipping the first one)
        const vertDataSize = (vertCount - 1) * 6; // 3 * 2 bytes
        const vertBuf = new ArrayBuffer(vertDataSize > 0 ? vertDataSize : 0);
        if (vertDataSize > 0) {
            const vView = new DataView(vertBuf);
            for(let k=1; k<vertCount; k++) {
                const x = posAttr.getX(k);
                const y = posAttr.getY(k);
                const z = posAttr.getZ(k);
                
                // q = (val - base) * scale
                const qx = Math.round((x - firstX) * finalScaleX);
                const qy = Math.round((y - firstY) * finalScaleY);
                const qz = Math.round((z - firstZ) * finalScaleZ);
                
                const offset = (k-1)*6;
                vView.setInt16(offset, qx, true);
                vView.setInt16(offset+2, qy, true);
                vView.setInt16(offset+4, qz, true);
            }
            parts.push(vertBuf);
        }

        // Padding
        if (vertDataSize % 4 !== 0) {
             const pad = 4 - (vertDataSize % 4);
             parts.push(new Uint8Array(pad).buffer);
        }

        // Normals (Compressed)
        // 32 bit int per normal. 10 bits each component.
        const normBuf = new ArrayBuffer(vertCount * 4);
        const normView = new DataView(normBuf);
        for(let k=0; k<vertCount; k++) {
             let nx = normAttr ? normAttr.getX(k) : 0;
             let ny = normAttr ? normAttr.getY(k) : 0;
             let nz = normAttr ? normAttr.getZ(k) : 1;
             
             // Normalize to be safe
             const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
             if(len>0) { nx/=len; ny/=len; nz/=len; }
             
             // Loader: x = (packed >> 20) & 0x3ff. 
             // maps 0..511 -> 0..511. 512..1023 -> -512..-1.
             // Encode: round(n * 511). Mask 0x3FF.
             const ix = Math.round(nx * 511) & 0x3FF;
             const iy = Math.round(ny * 511) & 0x3FF;
             const iz = Math.round(nz * 511) & 0x3FF;
             
             const packed = (ix << 20) | (iy << 10) | iz;
             normView.setUint32(k*4, packed, true);
        }
        parts.push(normBuf);

        // Indices
        const idxCount = indexAttr ? indexAttr.count : 0;
        const idxCountBuf = new ArrayBuffer(4);
        new DataView(idxCountBuf).setUint32(0, idxCount, true);
        parts.push(idxCountBuf);

        if (idxCount > 0) {
            // Determine size based on vertex count, same as Loader logic
            let bpe = 4;
            if (vertCount <= 255) bpe = 1;
            else if (vertCount <= 65535) bpe = 2;
            
            const idxBuf = new ArrayBuffer(idxCount * bpe);
            const idxView = new DataView(idxBuf);
            for(let k=0; k<idxCount; k++) {
                const val = indexAttr!.getX(k);
                if(bpe===1) idxView.setUint8(k, val);
                else if(bpe===2) idxView.setUint16(k*bpe, val, true);
                else idxView.setUint32(k*bpe, val, true);
            }
            parts.push(idxBuf);
            
            // Padding
            const byteSize = idxCount * bpe;
            if(byteSize % 4 !== 0) parts.push(new Uint8Array(4 - (byteSize % 4)).buffer);
        }

        // Color Index
        const colorHex = (mesh.material as THREE.MeshStandardMaterial).color.getHex().toString();
        const cIdx = colorMap.get(colorHex) || 0;
        const cIdxBuf = new ArrayBuffer(4);
        new DataView(cIdxBuf).setUint32(0, cIdx, true);
        parts.push(cIdxBuf);

        // Instance Count (Exporting as flat mesh for now, so 0 instances)
        // If we wanted to support instances we would need to group by geometry UUID first.
        const instCountBuf = new ArrayBuffer(4);
        new DataView(instCountBuf).setUint32(0, 0, true);
        parts.push(instCountBuf);
    }
    
    onProgress("Building final LMB file...");
    return new Blob(parts, { type: 'application/octet-stream' });
}
