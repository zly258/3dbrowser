# NBIM 格式规范（V8）

NBIM 是本项目自研的高性能分块模型格式，支持大规模模型（十万级构件以上）按需加载。

---

## 文件整体布局

```
[固定头 1024 字节]
[chunk_0 二进制块]
[chunk_1 二进制块]
...
[chunk_N 二进制块]
[Manifest JSON（UTF-8）]
```

---

## 1. 固定头（1024 bytes）

| 偏移 | 类型 | 说明 |
|------|------|------|
| 0 | `uint32LE` | 魔数 `0x4D49424E`（ASCII: `NBIM`） |
| 4 | `uint32LE` | 版本号，当前固定为 `8` |
| 8 | `uint32LE` | Manifest 起始偏移（从文件头部 byte 0 起算） |
| 12 | `uint32LE` | Manifest 字节长度 |
| 16–1023 | — | 保留，填 0 |

---

## 2. Chunk 二进制块（V8）

每个 chunk 是独立的二进制段，按以下顺序编码：

### 2.1 Geometry 段

```
uint32LE  geometryCount
```

对每个 geometry（共 `geometryCount` 个）：

```
uint32LE  vertCount
uint32LE  indexCount
float32LE[vertCount * 3]  positions   // XYZ 逐顶点
float32LE[vertCount * 3]  normals     // XYZ 逐顶点
uint32LE[indexCount]      indices     // 仅当 indexCount > 0 时存在
```

### 2.2 Instance 段

```
uint32LE  instanceCount
```

对每个 instance（共 `instanceCount` 个）：

```
uint32LE     bimIdIndex    // 对应 manifest.bimIdTable 的索引，0 表示空
uint32LE     typeIndex     // 构件类型索引，默认 0
uint32LE     packedColor   // 0xRRGGBB 或 0xAARRGGBB 32 位整型
float32LE[16] matrix       // 4×4 变换矩阵，THREE.Matrix4.elements 列主序
uint32LE     geoIdx        // 引用本 chunk geometry 数组中的索引
```

---

## 3. Manifest（JSON，UTF-8）

位于 `header[8]` 偏移处，长度为 `header[12]` 字节。

### 顶层字段

```jsonc
{
  "globalBounds": {
    "min": { "x": number, "y": number, "z": number },
    "max": { "x": number, "y": number, "z": number }
  },
  "chunks": [ /* ChunkEntry[] */ ],
  "structureTree": { /* StructureTreeNode */ },
  "bimIdTable": [ /* string[] */ ],
  "bimProperties": { /* Record<string, BimPropertyEntry> */ },
  "stats": { /* StatsEntry，可选 */ }
}
```

### ChunkEntry

```jsonc
{
  "id": string,           // chunk 唯一标识
  "bounds": {
    "min": { "x": number, "y": number, "z": number },
    "max": { "x": number, "y": number, "z": number }
  },
  "byteOffset": number,   // 本 chunk 在文件中的起始字节偏移
  "byteLength": number,   // 本 chunk 字节长度
  "originalUuid"?: string // 所属原始模型标识（可选）
}
```

### StructureTreeNode

节点 `id` 使用 mesh/group 的名称，重复时自动追加 `_2`、`_3` 等后缀，保证全局唯一。

```jsonc
{
  "id": string,           // 节点唯一 ID（来自 mesh name，重复加后缀）
  "name": string,         // 显示名称
  "type": "Mesh" | "Group",
  "visible": boolean,
  "children": [ /* StructureTreeNode[] */ ],
  "bimId"?: string,       // BIM 构件 ID（可选）
  "chunkId"?: string,     // 所属 chunk ID（可选）
  "userData"?: {
    "originalUuid"?: string,
    "expressID"?: number,
    "modelID"?: number
  }
}
```

### bimIdTable

全局 BIM ID 字符串表，索引 0 固定为空字符串 `""`，instance 通过 `bimIdIndex` 引用。

```jsonc
["", "Wall_001", "Column_A", ...]
```

### bimProperties

以 `"<originalUuid>::<bimId>"` 为键存储构件属性。

```jsonc
{
  "<originalUuid>::<bimId>": {
    "uuid": string,
    "name": string,
    "ifcType"?: string,
    "globalId"?: string,
    "ifcName"?: string,
    "ifcRawGroups"?: Record<string, Record<string, string>>,
    "ifcNormalizedGroups"?: Record<string, Record<string, string>>
  }
}
```

### StatsEntry（可选）

```jsonc
{
  "meshes": number,
  "faces": number,
  "memory": number   // MB
}
```

---

## 4. 读取流程

1. 读取前 1024 字节，校验魔数 `0x4D49424E` 和版本 `8`。
2. 按 `header[8]` 和 `header[12]` 读取并解析 Manifest JSON。
3. 从 `manifest.structureTree` 构建节点树，以节点 `id` 为键建立 `nodeMap`。
4. 从 `manifest.bimProperties` 直接存入 `nbimPropsByOriginalUuid`，键为 `originalUuid`。
5. 按需加载 chunk：根据视锥体裁剪，按 `byteOffset`/`byteLength` 读取对应二进制段，送入 Worker 解码。
6. 解码后生成 `BatchedMesh`，按 `originalUuid::bimId` 建立属性索引。

---

## 5. 导出流程

1. 遍历场景节点，收集所有 `bimId` 构建 `bimIdTable`（去重，0 号为空）。
2. 按 octree 分块，每块调用 `generateChunkBinaryV8` 生成二进制。
3. 序列化 `structureTree`：节点 `id` 取 mesh name，全局去重（重复加 `_N` 后缀）。
4. 收集 `bimProperties`，键格式为 `"<originalUuid>::<bimId>"`。
5. 拼接：1024 字节头 + 各 chunk 二进制 + Manifest JSON，输出 `.nbim`。

---

## 6. 版本说明

- 当前仅支持 V8，其他版本直接抛错。
- 参考实现：
  - `src/utils/SceneManager.ts`：`generateChunkBinaryV8`、`exportNbim`、`loadNbim`
  - `src/utils/chunkWorker.ts`：`parseChunkBinaryV8`
