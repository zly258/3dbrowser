NBIM 是本项目自研的高性能分块模型格式，核心目标是支持大规模模型（十万级构件以上）并按需加载。以下以本仓库实现为准，给出完整二进制结构和语义定义。

# NBIM 文件结构（V8）

文件可分为：固定头（1024 字节）+ N 个 `chunk` 二进制块 + JSON manifest。

## 固定头（1024 bytes）
- offset 0: `uint32LE` 魔数 `NBIM` (0x4D49424E)
- offset 4: `uint32LE` 版本号（当前仅支持 `8`）
- offset 8: `uint32LE` manifest 起始偏移（从文件头部起算）
- offset 12: `uint32LE` manifest 长度字节数
- offset 16-1023: 保留（可填 0）

## chunk 二进制块（V8 解析/生成一致）
每个 chunk 数据独立，按以下格式编码：

1. `uint32LE` geometryCount
2. 对于每个 geometry:
	- `uint32LE` vertCount
	- `uint32LE` indexCount
	- `float32LE[vertCount*3]` positions（XYZ 逐点）
	- `float32LE[vertCount*3]` normals
	- 可选 `uint32LE[indexCount]` indices（`indexCount>0` 时）
3. `uint32LE` instanceCount
4. 对于每个实例（instance）:
	- `uint32LE` bimIdIndex（对应 manifest.bimIdTable）
	- `uint32LE` typeIndex（由应用定义，默认 0）
	- `uint32LE` packedColor（0xRRGGBB/0xAARRGGBB 兼容, 目前仅按 32位整型读写）
	- `float32LE[16]` 4x4 变换矩阵（列主或行主需保持实现一致；当前实现用 `THREE.Matrix4.elements`）
	- `uint32LE` geoIdx（用以引用前面 geometry 数组中索引）

## Manifest（JSON）
位于 header 中定义的 `manifestOffset` 和 `manifestOffset + manifestLength` 之间。重要字段：

- `globalBounds`: { min: {x,y,z}, max: {x,y,z} }
- `chunks`: 数组
  - `id`：chunk 标识
  - `bounds`：{ min:{x,y,z}, max:{x,y,z} }
  - `center`：{x,y,z}
  - `paddedBounds`：{ min:{x,y,z}, max:{x,y,z} }
  - `byteOffset`: 本 chunk 在文件中的 byte 偏移（从头开始）
  - `byteLength`: 本 chunk 大小
  - `originalUuid` / `nbimFileId`：可选，指向原始模型或归属
- `stats`: { meshes, faces, memory }（可选，供 UI 展示）
- `structureTree`: 结构树，支持递归 children
  - 节点字段: `id`, `name`, `type`（Group/Mesh 等），`visible`, `children`。
  - 可选字段: `bimId`, `chunkId`, `userData`（如 `originalUuid`, `expressID`, `modelID`）
- `bimIdTable`: string[]（全局 BIM 编号表，实例通过 bimIdIndex 映射）
- `bimProperties`: object，按 `owner::bimId` 等键值存储构件属性。

# NBIM 读取逻辑（与格式对应）

1. 读取并校验 header：魔数 + 版本 + Manifest 偏移与长度。
2. 读取 manifest JSON，补全 `globalBounds`、`structureTree`、`bimIdTable`、`bimProperties`。
3. 每个 `chunk` 通过 `byteOffset`/`byteLength` 读取并送入解析工人（Worker）按 V8 解码。
4. `chunk` 解码后生成:
	- `geometries`（位置、法线、索引）
	- `instances`（矩阵、颜色、bimId、类型、geoIdx）
5. 加载到渲染引擎 (BatchedMesh/InstancedMesh)，按 `originalUuid` 与 `bimId` 建索引，支持按需加载/视锥剔除。

# 导出 NBIM (V8) 逻辑

1. 以当前场景节点生成 `bimIdTable`（去重）和 `bimProperties`。
2. 分块后每个 chunk 调用 `generateChunkBinaryV8`：
	- 收集唯一 geometry
	- 输出 geometry 数量与每个 geometry 数据
	- 输出 instance 数量与每个实例记录
3. 合并 chunk 二进制、JSON manifest、1024字节固定头，输出 `.nbim`。

# 版本与兼容性
- 目前仅支持 V8，未经兼容处理的版本会抛错。
- 参考实现：
  - `src/utils/SceneManager.ts` 中 `generateChunkBinaryV8`, `loadNbim`, `exportNbim`
  - `src/utils/chunkWorker.ts` 中 `parseChunkBinaryV8`

