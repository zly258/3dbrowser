import * as THREE from "three";
interface OctreeItem {
    id: string;
    uuid: string;
    expressID?: number;
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    color: number;
    matrix: THREE.Matrix4;
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
export declare function calculateGeometryMemory(geometry: THREE.BufferGeometry): number;
/**
 * 几何体标准化处理（对齐 refs 逻辑）
 * 强制转换为标准 BufferGeometry，处理 InterleavedBufferAttributes 等复杂情况
 * 这是解决“块加载不全”和 BatchedMesh 兼容性的关键
 */
export declare function sanitizeGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry;
/**
 * 从根对象收集所有可渲染项
 * @param root 根对象
 * @returns 可渲染项数组
 */
declare function collectItems(root: THREE.Object3D): OctreeItem[];
/**
 * 构建八叉树
 * @param items 可渲染项数组
 * @param bounds 边界框
 * @param config 八叉树配置
 * @param level 当前层级
 * @returns 八叉树节点
 */
declare function buildOctree(items: OctreeItem[], bounds: THREE.Box3, config: OctreeConfig, level?: number): OctreeNode;
/**
 * 从项数组创建场景
 * @param items 可渲染项数组
 * @returns 创建的场景
 */
declare function createSceneFromItems(items: OctreeItem[]): THREE.Scene;
/**
 * 从项数组创建 BatchedMesh
 * @param items 可渲染项数组
 * @param material 材质
 * @returns 创建的 BatchedMesh
 */
declare function createBatchedMeshFromItems(items: OctreeItem[], material: THREE.Material): THREE.BatchedMesh | null;
/**
 * 将八叉树转换为一组 BatchedMesh 节点
 * @param node 八叉树节点
 * @param material 共享材质（通常 BIM 模型可以使用一个 StandardMaterial）
 * @param group 结果组
 */
declare function convertOctreeToBatchedMeshes(node: OctreeNode, material: THREE.Material, group: THREE.Group): void;
/**
 * 收集所有叶子节点
 */
export declare function collectLeafNodes(node: OctreeNode, leaves?: OctreeNode[]): OctreeNode[];
/**
 * 导出内部接口以便在其他文件中使用
 */
export type { OctreeItem, OctreeNode, OctreeConfig };
/**
 * 导出内部函数以便在其他文件中使用
 */
export { collectItems, buildOctree, createSceneFromItems, createBatchedMeshFromItems, convertOctreeToBatchedMeshes };
