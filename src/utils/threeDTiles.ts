import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OctreeNode, OctreeConfig, collectItems, buildOctree, createSceneFromItems } from "./octree";

/**
 * 将LMB格式转换为3D Tiles格式
 * @param root 3D对象根节点
 * @param onProgress 进度回调函数
 * @returns 包含转换后文件的Map
 */
export async function convertLMBTo3DTiles(
  root: THREE.Object3D, 
  onProgress: (msg: string) => void
): Promise<Map<string, Blob>> {
  
  onProgress("分析场景对象...");
  const items = collectItems(root);
  const totalItems = items.length;
  
  if (totalItems === 0) throw new Error("场景中没有找到网格对象");

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
      onProgress(`生成瓦片 (${processedCount}/${tileCount})`);

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