/**
 * NBIM v11 合成测试夹具（fixture）生成器。
 *
 * 生成的数据完全由本脚本构造：几何是程序化生成的圆柱/方块，属性是程序生成的键值对。
 * **不含任何真实模型内容、客户信息或文件路径**，可安全提交与公开分发。
 *
 * 用法：
 *   node scripts/run-nbim-fixture.mjs                 # 生成全部夹具到 docs/testing/fixtures/
 *   node scripts/run-nbim-fixture.mjs --check         # 只校验现有夹具（不重写）
 */
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve("docs", "testing", "fixtures");

// ---------------------------------------------------------------- 合成几何

/** 生成一个轴对齐立方体（12 三角形，24 顶点，含法线）。 */
function makeBox(cx, cy, cz, sx, sy, sz) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const positions = [];
    const normals = [];
    const indices = [];
    const faces = [
        { n: [1, 0, 0], c: [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]] },
        { n: [-1, 0, 0], c: [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]] },
        { n: [0, 1, 0], c: [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]] },
        { n: [0, -1, 0], c: [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]] },
        { n: [0, 0, 1], c: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
        { n: [0, 0, -1], c: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] }
    ];
    for (const f of faces) {
        const base = positions.length / 3;
        for (const v of f.c) {
            positions.push(v[0] + cx, v[1] + cy, v[2] + cz);
            normals.push(f.n[0], f.n[1], f.n[2]);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return { positions, normals, indices };
}

/** 生成一个沿 Y 轴的圆柱（segments 边，含侧面与两端盖）。 */
function makeCylinder(cx, cy, cz, radius, height, segments) {
    const positions = [];
    const normals = [];
    const indices = [];
    const half = height / 2;
    // 侧面
    for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const nx = Math.cos(a), nz = Math.sin(a);
        positions.push(cx + nx * radius, cy - half, cz + nz * radius);
        normals.push(nx, 0, nz);
        positions.push(cx + nx * radius, cy + half, cz + nz * radius);
        normals.push(nx, 0, nz);
    }
    for (let i = 0; i < segments; i++) {
        const b = i * 2;
        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    // 顶盖
    const topCenter = positions.length / 3;
    positions.push(cx, cy + half, cz); normals.push(0, 1, 0);
    for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        positions.push(cx + Math.cos(a) * radius, cy + half, cz + Math.sin(a) * radius);
        normals.push(0, 1, 0);
    }
    for (let i = 0; i < segments; i++) indices.push(topCenter, topCenter + 1 + i, topCenter + 2 + i);
    // 底盖
    const botCenter = positions.length / 3;
    positions.push(cx, cy - half, cz); normals.push(0, -1, 0);
    for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        positions.push(cx + Math.cos(a) * radius, cy - half, cz + Math.sin(a) * radius);
        normals.push(0, -1, 0);
    }
    for (let i = 0; i < segments; i++) indices.push(botCenter, botCenter + 2 + i, botCenter + 1 + i);
    return { positions, normals, indices };
}

// ---------------------------------------------------------------- 合成属性

/** 生成确定性的属性行（不依赖随机种子，保证可复现）。 */
function makePropertyRows(index) {
    const families = ["管件", "阀门", "法兰", "支架", "设备"];
    const materials = ["碳钢", "不锈钢", "合金钢", "铸铁"];
    const family = families[index % families.length];
    const rows = [];
    const push = (group, key, value) => rows.push({ group, key, value });
    push("基本信息", "构件编号", `FIX-${String(index).padStart(5, "0")}`);
    push("基本信息", "构件类型", family);
    push("基本信息", "材质", materials[index % materials.length]);
    push("尺寸", "公称直径", `DN${50 + (index % 20) * 25}`);
    push("尺寸", "长度", `${(1 + (index % 17) * 0.5).toFixed(1)} m`);
    push("尺寸", "壁厚", `${(3 + (index % 7)).toFixed(1)} mm`);
    push("施工", "安装标高", `${(index % 30) * 0.5 + 1.0} m`);
    push("施工", "所属区域", `区域-${String.fromCharCode(65 + (index % 6))}`);
    push("施工", "备注", index % 5 === 0 ? "需保温" : "—");
    return rows;
}

// ---------------------------------------------------------------- 夹具定义

const FIXTURES = [
    {
        name: "tiny",
        description: "最小夹具：2 个构件，验证容器头/区段边界",
        instances: 2,
        shape: (i) => makeBox(i * 2, 0, 0, 1, 1, 1)
    },
    {
        name: "small",
        description: "小夹具：120 个构件，验证属性块与去重",
        instances: 120,
        shape: (i) => makeCylinder((i % 12) * 1.5, Math.floor(i / 12) * 1.5, 0, 0.4, 1.0, 12)
    },
    {
        name: "medium",
        description: "中夹具：400 个构件，验证多分块与索引类型",
        instances: 200,
        shape: (i) => makeCylinder((i % 30) * 1.2, Math.floor(i / 30) * 1.2, 0, 0.35, 1.0, 16)
    },
    {
        name: "multibyte",
        description: "多字节/边界字符串：中文、空串、超长值、重复值",
        instances: 40,
        shape: (i) => makeBox(i, 0, 0, 1, 1, 1),
        specialRows: true
    }
];

/** 多字节/边界字符串属性行：覆盖前向编码池、空串、超长串。 */
function makeSpecialRows(index) {
    const rows = [];
    rows.push({ group: "边界", key: "中文值", value: "值_测试_中文内容_编号" + index });
    rows.push({ group: "边界", key: "空值", value: "" });
    rows.push({ group: "边界", key: "超长值", value: "L".repeat(3000) + index });
    rows.push({ group: "边界", key: "重复值", value: "完全相同的一段文本，用于验证去重复用" });
    rows.push({ group: "边界", key: "前缀共享A", value: "共同前缀/分支甲" });
    rows.push({ group: "边界", key: "前缀共享B", value: "共同前缀/分支乙" });
    rows.push({ group: "边界", key: "emoji", value: "设备⚙️编号" + index });
    rows.push({ group: "边界", key: "含逗号", value: "a,b,c;d|e" });
    return rows;
}

// ---------------------------------------------------------------- 输出

function buildFixture(spec) {
    const geometries = [];
    const instances = [];
    const docs = [];
    for (let i = 0; i < spec.instances; i++) {
        const geo = spec.shape(i);
        geometries.push({
            positions: geo.positions,
            normals: geo.normals,
            indices: geo.indices,
            instances: [{
                bimId: `FIX-${String(i).padStart(5, "0")}`,
                color: 0x8899aa,
                matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
            }]
        });
        docs.push({
            key: `FIX-${String(i).padStart(5, "0")}`,
            bimId: `FIX-${String(i).padStart(5, "0")}`,
            name: `合成构件 ${i}`,
            rows: spec.specialRows ? makeSpecialRows(i) : makePropertyRows(i)
        });
    }
    return { geometries, instances, docs };
}

function summarize(fixture) {
    let verts = 0, tris = 0, rows = 0, strings = new Set();
    for (const g of fixture.geometries) {
        verts += g.positions.length / 3;
        tris += g.indices.length / 3;
    }
    for (const d of fixture.docs) {
        rows += d.rows.length;
        strings.add(d.key); strings.add(d.name);
        for (const r of d.rows) { strings.add(r.group); strings.add(r.key); strings.add(r.value); }
    }
    return { geometries: fixture.geometries.length, verts, tris, docs: fixture.docs.length, rows, distinctStrings: strings.size };
}

function main() {
    const check = process.argv.includes("--check");
    if (!check) fs.mkdirSync(OUT_DIR, { recursive: true });

    const manifest = [];
    for (const spec of FIXTURES) {
        const fixture = buildFixture(spec);
        const stats = summarize(fixture);
        const fileName = `${spec.name}.fixture.json`;
        const payload = {
            $schema: "nbim11-fixture/1",
            name: spec.name,
            description: spec.description,
            synthetic: true,
            note: "本文件由 scripts/nbim-fixture.mjs 程序化生成，不含任何真实模型数据。",
            stats,
            ...fixture
        };
        const target = path.join(OUT_DIR, fileName);
        if (check) {
            if (!fs.existsSync(target)) {
                console.error(`缺失夹具: ${fileName}`);
                process.exitCode = 2;
                continue;
            }
            const existing = JSON.parse(fs.readFileSync(target, "utf8"));
            const same = JSON.stringify(existing.stats) === JSON.stringify(stats);
            console.log(`${same ? "✓" : "✗"} ${fileName}  ${JSON.stringify(stats)}`);
            if (!same) process.exitCode = 2;
        } else {
            fs.writeFileSync(target, JSON.stringify(payload));
            console.log(`写入 ${fileName}  ${JSON.stringify(stats)}`);
        }
        manifest.push({ name: spec.name, file: fileName, description: spec.description, stats });
    }

    if (!check) {
        fs.writeFileSync(
            path.join(OUT_DIR, "manifest.json"),
            JSON.stringify({ $schema: "nbim11-fixture-manifest/1", generatedBy: "scripts/nbim-fixture.mjs", fixtures: manifest }, null, 2)
        );
        console.log(`写入 manifest.json（${manifest.length} 个夹具）`);
    }
}

main();
