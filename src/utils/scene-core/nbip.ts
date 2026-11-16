/**
 * NBIP v10 —— NBIM 分离式“属性数据库”。
 *
 * 设计目标：属性本质是 `(构件, 属性名, 值)` 的关系表，独立成文件、按行存储，
 * 打开模型时完全不需要解析属性；选中构件时只读取该构件的那几十行。
 *
 * 文件布局（全部 little-endian）：
 *   [128B header]
 *   [stringOffsets: u32 × (stringCount+1)]   // 指向 stringPool 的字节偏移
 *   [stringPool: UTF-8 bytes]                // 去重后的字符串池（名称/分组/值共用）
 *   [components: 28B × componentCount]       // 按 keyHash 升序，二分查找
 *   [names: 24B × nameCount]                 // 去重后的“属性名”元数据
 *   [rows: 8B × rowCount]                    // { nameId, valueStringId }，按构件分组连续存放
 *
 * header 字段：
 *   0  u32 magic  'NBP0'
 *   4  u32 version 10
 *   8  u32 flags
 *   12 u32 componentCount
 *   16 u32 rowCount
 *   20 u32 nameCount
 *   24 u32 stringCount
 *   28 u32 modelNameStringId
 *   32 u32 stringOffsetsOffset
 *   36 u32 stringPoolOffset
 *   40 u32 componentsOffset
 *   44 u32 namesOffset
 *   48 u32 rowsOffset
 *   52 u32 fileLength
 *   56.. reserved
 */
import type { NbimPropertyDocument, NbimPropertyNameIndexItem } from "./nbimIO";
import type { ByteSourceLike } from "./nbimBlock";

export const NBIP_MAGIC = 0x3050424e; // bytes 'N','B','P','0'
export const NBIP_VERSION = 10;
export const NBIP_HEADER_BYTES = 128;
const COMPONENT_RECORD_BYTES = 32;
const NAME_RECORD_BYTES = 24;
const ROW_RECORD_BYTES = 8;

/**
 * header.flags bit0：行表改为“varint 双列（nameId, valueId）”。
 * 行表是属性库最大的一块（实测占 64%），固定 8B/行里 nameId 只需 1~2 字节、
 * valueId 只需 2~3 字节，varint 平均约 4B/行，压缩后再省约 40%。
 * 该模式下构件记录由 32B 扩为 36B，额外存 rowOffset / rowBytes 以支持随机读。
 */
export const NBIP_FLAG_ROW_VARINT = 1;
const COMPONENT_RECORD_BYTES_VARINT = 36;

/**
 * header.flags bit1：行表改为“schema 引用”。
 * 同一批构件的属性名序列高度重复（实测 1680 构件只有 4 种序列），
 * 把 nameId 序列抽成共享 schema 后，行表只存 valueId，raw 再降约 13%。
 */
export const NBIP_FLAG_SCHEMA_ROWS = 2;
const COMPONENT_RECORD_BYTES_SCHEMA = 40;

/**
 * header.flags bit3：构件记录压缩为 32 B。
 *  - rowCount 可由所属 schema 推出（schema 模式下二者必然相等）；
 *  - rowBytes 可由“下一个构件的 rowOffset”推出（构件按哈希排序写入，rowOffset 单调；行表在文件末尾）；
 *  - uuid 与主键相同时写 0xFFFFFFFF 哨兵，读取时直接用 key。
 * 实测 2424 构件省 ~29 KB raw，14.6 万构件省 ~1.7 MB raw。
 */
export const NBIP_FLAG_COMPACT_COMPONENT = 8;
const COMPONENT_RECORD_BYTES_COMPACT = 32;
const UUID_SAME_AS_KEY = 4294967295;

/**
 * header.flags bit2：字符串池前向编码（按字典序排、相邻共享前缀，每 8 条重置一次）。
 * 实测字符串池 raw 降 56%，整库 gzip 再降约 14%。
 */
export const NBIP_FLAG_FRONT_POOL = 4;
const FRONT_POOL_RESTART_STRIDE = 8;

/** 按字节比较（字符串排序用；避免依赖 Buffer，浏览器/Node 通用）。 */
function BufferCompare(a: Uint8Array, b: Uint8Array) {
    const limit = Math.min(a.length, b.length);
    for (let i = 0; i < limit; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
}

/** 把 varint 追加到 number[] 暂存区（schema 表用）。 */
function pushVarintList(sink: { push(v: number): void }, value: number) {
    let v = value >>> 0;
    while (v >= 0x80) {
        sink.push((v & 0x7f) | 0x80);
        v >>>= 7;
    }
    sink.push(v);
}

function varintLength(value: number) {
    let v = value >>> 0;
    let n = 1;
    while (v >= 0x80) { v >>>= 7; n++; }
    return n;
}

function writeVarint(bytes: Uint8Array, offset: number, value: number) {
    let v = value >>> 0;
    while (v >= 0x80) {
        bytes[offset++] = (v & 0x7f) | 0x80;
        v >>>= 7;
    }
    bytes[offset++] = v;
    return offset;
}

function readVarint(dv: DataView, state: { offset: number }) {
    let result = 0;
    let shift = 0;
    while (true) {
        const byte = dv.getUint8(state.offset++);
        result |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
        if (shift > 35) throw new Error("NBIP varint 越界");
    }
    return result >>> 0;
}

export interface NbipHeader {
    magic: number;
    version: number;
    flags: number;
    componentCount: number;
    rowCount: number;
    nameCount: number;
    stringCount: number;
    modelNameStringId: number;
    stringOffsetsOffset: number;
    stringPoolOffset: number;
    componentsOffset: number;
    namesOffset: number;
    rowsOffset: number;
    fileLength: number;
    /** schema 表偏移（flags bit1），0 表示无 */
    schemasOffset: number;
    schemaCount: number;
}

export interface NbipStats {
    components: number;
    rows: number;
    names: number;
    strings: number;
    bytes: number;
}

/** FNV-1a 32bit，用于构件 uuid → 记录索引的快速定位（碰撞时再用字符串校验）。 */
function hash32(text: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i) & 0xffff;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

interface NameEntry {
    groupId: number;
    keyId: number;
    pathId: number;
    sourceId: number;
    rawKeyId: number;
    count: number;
}

interface ComponentEntry {
    hash: number;
    /** 跨文件稳定主键：优先 bimId，其次 uuid（用它与结构树节点匹配） */
    keyId: number;
    uuidId: number;
    ownerId: number;
    bimIdId: number;
    nameId: number;
    rows: Array<{ nameId: number; valueId: number }>;
}

export interface NbipEncoded {
    bytes: Uint8Array;
    stats: NbipStats;
}

/**
 * 把一组属性文档编码成 NBIP v10 二进制。
 * 文档 key 通常为 `${owner}::${bimId}`，其中 doc.uuid 作为构件主键。
 */
/**
 * 增量式属性库写入器：逐个 addDocument，最后 finish() 出字节。
 *
 * 为什么需要它：超大模型的 manifest 里属性 JSON 可达 1 GB（超过 V8 字符串上限，
 * 直接 JSON.parse 整个 manifest 会失败）。用流式读取逐条喂进来时，
 * 这里只保留“去重后的字符串 + 数值型构件/行记录”，不再持有解析后的 JSON 对象。
 */
export class NbipWriter {
    private stringMap = new Map<string, number>();
    private strings: string[] = [];
    private nameMap = new Map<string, number>();
    private names: NameEntry[] = [];
    private components: ComponentEntry[] = [];

    private intern(value: string | null | undefined): number {
        const text = value === null || value === undefined ? "" : String(value);
        const existing = this.stringMap.get(text);
        if (existing !== undefined) return existing;
        const id = this.strings.length;
        this.strings.push(text);
        this.stringMap.set(text, id);
        return id;
    }

    private internName(row: any): number {
        const group = row?.group ?? "";
        const key = row?.key ?? "";
        const path = row?.path ?? (group && key ? `${group}.${key}` : key || group || "");
        const source = row?.source ?? "";
        const rawKey = row?.rawKey ?? "";
        const identity = `${group}\u0000${key}\u0000${path}\u0000${source}\u0000${rawKey}`;
        const existing = this.nameMap.get(identity);
        if (existing !== undefined) {
            this.names[existing].count++;
            return existing;
        }
        const id = this.names.length;
        this.names.push({
            groupId: this.intern(group),
            keyId: this.intern(key),
            pathId: this.intern(path),
            sourceId: this.intern(source),
            rawKeyId: this.intern(rawKey),
            count: 1
        });
        this.nameMap.set(identity, id);
        return id;
    }

    /** 加入一个构件；返回是否真的写入了（用于统计）。 */
    addDocument(key: string, doc: any): boolean {
        if (!doc || !Array.isArray(doc.rows)) return false;
        const uuidText = String(doc.uuid || doc.bimId || key);
        // 主键用 bimId：导出前后节点 id 会重建，但 bimId 与结构树节点保持一致，便于选中时定位。
        const lookupKey = String(doc.bimId || doc.uuid || key);
        const rows: Array<{ nameId: number; valueId: number }> = new Array(doc.rows.length);
        for (let i = 0; i < doc.rows.length; i++) {
            const row = doc.rows[i];
            rows[i] = { nameId: this.internName(row), valueId: this.intern(row?.value) };
        }
        this.components.push({
            hash: hash32(lookupKey),
            keyId: this.intern(lookupKey),
            uuidId: this.intern(uuidText),
            ownerId: this.intern(doc.owner),
            bimIdId: this.intern(doc.bimId),
            nameId: this.intern(doc.name),
            rows
        });
        return true;
    }

    get componentCount() { return this.components.length; }
    get stringCount() { return this.strings.length; }

    finish(modelName = ""): NbipEncoded {
    let strings = this.strings;
    const names = this.names;
    const components = this.components;

    // 按 (hash, 主键字符串) 排序，保证二分查找可复现；碰撞用字符串校验。
    const keyText = (entry: ComponentEntry) => strings[entry.keyId];
    components.sort((a, b) => (a.hash - b.hash) || (keyText(a) < keyText(b) ? -1 : keyText(a) > keyText(b) ? 1 : 0));

    let rowCount = 0;
    for (const component of components) rowCount += component.rows.length;

    // 注意：modelName 必须在统计 strings.length / 构建字符串池之前 intern，
    // 否则 header 里记录的 stringCount 与实际池不一致（尾部字符串会越界）。
    let modelNameStringId = this.intern(modelName);

    // ---------- 属性名序列（schema）去重 ----------
    // 实测真实模型里 1680 个构件只有 4 种属性名序列：每行重复存 nameId 是纯浪费。
    // 这里把 nameId 序列抽成共享 schema，行表只留 valueId。
    const schemaMap = new Map<string, number>();
    const schemas: number[][] = [];
    const componentSchema = new Array<number>(components.length);
    for (let i = 0; i < components.length; i++) {
        const rows = components[i].rows;
        let key = "";
        for (const row of rows) key += row.nameId + ",";
        let schemaId = schemaMap.get(key);
        if (schemaId === undefined) {
            schemaId = schemas.length;
            schemaMap.set(key, schemaId);
            schemas.push(rows.map((row) => row.nameId));
        }
        componentSchema[i] = schemaId;
    }

    // ---------- 字符串池：按字典序重排 + 前缀共享（前向编码） ----------
    // 字符串 id 重新编号为字典序，池内相邻项共享前缀；每 RESTART_STRIDE 个重置为完整串，
    // 保证仍能按 id 随机读（最多回溯 RESTART_STRIDE 项）。
    const useFrontPool = strings.length >= 512;
    if (useFrontPool) {
        const encoderForSort = new TextEncoder();
        const order = strings.map((text, id) => ({ id, bytes: encoderForSort.encode(text) }));
        order.sort((a, b) => {
            if (a.bytes.length !== b.bytes.length) return a.bytes.length - b.bytes.length; // 长度优先，帮助前缀聚集
            return BufferCompare(a.bytes, b.bytes);
        });
        const newIdOf = new Int32Array(strings.length);
        const reordered = new Array<string>(strings.length);
        for (let k = 0; k < order.length; k++) {
            newIdOf[order[k].id] = k;
            reordered[k] = strings[order[k].id];
        }
        // 重映射所有字符串引用
        for (const component of components) {
            component.keyId = newIdOf[component.keyId];
            component.uuidId = newIdOf[component.uuidId];
            component.ownerId = newIdOf[component.ownerId];
            component.bimIdId = newIdOf[component.bimIdId];
            component.nameId = newIdOf[component.nameId];
            for (const row of component.rows) row.valueId = newIdOf[row.valueId];
        }
        for (const name of names) {
            name.groupId = newIdOf[name.groupId];
            name.keyId = newIdOf[name.keyId];
            name.pathId = newIdOf[name.pathId];
            name.sourceId = newIdOf[name.sourceId];
            name.rawKeyId = newIdOf[name.rawKeyId];
        }
        strings = reordered;
        modelNameStringId = newIdOf[modelNameStringId];
    }

    // ---------- 写字符串池 ----------
    const encoder = new TextEncoder();
    const encodedStrings = strings.map((text) => encoder.encode(text));
    let poolBytes = 0;
    const stringOffsets = new Uint32Array(strings.length + 1);
    if (useFrontPool) {
        // 前向编码：varint(共享前缀长) + varint(后缀长) + 后缀
        const RESTART_STRIDE = 8;
        const lengths = new Uint32Array(strings.length);
        let prevLength = 0;
        for (let i = 0; i < encodedStrings.length; i++) {
            stringOffsets[i] = poolBytes;
            const current = encodedStrings[i];
            const restart = i % RESTART_STRIDE === 0 || prevLength === 0;
            let common = 0;
            if (!restart) {
                const prev = encodedStrings[i - 1];
                const limit = Math.min(prev.length, current.length);
                while (common < limit && prev[common] === current[common]) common++;
            }
            const suffix = current.length - common;
            const need = varintLength(common) + varintLength(suffix) + suffix;
            lengths[i] = need;
            poolBytes += need;
            prevLength = current.length;
        }
        stringOffsets[encodedStrings.length] = poolBytes;
        // 真实写一遍（复用估算出来的偏移）
        const pool = new Uint8Array(poolBytes);
        let write = 0;
        prevLength = 0;
        for (let i = 0; i < encodedStrings.length; i++) {
            const current = encodedStrings[i];
            const restart = i % RESTART_STRIDE === 0 || prevLength === 0;
            let common = 0;
            if (!restart) {
                const prev = encodedStrings[i - 1];
                const limit = Math.min(prev.length, current.length);
                while (common < limit && prev[common] === current[common]) common++;
            }
            write = writeVarint(pool, write, common);
            write = writeVarint(pool, write, current.length - common);
            pool.set(current.subarray(common), write);
            write += current.length - common;
            prevLength = current.length;
        }
        encodedStrings.length = 0;
        encodedStrings.push(pool);
    } else {
        for (let i = 0; i < encodedStrings.length; i++) {
            stringOffsets[i] = poolBytes;
            poolBytes += encodedStrings[i].length;
        }
        stringOffsets[encodedStrings.length] = poolBytes;
    }

    const schemaRows = true;
    const compactComponents = true;
    const flags = NBIP_FLAG_ROW_VARINT
        | (schemaRows ? NBIP_FLAG_SCHEMA_ROWS : 0)
        | (compactComponents ? NBIP_FLAG_COMPACT_COMPONENT : 0)
        | (useFrontPool ? NBIP_FLAG_FRONT_POOL : 0);
    const componentStride = compactComponents
        ? COMPONENT_RECORD_BYTES_COMPACT
        : schemaRows ? COMPONENT_RECORD_BYTES_SCHEMA : COMPONENT_RECORD_BYTES_VARINT;

    const stringOffsetsOffset = NBIP_HEADER_BYTES;
    const stringPoolOffset = stringOffsetsOffset + stringOffsets.byteLength;
    const componentsOffset = stringPoolOffset + poolBytes;
    const namesOffset = componentsOffset + components.length * componentStride;
    const schemasOffset = namesOffset + names.length * NAME_RECORD_BYTES;

    // schema 表：u32 数量 + 每项 varint(nameCount) + nameId 序列
    const schemaBuffer: number[] = [];
    schemaBuffer.length = 0;
    let schemaBytes = 0;
    const schemaWriter = { push(v: number) { schemaBuffer.push(v); } };
    pushVarintList(schemaWriter, schemas.length);
    for (const nameIds of schemas) {
        pushVarintList(schemaWriter, nameIds.length);
        for (const nameId of nameIds) pushVarintList(schemaWriter, nameId);
    }
    schemaBytes = schemaBuffer.length;
    const rowsOffset = schemasOffset + schemaBytes;

    // 行表：schema 模式下只存 valueId
    const componentRowInfo = new Array<{ offset: number; bytes: number }>(components.length);
    let rowsBufferBytes = 0;
    for (let i = 0; i < components.length; i++) rowsBufferBytes += components[i].rows.length * 10;
    const estimate = new Uint8Array(rowsBufferBytes);
    let rowCursorBytes = 0;
    for (let i = 0; i < components.length; i++) {
        const start = rowCursorBytes;
        for (const row of components[i].rows) {
            if (rowCursorBytes + 12 > estimate.length) throw new Error("NBIP 行表 varint 预估不足");
            rowCursorBytes = writeVarint(estimate, rowCursorBytes, row.valueId);
        }
        componentRowInfo[i] = { offset: start, bytes: rowCursorBytes - start };
    }
    const rowsBytes = estimate.subarray(0, rowCursorBytes);

    const fileLength = rowsOffset + rowsBytes.byteLength;

    const buffer = new ArrayBuffer(fileLength);
    const bytes = new Uint8Array(buffer);
    const dv = new DataView(buffer);

    // header
    dv.setUint32(0, NBIP_MAGIC, true);
    dv.setUint32(4, NBIP_VERSION, true);
    dv.setUint32(8, flags, true);
    dv.setUint32(12, components.length, true);
    dv.setUint32(16, rowCount, true);
    dv.setUint32(20, names.length, true);
    dv.setUint32(24, strings.length, true);
    dv.setUint32(28, modelNameStringId, true);
    dv.setUint32(32, stringOffsetsOffset, true);
    dv.setUint32(36, stringPoolOffset, true);
    dv.setUint32(40, componentsOffset, true);
    dv.setUint32(44, namesOffset, true);
    dv.setUint32(48, rowsOffset, true);
    dv.setUint32(52, fileLength, true);
    dv.setUint32(56, schemasOffset, true);
    dv.setUint32(60, schemas.length, true);

    // string offsets + pool
    new Uint8Array(buffer, stringOffsetsOffset, stringOffsets.byteLength).set(new Uint8Array(stringOffsets.buffer));
    if (useFrontPool) {
        bytes.set(encodedStrings[0], stringPoolOffset);
    } else {
        let cursor = stringPoolOffset;
        for (const encoded of encodedStrings) {
            bytes.set(encoded, cursor);
            cursor += encoded.length;
        }
    }

    // components
    let componentCursor = componentsOffset;
    for (let i = 0; i < components.length; i++) {
        const component = components[i];
        dv.setUint32(componentCursor, component.hash, true);
        dv.setUint32(componentCursor + 4, component.keyId, true);
        // uuid 与主键字符串相同时写哨兵，读回时直接用 key
        const uuidSame = component.uuidId === component.keyId;
        dv.setUint32(componentCursor + 8, uuidSame ? UUID_SAME_AS_KEY : component.uuidId, true);
        dv.setUint32(componentCursor + 12, component.ownerId, true);
        dv.setUint32(componentCursor + 16, component.bimIdId, true);
        dv.setUint32(componentCursor + 20, component.nameId, true);
        dv.setUint32(componentCursor + 24, componentRowInfo[i].offset, true);
        if (compactComponents) {
            // 32B：rowCount 由 schema 推出、rowBytes 由下一构件推出
            dv.setUint32(componentCursor + 28, componentSchema[i], true);
        } else if (schemaRows) {
            dv.setUint32(componentCursor + 28, component.rows.length, true);
            dv.setUint32(componentCursor + 32, componentRowInfo[i].bytes, true);
            dv.setUint32(componentCursor + 36, componentSchema[i], true);
        } else {
            dv.setUint32(componentCursor + 28, component.rows.length, true);
            dv.setUint32(componentCursor + 32, componentRowInfo[i].bytes, true);
        }
        componentCursor += componentStride;
    }

    // names
    let nameCursor = namesOffset;
    for (const name of names) {
        dv.setUint32(nameCursor, name.groupId, true);
        dv.setUint32(nameCursor + 4, name.keyId, true);
        dv.setUint32(nameCursor + 8, name.pathId, true);
        dv.setUint32(nameCursor + 12, name.sourceId, true);
        dv.setUint32(nameCursor + 16, name.rawKeyId, true);
        dv.setUint32(nameCursor + 20, name.count, true);
        nameCursor += NAME_RECORD_BYTES;
    }

    // schemas
    bytes.set(Uint8Array.from(schemaBuffer), schemasOffset);

    // rows（schema 模式：仅 valueId）
    bytes.set(rowsBytes, rowsOffset);

    return {
        bytes,
        stats: {
            components: components.length,
            rows: rowCount,
            names: names.length,
            strings: strings.length,
            bytes: fileLength
        }
    };
    }
}

/** 一次性编码（小/中模型、自测用）。大模型请用 NbipWriter 流式写入。 */
export function encodeNbip(docs: Record<string, NbimPropertyDocument>, modelName = ""): NbipEncoded {
    const writer = new NbipWriter();
    for (const key of Object.keys(docs)) writer.addDocument(key, docs[key]);
    return writer.finish(modelName);
}

export async function readNbipHeader(blob: ByteSourceLike): Promise<NbipHeader> {
    const buffer = await blob.slice(0, NBIP_HEADER_BYTES).arrayBuffer();
    const dv = new DataView(buffer);
    const header: NbipHeader = {
        magic: dv.getUint32(0, true),
        version: dv.getUint32(4, true),
        flags: dv.getUint32(8, true),
        componentCount: dv.getUint32(12, true),
        rowCount: dv.getUint32(16, true),
        nameCount: dv.getUint32(20, true),
        stringCount: dv.getUint32(24, true),
        modelNameStringId: dv.getUint32(28, true),
        stringOffsetsOffset: dv.getUint32(32, true),
        stringPoolOffset: dv.getUint32(36, true),
        componentsOffset: dv.getUint32(40, true),
        namesOffset: dv.getUint32(44, true),
        rowsOffset: dv.getUint32(48, true),
        fileLength: dv.getUint32(52, true),
        schemasOffset: dv.getUint32(56, true),
        schemaCount: dv.getUint32(60, true)
    };
    if (header.magic !== NBIP_MAGIC) throw new Error("不是有效的 NBIP 属性数据库（magic 不匹配）");
    if (header.version !== NBIP_VERSION) throw new Error(`不支持的 NBIP 版本: ${header.version}（仅支持 10）`);
    return header;
}

/**
 * 惰性属性数据库读取器：不加载字符串池，只在需要时按偏移读取单条字符串。
 * 打开一个 1GB 级属性库只需读 header + 少量索引（几 MB）。
 */
export class NbipDatabase {
    private readonly blob: ByteSourceLike;
    readonly header: NbipHeader;
    readonly fileName: string;
    private componentsView: DataView | null = null;
    private namesView: DataView | null = null;
    private stringOffsetsView: DataView | null = null;
    private stringCache = new Map<number, string>();
    private schemaNameIds: number[][] | null = null;

    constructor(blob: ByteSourceLike, header: NbipHeader, fileName = "") {
        this.blob = blob;
        this.header = header;
        this.fileName = fileName;
    }

    static async open(blob: ByteSourceLike, fileName = ""): Promise<NbipDatabase> {
        const header = await readNbipHeader(blob);
        return new NbipDatabase(blob, header, fileName);
    }

    private async ensureIndexes() {
        const h = this.header;
        if (!this.componentsView) {
            const compBlob = this.blob.slice(h.componentsOffset, h.namesOffset);
            this.componentsView = new DataView(await compBlob.arrayBuffer());
        }
        if (!this.namesView) {
            // names 之后可能紧跟 schema 表，只读名字表本身
            const namesEnd = this.header.namesOffset + this.header.nameCount * NAME_RECORD_BYTES;
            const namesBlob = this.blob.slice(h.namesOffset, namesEnd);
            this.namesView = new DataView(await namesBlob.arrayBuffer());
        }
        if (!this.stringOffsetsView) {
            const offsetsBlob = this.blob.slice(h.stringOffsetsOffset, h.stringPoolOffset);
            this.stringOffsetsView = new DataView(await offsetsBlob.arrayBuffer());
        }
    }

    private async readString(stringId: number): Promise<string> {
        if (stringId < 0 || stringId >= this.header.stringCount) return "";
        const cached = this.stringCache.get(stringId);
        if (cached !== undefined) return cached;
        await this.ensureIndexes();
        let text: string;
        if (this.frontPool) {
            text = await this.readFrontCodedString(stringId);
        } else {
            const offsets = this.stringOffsetsView!;
            const startRel = offsets.getUint32(stringId * 4, true);
            const endRel = offsets.getUint32((stringId + 1) * 4, true);
            const start = this.header.stringPoolOffset + startRel;
            const end = this.header.stringPoolOffset + endRel;
            text = end > start ? await this.blob.slice(start, end).text() : "";
        }
        // 简单总量上限，避免一次选择把巨大值也缓存住；属性字符串一般很小。
        if (text.length <= 4096 && this.stringCache.size < 20000) this.stringCache.set(stringId, text);
        return text;
    }

    /**
     * 前向编码字符串的随机读：回溯到最近的重置点（每 8 条一个完整串），
     * 只解压该区间并顺序还原，避免整池解码。
     */
    private async readFrontCodedString(stringId: number): Promise<string> {
        const offsets = this.stringOffsetsView!;
        const restart = stringId - (stringId % FRONT_POOL_RESTART_STRIDE);
        const startRel = offsets.getUint32(restart * 4, true);
        const endRel = offsets.getUint32((stringId + 1) * 4, true);
        const start = this.header.stringPoolOffset + startRel;
        const end = this.header.stringPoolOffset + endRel;
        if (end <= start) return "";
        const buffer = await this.blob.slice(start, end).arrayBuffer();
        const dv = new DataView(buffer);
        let offset = 0;
        // 前缀长度是“字节”而不是字符，必须按字节拼接（中文是 3 字节/字）。
        let current: Uint8Array = new Uint8Array(0);
        for (let i = restart; i <= stringId; i++) {
            const state = { offset };
            const prefixLength = readVarint(dv, state);
            const suffixLength = readVarint(dv, state);
            offset = state.offset;
            const suffix = new Uint8Array(buffer, offset, suffixLength);
            offset += suffixLength;
            if (prefixLength > 0 && prefixLength <= current.length) {
                const merged = new Uint8Array(prefixLength + suffixLength);
                merged.set(current.subarray(0, prefixLength), 0);
                merged.set(suffix, prefixLength);
                current = merged;
            } else {
                current = suffix.slice();
            }
            if (i < stringId && current.length <= 4096 * 3 && this.stringCache.size < 20000) {
                this.stringCache.set(i, new TextDecoder().decode(current));
            }
        }
        return new TextDecoder().decode(current);
    }

    private get rowVarint() {
        return (this.header.flags & NBIP_FLAG_ROW_VARINT) !== 0;
    }

    private get schemaRows() {
        return (this.header.flags & NBIP_FLAG_SCHEMA_ROWS) !== 0;
    }

    private get frontPool() {
        return (this.header.flags & NBIP_FLAG_FRONT_POOL) !== 0;
    }

    private get compactComponents() {
        return (this.header.flags & NBIP_FLAG_COMPACT_COMPONENT) !== 0;
    }

    /** 读取共享 schema 的 nameId 序列（首次使用时解析并缓存）。 */
    private async ensureSchemas() {
        if (this.schemaNameIds || !this.schemaRows) return;
        const h = this.header;
        if (!h.schemaCount) { this.schemaNameIds = []; return; }
        const buffer = await this.blob.slice(h.schemasOffset, h.rowsOffset).arrayBuffer();
        const dv = new DataView(buffer);
        const state = { offset: 0 };
        const list: number[][] = [];
        const count = readVarint(dv, state);
        for (let i = 0; i < count; i++) {
            const n = readVarint(dv, state);
            const ids = new Array<number>(n);
            for (let k = 0; k < n; k++) ids[k] = readVarint(dv, state);
            list.push(ids);
        }
        this.schemaNameIds = list;
    }

    private componentAt(index: number) {
        const dv = this.componentsView!;
        if (this.compactComponents) {
            const base = index * COMPONENT_RECORD_BYTES_COMPACT;
            return {
                hash: dv.getUint32(base, true),
                keyId: dv.getUint32(base + 4, true),
                uuidId: dv.getUint32(base + 8, true),
                ownerId: dv.getUint32(base + 12, true),
                bimIdId: dv.getUint32(base + 16, true),
                nameId: dv.getUint32(base + 20, true),
                rowOffset: dv.getUint32(base + 24, true),
                rowCount: -1,   // 由 schema 推出
                rowBytes: -1,   // 由下一构件推出
                schemaId: dv.getUint32(base + 28, true)
            };
        }
        if (this.schemaRows) {
            const base = index * COMPONENT_RECORD_BYTES_SCHEMA;
            return {
                hash: dv.getUint32(base, true),
                keyId: dv.getUint32(base + 4, true),
                uuidId: dv.getUint32(base + 8, true),
                ownerId: dv.getUint32(base + 12, true),
                bimIdId: dv.getUint32(base + 16, true),
                nameId: dv.getUint32(base + 20, true),
                rowOffset: dv.getUint32(base + 24, true),
                rowCount: dv.getUint32(base + 28, true),
                rowBytes: dv.getUint32(base + 32, true),
                schemaId: dv.getUint32(base + 36, true)
            };
        }
        if (this.rowVarint) {
            const base = index * COMPONENT_RECORD_BYTES_VARINT;
            return {
                hash: dv.getUint32(base, true),
                keyId: dv.getUint32(base + 4, true),
                uuidId: dv.getUint32(base + 8, true),
                ownerId: dv.getUint32(base + 12, true),
                bimIdId: dv.getUint32(base + 16, true),
                nameId: dv.getUint32(base + 20, true),
                rowOffset: dv.getUint32(base + 24, true),
                rowCount: dv.getUint32(base + 28, true),
                rowBytes: dv.getUint32(base + 32, true),
                schemaId: -1
            };
        }
        const base = index * COMPONENT_RECORD_BYTES;
        const rowStart = dv.getUint32(base + 24, true);
        const rowCount = dv.getUint32(base + 28, true);
        return {
            hash: dv.getUint32(base, true),
            keyId: dv.getUint32(base + 4, true),
            uuidId: dv.getUint32(base + 8, true),
            ownerId: dv.getUint32(base + 12, true),
            bimIdId: dv.getUint32(base + 16, true),
            nameId: dv.getUint32(base + 20, true),
            rowOffset: rowStart * ROW_RECORD_BYTES,
            rowCount,
            rowBytes: rowCount * ROW_RECORD_BYTES,
            schemaId: -1
        };
    }

    private async findComponent(key: string): Promise<{ component: any; index: number } | null> {
        await this.ensureIndexes();
        const target = hash32(key);
        const count = this.header.componentCount;
        let lo = 0;
        let hi = count - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const rec = this.componentAt(mid);
            if (rec.hash < target) lo = mid + 1;
            else if (rec.hash > target) hi = mid - 1;
            else {
                // 命中哈希：在等值区间内用字符串校验（处理碰撞）
                let start = mid;
                while (start > 0 && this.componentAt(start - 1).hash === target) start--;
                for (let i = start; i < count && this.componentAt(i).hash === target; i++) {
                    const candidate = this.componentAt(i);
                    const candidateKey = await this.readString(candidate.keyId);
                    if (candidateKey === key) return { component: candidate, index: i };
                }
                return null;
            }
        }
        return null;
    }

    /** 按构件主键（bimId 优先）读取完整属性文档；不存在返回 null。 */
    async getDocumentByKey(key: string): Promise<NbimPropertyDocument | null> {
        if (!key) return null;
        const found = await this.findComponent(key);
        if (!found) return null;
        const component = found.component;

        // 紧凑构件记录：rowCount 由 schema 推出、rowBytes 由下一构件 rowOffset 推出
        let rowCount = component.rowCount;
        if (rowCount < 0) {
            await this.ensureSchemas();
            rowCount = this.schemaNameIds?.[component.schemaId]?.length ?? 0;
        }
        let rowBytes = component.rowBytes;
        if (rowBytes < 0) {
            const nextOffset = found.index + 1 < this.header.componentCount
                ? this.componentAt(found.index + 1).rowOffset
                : this.header.fileLength - this.header.rowsOffset;
            rowBytes = nextOffset - component.rowOffset;
        }
        const uuidStringId = component.uuidId === UUID_SAME_AS_KEY ? component.keyId : component.uuidId;

        const [owner, bimId, name, uuidText] = await Promise.all([
            this.readString(component.ownerId),
            this.readString(component.bimIdId),
            this.readString(component.nameId),
            this.readString(uuidStringId)
        ]);

        // 读取该构件的连续 rows 区段
        const rowStart = this.header.rowsOffset + component.rowOffset;
        const rowEnd = rowStart + rowBytes;
        const rowsBuffer = await this.blob.slice(rowStart, rowEnd).arrayBuffer();
        const rowDv = new DataView(rowsBuffer);

        const rows = [];
        const state = { offset: 0 };
        if (this.schemaRows) {
            // schema 模式：行表只有 valueId，nameId 取自共享 schema
            await this.ensureSchemas();
            const nameIds = this.schemaNameIds?.[component.schemaId] ?? [];
            for (let i = 0; i < rowCount; i++) {
                const valueId = readVarint(rowDv, state);
                const nameId = nameIds[i];
                if (nameId === undefined) continue;
                const nameRecord = this.nameAt(nameId);
                const [group, key, path, source, rawKey, value] = await Promise.all([
                    this.readString(nameRecord.groupId),
                    this.readString(nameRecord.keyId),
                    this.readString(nameRecord.pathId),
                    this.readString(nameRecord.sourceId),
                    this.readString(nameRecord.rawKeyId),
                    this.readString(valueId)
                ]);
                rows.push({ group, key, path, value, source, rawKey });
            }
            return {
                owner,
                bimId,
                uuid: uuidText || key,
                name,
                rows
            };
        }
        for (let i = 0; i < component.rowCount; i++) {
            let nameId: number;
            let valueId: number;
            if (this.rowVarint) {
                nameId = readVarint(rowDv, state);
                valueId = readVarint(rowDv, state);
            } else {
                nameId = rowDv.getUint32(i * ROW_RECORD_BYTES, true);
                valueId = rowDv.getUint32(i * ROW_RECORD_BYTES + 4, true);
            }
            const nameRecord = this.nameAt(nameId);
            const [group, key, path, source, rawKey, value] = await Promise.all([
                this.readString(nameRecord.groupId),
                this.readString(nameRecord.keyId),
                this.readString(nameRecord.pathId),
                this.readString(nameRecord.sourceId),
                this.readString(nameRecord.rawKeyId),
                this.readString(valueId)
            ]);
            rows.push({ group, key, path, value, source, rawKey });
        }

        return {
            owner,
            bimId,
            uuid: uuidText || key,
            name,
            rows
        };
    }

    /** 兼容旧调用名：按 uuid 查询（内部主键优先 bimId，命中不到再按传入值查）。 */
    async getDocumentByUuid(uuid: string): Promise<NbimPropertyDocument | null> {
        return this.getDocumentByKey(uuid);
    }

    private nameAt(index: number) {
        const dv = this.namesView!;
        const base = index * NAME_RECORD_BYTES;
        return {
            groupId: dv.getUint32(base, true),
            keyId: dv.getUint32(base + 4, true),
            pathId: dv.getUint32(base + 8, true),
            sourceId: dv.getUint32(base + 12, true),
            rawKeyId: dv.getUint32(base + 16, true),
            count: dv.getUint32(base + 20, true)
        };
    }

    /** 属性名索引（供搜索字段下拉），与旧 manifest.propertyNameIndex 等价。 */
    async getPropertyNameIndex(): Promise<NbimPropertyNameIndexItem[]> {
        await this.ensureIndexes();
        const items: NbimPropertyNameIndexItem[] = [];
        for (let i = 0; i < this.header.nameCount; i++) {
            const record = this.nameAt(i);
            const [group, key, path, rawKey] = await Promise.all([
                this.readString(record.groupId),
                this.readString(record.keyId),
                this.readString(record.pathId),
                this.readString(record.rawKeyId)
            ]);
            items.push({ group, key, path, rawKey: rawKey || undefined, count: record.count });
        }
        return items;
    }

    getStats(): NbipStats {
        return {
            components: this.header.componentCount,
            rows: this.header.rowCount,
            names: this.header.nameCount,
            strings: this.header.stringCount,
            bytes: this.header.fileLength
        };
    }

    /**
     * 原始属性库字节（用于“原样再导出”）。
     * v11 属性是惰性读取的，内存里只有被选中的那些构件；重新导出时必须复用源字节，
     * 否则会把没读过的构件属性全部丢掉。
     */
    async getSourceBytes(): Promise<Uint8Array> {
        return new Uint8Array(await this.blob.slice(0, this.header.fileLength).arrayBuffer());
    }
}
