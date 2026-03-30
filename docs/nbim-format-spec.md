# NBIM File Format Specification

Version: 8

Status: Stable internal specification for third-party producers and consumers

## 1. Purpose

NBIM is a binary container format for large 3D building and industrial models. It is designed for:

- fast random access
- chunk-based streaming
- preservation of scene structure
- compact BIM identifier storage
- efficient reconstruction into instanced or batched render data

An NBIM file contains:

1. a fixed-size file header
2. zero or more binary geometry chunks
3. one manifest section encoded as JSON

This specification defines `NBIM V8` only. Other versions are out of scope.

## 2. Conventions

### 2.1 Endianness

All binary numeric fields are encoded in little-endian byte order.

### 2.2 Numeric types

The following primitive types are used:

| Type | Size | Description |
|---|---:|---|
| `uint32` | 4 bytes | Unsigned 32-bit integer |
| `float32` | 4 bytes | IEEE 754 single-precision float |

### 2.3 Coordinate system

NBIM does not mandate a world axis convention. Producers and consumers must agree on the coordinate system externally.

Recommended practice:

- use a consistent right-handed coordinate system per file
- store all chunk geometry and bounds in the same coordinate space
- keep all transforms in full `4x4` matrix form

### 2.4 Character encoding

The manifest is UTF-8 encoded JSON.

## 3. File Layout

An NBIM file is laid out as:

```text
+-------------------------+
| 1024-byte header        |
+-------------------------+
| chunk 0 binary payload  |
+-------------------------+
| chunk 1 binary payload  |
+-------------------------+
| ...                     |
+-------------------------+
| chunk N binary payload  |
+-------------------------+
| manifest JSON bytes     |
+-------------------------+
```

The file header contains the byte offset and byte length of the manifest section.

## 4. File Header

The file header is exactly `1024` bytes long.

### 4.1 Header fields

| Offset | Type | Field | Required | Description |
|---:|---|---|---|---|
| 0 | `uint32` | `magic` | yes | File signature |
| 4 | `uint32` | `version` | yes | Format version, must be `8` |
| 8 | `uint32` | `manifestOffset` | yes | Absolute byte offset of manifest |
| 12 | `uint32` | `manifestLength` | yes | Manifest byte length |
| 16-1023 | reserved | reserved | no | Reserved for future use, should be zero-filled |

### 4.2 Magic value

The magic field must be:

- hexadecimal: `0x4D49424E`
- ASCII bytes: `NBIM`

Because the file is little-endian, the on-disk byte sequence is:

```text
4E 42 49 4D
```

### 4.3 Validation rules

A consumer must reject the file if:

- `magic` is not `0x4D49424E`
- `version` is not `8`
- `manifestOffset < 1024`
- `manifestLength == 0`
- `manifestOffset + manifestLength > fileSize`

## 5. Manifest Section

The manifest is a UTF-8 JSON document stored at:

- start offset = `manifestOffset`
- byte length = `manifestLength`

The manifest describes:

- overall bounds
- chunk table
- structure tree
- BIM ID string table
- property map
- optional statistics

## 6. Manifest Schema

The top-level manifest object has the following shape:

```json
{
  "globalBounds": {
    "min": { "x": 0, "y": 0, "z": 0 },
    "max": { "x": 0, "y": 0, "z": 0 }
  },
  "chunks": [],
  "stats": {
    "meshes": 0,
    "faces": 0,
    "memory": 0
  },
  "structureTree": {},
  "bimIdTable": [""],
  "bimProperties": {}
}
```

### 6.1 Required top-level fields

| Field | Type | Required | Description |
|---|---|---|---|
| `globalBounds` | object | yes | Full-model bounding box |
| `chunks` | array | yes | Chunk metadata list |
| `structureTree` | object | yes | Logical scene/BIM structure |
| `bimIdTable` | array | yes | String table for BIM IDs |
| `bimProperties` | object | yes | Property map keyed by model-local BIM key |
| `stats` | object | no | Optional summary statistics |

## 7. Bounds Object

A bounds object has this structure:

```json
{
  "min": { "x": -1.0, "y": -1.0, "z": -1.0 },
  "max": { "x":  1.0, "y":  1.0, "z":  1.0 }
}
```

### 7.1 Rules

- `min.x <= max.x`
- `min.y <= max.y`
- `min.z <= max.z`
- all values must be finite numbers

### 7.2 globalBounds

`globalBounds` is the bounding box of the entire file content, in the same coordinate system as chunk geometry and chunk bounds.

## 8. Chunk Table

The `chunks` field is an array of chunk metadata objects.

Each entry describes one binary chunk payload stored between the header and the manifest.

### 8.1 Chunk metadata schema

```json
{
  "id": "chunk_0001",
  "bounds": {
    "min": { "x": 0, "y": 0, "z": 0 },
    "max": { "x": 10, "y": 10, "z": 10 }
  },
  "byteOffset": 1024,
  "byteLength": 4096
}
```

### 8.2 Chunk fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Unique chunk identifier within the file |
| `bounds` | object | yes | Bounding box of this chunk |
| `byteOffset` | integer | yes | Absolute byte offset of chunk payload |
| `byteLength` | integer | yes | Chunk payload length in bytes |

### 8.3 Chunk rules

- `id` must be unique within the file
- `byteOffset` must be `>= 1024`
- `byteLength` must be `> 0`
- chunk payloads must not overlap
- each chunk must end before `manifestOffset`

## 9. Structure Tree

The `structureTree` field stores the logical hierarchy of the model.

It is intended for:

- scene tree presentation
- object lookup
- BIM association
- workset or grouping operations

### 9.1 Structure node schema

```json
{
  "id": "node_1",
  "name": "Level 1",
  "type": "Group",
  "visible": true,
  "bimId": "A1001",
  "chunkId": "chunk_0001",
  "userData": {
    "originalUuid": "model_01",
    "expressID": 1234,
    "modelID": 0
  },
  "children": []
}
```

### 9.2 Structure node fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Stable logical node identifier |
| `name` | string | yes | Display label |
| `type` | string | yes | `Group` or `Mesh` |
| `visible` | boolean | no | Initial visibility, defaults to `true` |
| `bimId` | string | no | Logical BIM identifier |
| `chunkId` | string | no | Related chunk identifier if applicable |
| `userData` | object | no | Additional producer-defined metadata |
| `children` | array | yes | Child nodes |

### 9.3 Structure tree rules

- the root node must be a single object, not an array
- every node must include `children`, even if empty
- child node order is significant and should be preserved
- `type` must be either `Group` or `Mesh`
- `id` values should be unique within the tree

### 9.4 userData

`userData` is optional and implementation-specific. For interoperability, producers should keep it small and stable.

Recommended fields:

- `originalUuid`
- `expressID`
- `modelID`

Consumers should ignore unknown fields.

## 10. BIM ID Table

`bimIdTable` is a string table used to reduce repetition in chunk instance records.

### 10.1 Schema

```json
["", "WALL-001", "DOOR-004", "PIPE-010"]
```

### 10.2 Rules

- index `0` must exist
- index `0` should be the empty string `""`
- each entry must be a string
- entries should be unique

### 10.3 Usage

Chunk instance records store a `bimIdIndex` rather than a full string.

The actual BIM ID is:

```text
bimId = bimIdTable[bimIdIndex]
```

If an index is out of range, the file is invalid.

## 11. BIM Properties Map

`bimProperties` stores per-object metadata keyed by a compound identifier.

### 11.1 Key format

The key format is:

```text
<modelScope>::<bimId>
```

Examples:

```text
mainModel::WALL-001
campus_A::DOOR-004
```

### 11.2 Value format

Each value is a JSON object. The schema is open-ended.

Example:

```json
{
  "uuid": "node_42",
  "name": "Wall A",
  "ifcType": "IfcWall",
  "globalId": "3H$abc123",
  "ifcName": "External Wall"
}
```

### 11.3 Recommended fields

| Field | Type | Description |
|---|---|---|
| `uuid` | string | Associated structure node ID |
| `name` | string | Human-readable label |
| `ifcType` | string | IFC entity name if known |
| `globalId` | string | IFC GlobalId if known |
| `ifcName` | string | IFC Name if known |

Consumers should tolerate missing or unknown fields.

## 12. Statistics Object

The `stats` object is optional.

Recommended schema:

```json
{
  "meshes": 128,
  "faces": 50932,
  "memory": 14.25
}
```

### 12.1 Field meanings

| Field | Type | Description |
|---|---|---|
| `meshes` | integer | Approximate rendered item count |
| `faces` | integer | Total triangle count |
| `memory` | number | Approximate memory size in megabytes |

## 13. Binary Chunk Format

Each chunk stores:

1. a geometry table
2. an instance table

The chunk format is purely binary and contains no nested JSON.

## 14. Chunk Binary Layout

```text
uint32 geoCount
repeat geoCount times:
    uint32 vertCount
    uint32 indexCount
    float32 positions[vertCount * 3]
    float32 normals[vertCount * 3]
    if indexCount > 0:
        uint32 indices[indexCount]

uint32 instanceCount
repeat instanceCount times:
    uint32 bimIdIndex
    uint32 typeIndex
    uint32 color
    float32 matrix[16]
    uint32 geoIdx
```

## 15. Geometry Table

### 15.1 Geometry table header

| Field | Type | Description |
|---|---|---|
| `geoCount` | `uint32` | Number of geometry records in the chunk |

### 15.2 Geometry record

| Field | Type | Description |
|---|---|---|
| `vertCount` | `uint32` | Number of vertices |
| `indexCount` | `uint32` | Number of indices |
| `positions` | `float32[vertCount*3]` | XYZ triplets |
| `normals` | `float32[vertCount*3]` | Normal XYZ triplets |
| `indices` | `uint32[indexCount]` | Triangle indices, present only if `indexCount > 0` |

### 15.3 Geometry rules

- `vertCount` may be zero, but producers should avoid empty geometries
- `positions` length must be exactly `vertCount * 3`
- `normals` length must be exactly `vertCount * 3`
- if `indexCount > 0`, every index must be in `[0, vertCount - 1]`
- geometry records are addressed by zero-based index within the chunk

### 15.4 Indexed and non-indexed geometry

Both are allowed:

- indexed geometry: `indexCount > 0`
- non-indexed geometry: `indexCount == 0`

Consumers that require indexed geometry may generate a sequential index buffer for non-indexed records.

## 16. Instance Table

### 16.1 Instance table header

| Field | Type | Description |
|---|---|---|
| `instanceCount` | `uint32` | Number of instances in the chunk |

### 16.2 Instance record

| Field | Type | Description |
|---|---|---|
| `bimIdIndex` | `uint32` | Index into `bimIdTable` |
| `typeIndex` | `uint32` | Reserved semantic type code |
| `color` | `uint32` | RGB color in `0xRRGGBB` form |
| `matrix` | `float32[16]` | Full transform matrix |
| `geoIdx` | `uint32` | Index into the chunk geometry table |

Each instance record is exactly `80` bytes:

- `4` bytes `bimIdIndex`
- `4` bytes `typeIndex`
- `4` bytes `color`
- `64` bytes matrix
- `4` bytes `geoIdx`

### 16.3 Matrix layout

The transform matrix is a full `4x4` matrix stored as `16` float32 values.

Matrix storage order must be agreed between producer and consumer. Recommended practice is to store the matrix exactly as used in the target rendering engine and document that convention externally.

For interoperable exchange, producers should keep the matrix consistent throughout the file.

### 16.4 geoIdx

`geoIdx` is a zero-based index into the geometry table of the same chunk.

The file is invalid if:

- `geoIdx >= geoCount`

### 16.5 color

`color` is encoded as:

```text
0xRRGGBB
```

No alpha channel is stored in the chunk record.

## 17. typeIndex

`typeIndex` is a reserved unsigned integer field for lightweight semantic categorization.

### 17.1 Current rule

This specification does not define a mandatory semantic dictionary for `typeIndex`.

Producers may:

- store an explicit application-defined type code
- write `0` if no type classification is available

Consumers must not infer semantics from object names.

### 17.2 Interoperability recommendation

For third-party exchange:

- use `0` when no shared type dictionary exists
- if a private dictionary is used, document it outside the file

## 18. Producer Requirements

A valid NBIM V8 producer must:

- write a 1024-byte header
- write `magic = 0x4D49424E`
- write `version = 8`
- write chunk payloads before the manifest
- write valid `manifestOffset` and `manifestLength`
- ensure every `bimIdIndex` resolves into `bimIdTable`
- ensure every `geoIdx` resolves into the local chunk geometry table
- ensure chunk ranges do not overlap
- ensure manifest JSON is valid UTF-8 JSON

## 19. Consumer Requirements

A compliant NBIM V8 consumer must:

- validate header fields
- reject unsupported versions
- load manifest from `manifestOffset` and `manifestLength`
- validate chunk bounds against file size
- resolve `bimIdIndex` through `bimIdTable`
- resolve `geoIdx` through the chunk-local geometry table
- ignore unknown manifest fields safely

## 20. Error Conditions

A consumer should treat the file as invalid if any of the following occur:

- invalid magic
- unsupported version
- invalid manifest range
- malformed JSON manifest
- duplicate chunk IDs
- overlapping chunk byte ranges
- chunk range outside file bounds
- invalid geometry table size
- invalid `bimIdIndex`
- invalid `geoIdx`
- NaN or infinite bounds values

## 21. Minimal Valid Example

Conceptually, the smallest useful NBIM file contains:

- one header
- one chunk
- one geometry
- one instance
- one manifest

Example manifest:

```json
{
  "globalBounds": {
    "min": { "x": 0, "y": 0, "z": 0 },
    "max": { "x": 1, "y": 1, "z": 1 }
  },
  "chunks": [
    {
      "id": "chunk_0",
      "bounds": {
        "min": { "x": 0, "y": 0, "z": 0 },
        "max": { "x": 1, "y": 1, "z": 1 }
      },
      "byteOffset": 1024,
      "byteLength": 204
    }
  ],
  "stats": {
    "meshes": 1,
    "faces": 1,
    "memory": 0.001
  },
  "structureTree": {
    "id": "root",
    "name": "Root",
    "type": "Group",
    "visible": true,
    "children": [
      {
        "id": "mesh_1",
        "name": "Triangle",
        "type": "Mesh",
        "visible": true,
        "bimId": "TRI-1",
        "children": []
      }
    ]
  },
  "bimIdTable": ["", "TRI-1"],
  "bimProperties": {
    "main::TRI-1": {
      "uuid": "mesh_1",
      "name": "Triangle"
    }
  }
}
```

## 22. Binary Offset Table Example

The following is an example layout for a small NBIM V8 file with:

- one header
- two chunks
- one manifest

Assumptions:

- header size = `1024` bytes
- chunk 0 size = `4096` bytes
- chunk 1 size = `6144` bytes
- manifest size = `1536` bytes

### 22.1 File-level offset table

| Section | Start Offset (dec) | Start Offset (hex) | Length (dec) | Length (hex) | End Offset Exclusive (dec) |
|---|---:|---:|---:|---:|---:|
| Header | 0 | `0x00000000` | 1024 | `0x00000400` | 1024 |
| Chunk 0 | 1024 | `0x00000400` | 4096 | `0x00001000` | 5120 |
| Chunk 1 | 5120 | `0x00001400` | 6144 | `0x00001800` | 11264 |
| Manifest | 11264 | `0x00002C00` | 1536 | `0x00000600` | 12800 |

In this example:

- `manifestOffset = 11264`
- `manifestLength = 1536`

### 22.2 Example chunk-local layout

Below is an example internal layout for one chunk containing:

- `geoCount = 2`
- `instanceCount = 3`

Assumptions:

- geometry 0: `vertCount = 24`, `indexCount = 36`
- geometry 1: `vertCount = 12`, `indexCount = 0`

### 22.3 Chunk binary offset example

| Field | Relative Offset (dec) | Relative Offset (hex) | Size |
|---|---:|---:|---:|
| `geoCount` | 0 | `0x0000` | 4 |
| geometry 0 `vertCount` | 4 | `0x0004` | 4 |
| geometry 0 `indexCount` | 8 | `0x0008` | 4 |
| geometry 0 `positions` | 12 | `0x000C` | `24 * 3 * 4 = 288` |
| geometry 0 `normals` | 300 | `0x012C` | `24 * 3 * 4 = 288` |
| geometry 0 `indices` | 588 | `0x024C` | `36 * 4 = 144` |
| geometry 1 `vertCount` | 732 | `0x02DC` | 4 |
| geometry 1 `indexCount` | 736 | `0x02E0` | 4 |
| geometry 1 `positions` | 740 | `0x02E4` | `12 * 3 * 4 = 144` |
| geometry 1 `normals` | 884 | `0x0374` | `12 * 3 * 4 = 144` |
| `instanceCount` | 1028 | `0x0404` | 4 |
| instance 0 | 1032 | `0x0408` | 80 |
| instance 1 | 1112 | `0x0458` | 80 |
| instance 2 | 1192 | `0x04A8` | 80 |

In this example, total chunk length is:

```text
4 + 728 + 296 + 4 + 240 = 1272 bytes
```

where:

- geometry table header = `4`
- geometry 0 record = `728`
- geometry 1 record = `296`
- instance table header = `4`
- instance table records = `3 * 80 = 240`

## 23. Hex Header Example

The following example shows the first 16 bytes of a valid NBIM V8 header.

Assumptions:

- `magic = 0x4D49424E`
- `version = 8`
- `manifestOffset = 11264 = 0x00002C00`
- `manifestLength = 1536 = 0x00000600`

### 23.1 Byte-level view

```text
4E 42 49 4D  08 00 00 00  00 2C 00 00  00 06 00 00
```

### 23.2 Field mapping

| Bytes | Meaning | Value |
|---|---|---|
| `4E 42 49 4D` | magic | `NBIM` |
| `08 00 00 00` | version | `8` |
| `00 2C 00 00` | manifestOffset | `11264` |
| `00 06 00 00` | manifestLength | `1536` |

### 23.3 Full first 64 bytes example

Reserved bytes are shown as zero:

```text
00000000  4E 42 49 4D 08 00 00 00 00 2C 00 00 00 06 00 00
00000010  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00000020  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00000030  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
```

## 24. JSON Schema

The following schema describes the manifest JSON structure for NBIM V8.

### 24.1 Manifest JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/nbim-v8-manifest.schema.json",
  "title": "NBIM V8 Manifest",
  "type": "object",
  "additionalProperties": true,
  "required": [
    "globalBounds",
    "chunks",
    "structureTree",
    "bimIdTable",
    "bimProperties"
  ],
  "properties": {
    "globalBounds": {
      "$ref": "#/$defs/bounds"
    },
    "chunks": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/chunk"
      }
    },
    "stats": {
      "$ref": "#/$defs/stats"
    },
    "structureTree": {
      "$ref": "#/$defs/structureNode"
    },
    "bimIdTable": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string"
      }
    },
    "bimProperties": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/$defs/bimPropertyRecord"
      },
      "propertyNames": {
        "type": "string",
        "minLength": 1
      }
    }
  },
  "$defs": {
    "vector3": {
      "type": "object",
      "additionalProperties": false,
      "required": ["x", "y", "z"],
      "properties": {
        "x": { "type": "number" },
        "y": { "type": "number" },
        "z": { "type": "number" }
      }
    },
    "bounds": {
      "type": "object",
      "additionalProperties": false,
      "required": ["min", "max"],
      "properties": {
        "min": { "$ref": "#/$defs/vector3" },
        "max": { "$ref": "#/$defs/vector3" }
      }
    },
    "chunk": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "bounds", "byteOffset", "byteLength"],
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1
        },
        "bounds": {
          "$ref": "#/$defs/bounds"
        },
        "byteOffset": {
          "type": "integer",
          "minimum": 1024
        },
        "byteLength": {
          "type": "integer",
          "exclusiveMinimum": 0
        }
      }
    },
    "stats": {
      "type": "object",
      "additionalProperties": true,
      "required": ["meshes", "faces", "memory"],
      "properties": {
        "meshes": {
          "type": "integer",
          "minimum": 0
        },
        "faces": {
          "type": "integer",
          "minimum": 0
        },
        "memory": {
          "type": "number",
          "minimum": 0
        }
      }
    },
    "structureNode": {
      "type": "object",
      "additionalProperties": true,
      "required": ["id", "name", "type", "children"],
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1
        },
        "name": {
          "type": "string"
        },
        "type": {
          "type": "string",
          "enum": ["Group", "Mesh"]
        },
        "visible": {
          "type": "boolean"
        },
        "bimId": {
          "type": "string"
        },
        "chunkId": {
          "type": "string"
        },
        "userData": {
          "type": "object"
        },
        "children": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/structureNode"
          }
        }
      }
    },
    "bimPropertyRecord": {
      "type": "object",
      "additionalProperties": true,
      "properties": {
        "uuid": {
          "type": "string"
        },
        "name": {
          "type": "string"
        },
        "ifcType": {
          "type": "string"
        },
        "globalId": {
          "type": "string"
        },
        "ifcName": {
          "type": "string"
        }
      }
    }
  }
}
```

### 24.2 Optional binary-side schema notes

JSON Schema applies to the manifest only. It does not validate the binary chunk payload.

Binary chunk validation must be performed by:

- header validation
- file-size bounds checks
- geometry table length checks
- `bimIdIndex` range checks
- `geoIdx` range checks

## 25. Forward Compatibility

Reserved areas:

- header bytes `16..1023`
- manifest unknown fields
- `userData` fields
- `typeIndex` semantic dictionary

Consumers should:

- reject unknown major versions
- ignore unknown manifest fields within version 8
- preserve unknown metadata when reserializing if possible

## 26. Summary

NBIM V8 is a chunked binary-plus-JSON model container with:

- fixed header
- binary geometry and instance chunks
- structured logical tree
- BIM ID string table
- optional properties and stats

It is suitable for third-party generation and consumption as long as both sides follow:

- little-endian binary encoding
- strict header validation
- chunk-local geometry addressing
- manifest-defined lookup tables
