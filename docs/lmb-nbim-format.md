# LMB 与 NBIM 文件格式说明

本文档基于当前项目代码实现整理，目标是说明本仓库实际读写的 `LMB` 和 `NBIM` 文件结构，而不是抽象的外部标准。内容主要来自以下实现：

- `src/loader/lmbLoader.ts`
- `src/utils/exportLMB.ts`
- `src/utils/SceneManager.ts`
- `src/utils/chunkWorker.ts`

如果未来代码变更，本文档应以实现为准同步更新。

## 1. 总览

### 1.1 LMB 的定位

`LMB` 是本项目的自定义单文件几何格式，特点是：

- 单个文件内直接存储几何、法线、颜色表和实例数据
- 面向快速本地加载
- 支持顶点压缩和实例化
- 当前项目只支持读取 `.lmb`，明确不支持 `.lmbz`

从实现看，`LMB` 更像“轻量几何快照格式”，不强调复杂 BIM 属性，也不保存完整场景树。

### 1.2 NBIM 的定位

`NBIM` 是本项目的高性能分块格式，特点是：

- 固定 1024 字节头部
- 多个 chunk 二进制块
- 尾部 JSON manifest
- 支持按需加载和延迟解析
- 保存结构树、包围盒、统计信息、BIM ID 表和属性映射

从实现看，`NBIM` 是面向大模型流式浏览的内部交换格式。

## 2. LMB 格式

## 2.1 文件级结构

`LMB` 文件按顺序由以下部分组成：

1. 文件头
2. 颜色表
3. 节点列表

没有 magic number，没有版本字段，也没有文件尾索引表。加载器完全依赖固定顺序顺读。

## 2.2 字节序

`LMB` 所有数值字段都按 little-endian 读取和写入。

## 2.3 文件头

来自 `src/loader/lmbLoader.ts` 的 `parse` 与 `src/utils/exportLMB.ts` 的写入逻辑，头部结构如下：

| 偏移 | 类型 | 字段 | 说明 |
|---|---|---|---|
| 0 | `float32[3]` | `position` | 根节点位置 / 全局偏移 |
| 12 | `uint32` | `colorCount` | 颜色表数量 |
| 16 | `uint32` | `nodeCount` | 节点数量 |

总长度固定为 20 字节。

说明：

- 加载时会创建一个名为 `LMB_Root` 的 `THREE.Group`
- 头部 `position` 会写入 `root.position`
- 导出时这里通常写 `root.userData.originalCenter`

## 2.4 颜色表

头部之后紧跟颜色表：

| 类型 | 数量 | 字段 |
|---|---|---|
| `uint32` | `colorCount` | 颜色值 |

颜色编码是 `0xRRGGBB`，即：

- 高 8 位是 `R`
- 中 8 位是 `G`
- 低 8 位是 `B`

实现中 `parseColor` 实际上只是重新组装了同样的 `RGB` 顺序，因此可以直接视为标准 `THREE.Color.getHex()` 的存储结果。

## 2.5 节点结构

每个节点顺序写入一次，节点总数由 `nodeCount` 指定。

### 2.5.1 节点头

| 顺序 | 类型 | 字段 | 说明 |
|---|---|---|---|
| 1 | `uint16` | `nameLength` | 名称字节长度 |
| 2 | `uint8[nameLength]` | `name` | UTF-8 编码 |
| 3 | padding | 名称对齐 | 补到 4 字节边界 |
| 4 | `float32[9]` | `matrix` | 3x3 旋转缩放矩阵 |
| 5 | `float32[3]` | `position` | 节点平移 |
| 6 | `float32[3]` | `baseVertex` | 顶点压缩基点 |
| 7 | `float32[3]` | `vertexScale` | 顶点反量化缩放参数 |

这里的 `matrix` 不是完整 `Matrix4`，而是 3x3 的旋转乘缩放矩阵；平移单独存成 `position`。

加载器通过 `composeMatrixByMatrix3` 恢复为 `THREE.Matrix4`。

### 2.5.2 顶点区

| 顺序 | 类型 | 字段 | 说明 |
|---|---|---|---|
| 1 | `uint32` | `vertexCount` | 顶点数量 |
| 2 | 基点隐式存在 | 顶点 0 | 直接使用 `baseVertex` |
| 3 | `int16[3] * (vertexCount - 1)` | 其余顶点 | 量化偏移值 |
| 4 | padding | 顶点区对齐 | 补到 4 字节边界 |

顶点解码公式见 `decompressVertice`：

```text
rx = baseX + qX / scaleX
ry = baseY + qY / scaleY
rz = baseZ + qZ / scaleZ
```

这意味着：

- 第一个顶点不压缩，作为基准点
- 其他顶点以 `int16` 形式存储相对偏移
- `vertexScale` 实际上是“量化乘子”

### 2.5.3 法线区

法线数量固定等于顶点数量：

| 类型 | 数量 | 字段 |
|---|---|---|
| `uint32` | `vertexCount` | 每个顶点一个打包法线 |

编码为 10-10-10 bit signed packed normal：

- X 占高 10 位
- Y 占中间 10 位
- Z 占低 10 位

实现常量：

- 掩码：`0x3ff`
- 符号阈值：`512`
- 负数偏移：`1024`
- 归一化比例：`1 / 511`

解码后会再做一次单位化。

### 2.5.4 索引区

| 顺序 | 类型 | 字段 | 说明 |
|---|---|---|---|
| 1 | `uint32` | `indexCount` | 索引数 |
| 2 | `uint8[] / uint16[] / uint32[]` | indices | 按顶点数自动选位宽 |
| 3 | padding | 条件对齐 | 当索引位宽小于 4 字节时补齐 |

索引位宽规则：

- `vertexCount <= 255` 时用 `uint8`
- `vertexCount <= 65535` 时用 `uint16`
- 否则用 `uint32`

这是 `LMB` 一个非常重要的空间优化点。

### 2.5.5 材质和实例区

| 顺序 | 类型 | 字段 | 说明 |
|---|---|---|---|
| 1 | `uint32` | `colorIndex` | 指向文件颜色表 |
| 2 | `uint32` | `instanceCount` | 附加实例数量 |
| 3 | repeated | `instances` | 每个实例一段 |

实例结构：

| 顺序 | 类型 | 字段 |
|---|---|---|
| 1 | `uint16` | `instanceNameLength` |
| 2 | `uint8[]` | `instanceName` UTF-8 |
| 3 | padding | 4 字节对齐 |
| 4 | `float32[9]` | 实例 3x3 变换矩阵 |
| 5 | `float32[3]` | 实例位置 |
| 6 | `uint32` | `instanceColorIndex` |

## 2.6 LMB 在当前项目中的语义

### 2.6.1 一个节点对应一个几何体

当前导出器会把场景里每个可见 `THREE.Mesh` 当成一个 LMB 节点导出。结构树父子关系不会被保留成层次，只保留为线性节点列表。

### 2.6.2 InstancedMesh 的处理方式

当前导出器对 `THREE.InstancedMesh` 的策略是：

- 第 0 个实例视为“基础节点”
- 从第 1 个实例开始写入 `instanceCount`
- 附加实例默认沿用基础颜色

这意味着：

- `LMB` 能表达实例化
- 但当前导出实现没有完整保留每实例独立材质体系

### 2.6.3 结构信息有限

当前 `LMB` 不保存：

- scene tree 父子层级
- BIM 属性表
- 包围盒表
- 文件版本
- magic

因此它更适合“轻量显示缓存”，不适合复杂 BIM 流式场景管理。

## 2.7 LMB 导入后的 three.js 映射

加载器会将每个节点恢复为：

- 无实例时：`THREE.Mesh`
- 有实例时：`THREE.InstancedMesh`

并统一挂到 `LMB_Root` 下。

同时会生成：

- `geometry.userData.expressID`
- `geometry.userData.bimId`
- `mesh.userData.expressID`
- `mesh.userData.bimId`

这些 ID 不是从文件中读取，而是加载时从 `1000000` 开始递增生成。

## 2.8 LMB 已知限制

基于当前实现，`LMB` 有这些限制：

- 不支持 `.lmbz`
- 无文件版本，向后兼容能力弱
- 无 magic，文件识别依赖扩展名和读取成功
- 不保留完整结构树
- 不保留复杂多材质
- 不保留 BIM 属性
- 导出时假定 mesh 有 `position`，并默认期望存在 `normal`

## 3. NBIM 格式

## 3.1 文件级结构

`NBIM` 文件按顺序由以下三段组成：

1. 固定 1024 字节头部
2. 多个 chunk 二进制块
3. 一个 JSON manifest

其中头部记录 manifest 的偏移和长度。

## 3.2 文件头

头部由 `SceneManager.exportNbim` 写入，布局如下：

| 偏移 | 类型 | 字段 | 说明 |
|---|---|---|---|
| 0 | `uint32` | `magic` | 固定为 `0x4D49424E` |
| 4 | `uint32` | `version` | 当前导出版本固定为 `8` |
| 8 | `uint32` | `manifestOffset` | manifest 起始偏移 |
| 12 | `uint32` | `manifestLength` | manifest 字节长度 |
| 16..1023 | reserved | 预留 | 当前未使用 |

注意：

- `0x4D49424E` 是按 little-endian 写入的 `'NBIM'`
- 当前项目读取时固定先读前 1024 字节

## 3.3 整体布局

```text
[1024-byte header]
[chunk 0 binary]
[chunk 1 binary]
...
[chunk N binary]
[manifest JSON bytes]
```

`currentOffset` 初始值固定为 `1024`，每写一个 chunk，就把该 chunk 的 `byteOffset` 和 `byteLength` 记入 manifest。

## 3.4 manifest JSON 结构

当前项目导出的 manifest 主要包含：

```ts
{
  globalBounds,
  chunks,
  stats,
  structureTree,
  bimIdTable,
  bimProperties
}
```

### 3.4.1 globalBounds

场景整体包围盒：

```ts
{
  min: { x, y, z },
  max: { x, y, z }
}
```

加载时：

- 用它恢复 `sceneBounds`
- 如果 `globalOffset` 尚未设置，会取其中心作为全局偏移

### 3.4.2 chunks

每个 chunk 的元数据结构：

```ts
{
  id: string,
  bounds: {
    min: { x, y, z },
    max: { x, y, z }
  },
  byteOffset: number,
  byteLength: number
}
```

说明：

- `bounds` 是世界空间包围盒
- 载入后会根据 `globalOffset` 平移到局部空间
- `byteOffset/byteLength` 指向 chunk 二进制块

### 3.4.3 stats

当前导出时直接写 `this.originalStats`，一般包括：

```ts
{
  meshes: number,
  faces: number,
  memory: number
}
```

如果文件里没有 `stats`，加载器会在后台遍历 chunk 重新估算。

### 3.4.4 structureTree

这是 `NBIM` 最重要的高层语义结构，直接保存了项目内部的 `StructureTreeNode`：

```ts
interface StructureTreeNode {
  id: string;
  name: string;
  type: 'Mesh' | 'Group';
  children?: StructureTreeNode[];
  bimId?: string;
  chunkId?: string;
  visible?: boolean;
  userData?: any;
}
```

导出时会做一次裁剪，只保留有限 `userData`：

- `originalUuid`
- `expressID`
- `modelID`

加载时会：

- 合并进全局 `structureRoot`
- 回填 `originalUuid`
- 建立 `nodeMap`
- 建立 `bimId -> nodeId` 索引

### 3.4.5 bimIdTable

这是 V8 引入的字符串表，用来压缩实例中的 `bimId`。

规则：

- 第 0 项固定是空字符串 `""`
- 后续项按遍历 structure tree 时首次出现顺序追加
- chunk 实例中不再写完整字符串，而是写 `bimIdIndex`

### 3.4.6 bimProperties

当前项目把 BIM 属性表保存为：

```ts
Record<string, any>
```

key 格式为：

```text
${originalUuid}::${bimId}
```

value 当前可能包括：

- `uuid`
- `name`
- `ifcType`
- `globalId`
- `ifcName`

这些属性来自 structure tree 和 IFC API 的补充提取。

## 3.5 NBIM Chunk 二进制结构

当前项目统一导出为 V8 chunk，布局来自 `generateChunkBinaryV8`。

一个 chunk 二进制块结构如下：

1. 几何体表
2. 实例表

### 3.5.1 几何体表头

| 顺序 | 类型 | 字段 |
|---|---|---|
| 1 | `uint32` | `geoCount` |

### 3.5.2 每个几何体的布局

| 顺序 | 类型 | 字段 | 说明 |
|---|---|---|---|
| 1 | `uint32` | `vertCount` | 顶点数 |
| 2 | `uint32` | `indexCount` | 索引数 |
| 3 | `float32[vertCount * 3]` | positions | 顶点坐标 |
| 4 | `float32[vertCount * 3]` | normals | 法线 |
| 5 | `uint32[indexCount]` | indices | 若 `indexCount > 0` 才存在 |

特点：

- 不做压缩
- 不做 1/2/4 字节索引优化
- 索引统一写 `uint32`

### 3.5.3 实例表头

| 顺序 | 类型 | 字段 |
|---|---|---|
| 1 | `uint32` | `instanceCount` |

### 3.5.4 V8 实例记录布局

| 顺序 | 类型 | 字段 | 说明 |
|---|---|---|---|
| 1 | `uint32` | `bimIdIndex` | 指向 `bimIdTable` |
| 2 | `uint32` | `typeIndex` | 构件类型枚举 |
| 3 | `uint32` | `color` | `0xRRGGBB` |
| 4 | `float32[16]` | matrix | 完整 4x4 变换矩阵 |
| 5 | `uint32` | `geoIdx` | 指向本 chunk 几何体表 |

每条实例记录固定 80 字节。

### 3.5.5 V7 与 V8 差异

Worker 里同时支持 V7/V8：

- V7：第一字段是 `bimIdNum`
- V8：第一字段是 `bimIdIndex`

其余字段布局相同：

- `typeIndex`
- `color`
- `matrix`
- `geoIdx`

当前导出固定写 V8，但加载器仍兼容旧 V7 文件。

## 3.6 typeIndex 的当前约定

`typeIndex` 不是 IFC 标准枚举，而是项目内部约定：

| 值 | 类型 |
|---|---|
| 0 | `Generic` |
| 1 | `Column` |
| 2 | `Beam` |
| 3 | `Slab` |
| 4 | `Wall` |
| 5 | `Window` |
| 6 | `Door` |
| 7 | `Pipe` |
| 8 | `Duct` |

如果没有显式类型，导出时会根据节点名称做一个简单猜测：

- 包含 `col` 或 `柱` -> `Column`
- 包含 `beam` 或 `梁` -> `Beam`
- 包含 `slab` 或 `板` -> `Slab`
- 包含 `wall` 或 `墙` -> `Wall`
- 包含 `window` 或 `窗` -> `Window`
- 包含 `door` 或 `门` -> `Door`
- 否则 -> `Generic`

## 3.7 NBIM 的加载流程

基于当前实现，加载流程如下：

1. 读取前 1024 字节头部
2. 校验 `magic == 0x4D49424E`
3. 读取 `version`
4. 根据 `manifestOffset + manifestLength` 取出 manifest JSON
5. 恢复 `globalBounds` / `structureTree` / `bimProperties`
6. 只注册 chunk 元数据，不立刻读所有 chunk
7. 根据视锥和加载策略按需读取 chunk
8. 把 chunk 二进制交给 `chunkWorker.ts`
9. Worker 解析几何体和实例
10. 主线程重建 `THREE.BatchedMesh`

这套设计说明：

- `NBIM` 是“元数据先行，几何延后”的格式
- 很适合大体量模型的按需浏览