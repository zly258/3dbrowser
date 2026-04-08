# NBIM 格式规范（V8）

NBIM 是本项目用于大规模模型按需加载的分块二进制格式。本文档描述当前仓库实际实现的 V8 读写约定，不定义跨版本兼容策略。

---

## 文件布局

```text
[固定头 1024 字节]
[chunk_0 二进制块]
[chunk_1 二进制块]
...
[chunk_N 二进制块]
[Manifest JSON（UTF-8）]
```

- 文件魔数固定为 `NBIM`
- 版本号固定为 `8`
- Manifest 永远位于所有 chunk 数据之后

---

## 1. 固定头（1024 bytes）

| 偏移 | 类型 | 含义 |
| --- | --- | --- |
| 0 | `uint32LE` | 魔数 `0x4D49424E`（ASCII: `NBIM`） |
| 4 | `uint32LE` | 版本号，当前固定为 `8` |
| 8 | `uint32LE` | Manifest 起始偏移，基于文件起点 |
| 12 | `uint32LE` | Manifest 字节长度 |
| 16-1023 | 保留 | 当前填 `0` |

读取端必须先校验魔数和版本；当前实现只接受 V8。

---

## 2. Chunk 二进制块（V8）

每个 chunk 独立编码，顺序固定为 Geometry 段后接 Instance 段。

### 2.1 Geometry 段

```text
uint32LE geometryCount
```

随后写入 `geometryCount` 个 geometry，结构如下：

```text
uint32LE vertexCount
uint32LE indexCount
float32LE[vertexCount * 3] positions
float32LE[vertexCount * 3] normals
uint32LE[indexCount] indices   // 仅 indexCount > 0 时存在
```

- `positions` 与 `normals` 都按 XYZ 连续写入
- `indices` 为 `uint32LE`
- geometry 在 chunk 内部去重，instance 通过 `geometryIndex` 引用

### 2.2 Instance 段

```text
uint32LE instanceCount
```

随后写入 `instanceCount` 个 instance，结构如下：

```text
uint32LE bimIdIndex
uint32LE typeIndex
uint32LE color
float32LE[16] matrix
uint32LE geometryIndex
```

字段说明：

- `bimIdIndex`：引用 `manifest.bimIdTable`
- `typeIndex`：当前保留给构件类型索引，默认 `0`
- `color`：32 位整型颜色值，当前实现按 `uint32LE` 读写
- `matrix`：`THREE.Matrix4.elements` 的列主序 16 元素矩阵
- `geometryIndex`：引用本 chunk 的 geometry 数组索引

---

## 3. Manifest（JSON, UTF-8）

Manifest 位于头部 `manifestOffset` 指定的位置，长度为 `manifestLength`。

### 3.1 顶层结构

```jsonc
{
  "globalBounds": {
    "min": { "x": number, "y": number, "z": number },
    "max": { "x": number, "y": number, "z": number }
  },
  "chunks": [/* ChunkEntry[] */],
  "stats": { /* StatsEntry，可选 */ },
  "structureTree": { /* StructureTreeNode */ },
  "bimIdTable": [/* string[] */],
  "bimProperties": { /* Record<string, BimPropertyEntry> */ }
}
```

### 3.2 ChunkEntry

```jsonc
{
  "id": string,
  "bounds": {
    "min": { "x": number, "y": number, "z": number },
    "max": { "x": number, "y": number, "z": number }
  },
  "byteOffset": number,
  "byteLength": number,
  "originalUuid"?: string
}
```

- `byteOffset` / `byteLength` 指向文件中的原始 chunk 二进制范围
- `originalUuid` 用于多模型场景下标识归属

### 3.3 StructureTreeNode

```jsonc
{
  "id": string,
  "name": string,
  "type": "Mesh" | "Group",
  "visible": boolean,
  "children": [/* StructureTreeNode[] */],
  "bimId"?: string,
  "chunkId"?: string,
  "userData"?: {
    "originalUuid"?: string,
    "expressID"?: number,
    "modelID"?: number
  }
}
```

约束说明：

- `id` 是运行期唯一节点标识，不应被简化理解为“mesh name”
- 导出端必须保证 `structureTree` 全局唯一性
- 读取端的节点映射、定位、属性索引都依赖这个唯一 `id`
- `userData.originalUuid` 用于多模型归属和属性 owner 分组

### 3.4 bimIdTable

`bimIdTable[0]` 固定为空字符串：

```jsonc
["", "Wall_001", "Column_A"]
```

instance 通过 `bimIdIndex` 引用该表；读取端会将索引还原为字符串 `bimId`。

### 3.5 bimProperties

键格式固定为：

```text
<originalUuid>::<bimId>
```

示例：

```jsonc
{
  "modelA::Wall_001": {
    "uuid": "node_xxx",
    "name": "Wall_001",
    "ifcType": "IfcWall",
    "globalId": "2$abc",
    "ifcName": "Basic Wall",
    "ifcRawGroups": {},
    "ifcNormalizedGroups": {}
  }
}
```

加载时会按 key 中的 owner 部分，也就是 `<originalUuid>`，分组写入运行时属性索引。

### 3.6 stats（可选）

```jsonc
{
  "meshes": number,
  "faces": number,
  "memory": number
}
```

- 用于快速统计展示
- 加载端可直接采用
- 若缺失，运行时可回退为估算值

---

## 4. 读取流程

1. 读取固定头，校验魔数和版本。
2. 根据 `manifestOffset` 与 `manifestLength` 读取 Manifest。
3. 使用 `globalBounds` 初始化全局包围盒与偏移状态。
4. 将 `structureTree` 追加到运行时结构树，并建立节点映射。
5. 解析 `bimProperties`，按 `<originalUuid>` 分组到运行时属性索引。
6. 按 `chunks[].byteOffset` / `byteLength` 按需读取 chunk。
7. Worker 解析 chunk 后重建 `BatchedMesh`，并按 `bimId` 与 `originalUuid` 建立实例映射。

---

## 5. 导出流程

1. 遍历结构树收集全部 `bimId`，构建 `bimIdTable`，索引 `0` 固定留空。
2. 对每个 chunk 去重 geometry，并按 V8 顺序写出二进制块。
3. 序列化 `structureTree`，保留 `bimId`、`chunkId` 与受限 `userData`。
4. 采集 IFC/NBIM 属性，生成 `bimProperties`。
5. 组装 Manifest。
6. 拼接 `1024` 字节头、全部 chunk、Manifest，输出 `.nbim` 文件。

---

## 6. 实现约束与非目标

- 当前实现仅支持 NBIM V8。
- 不定义 V8 之外版本的兼容读取策略。
- 本文档描述当前仓库实现，不承诺第三方独立实现之间的向后兼容。
- `typeIndex` 当前已编码，但未形成完整公开语义规范。
- chunk 内 geometry 去重是实现约束的一部分，不应假定 instance 总是独占 geometry。

---

## 7. 参考实现

- `src/utils/scene-manager/SceneManager.ts`
  - `generateChunkBinaryV8`
  - `exportNbim`
  - `loadNbim`
- `src/utils/scene-manager/nbim.ts`
  - Manifest 编码
  - 属性分组
  - chunk 导出辅助逻辑
- `src/utils/chunkWorker.ts`
  - `parseChunkBinaryV8`
- `src/utils/scene-core/nbimIO.ts`
  - 文件头与 Manifest 读取
