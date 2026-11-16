#!/usr/bin/env node
/**
 * npm 历史版本删除工具 —— 把已发布到 npm registry 的历史版本逐个下架（unpublish）。
 *
 * 背景：本项目已停止 npm 发布（保留 NBIM v11 本地分发），
 * 这个脚本用于把 registry 上残留的旧版本清掉。
 *
 * 用法：
 *   node scripts/npm-unpublish-history.mjs                # 预演（DRY RUN），只打印将执行的命令
 *   node scripts/npm-unpublish-history.mjs --execute      # 真正执行 unpublish
 *   node scripts/npm-unpublish-history.mjs --execute --otp=123456   # 账号开启 2FA 时传入一次性验证码
 *   node scripts/npm-unpublish-history.mjs --package=foo  # 覆盖包名（默认取 package.json 的 name）
 *   node scripts/npm-unpublish-history.mjs --keep-latest  # 保留最新一个版本，只删历史版本
 *
 * 说明：
 *   - unpublish 单个版本需要 --force；npm 政策可能限制最近 24h 内发布包的整包下架，
 *     逐版本下架通常可行；若返回 403/需要 OTP，按提示加 --otp 或去 npm 网页端操作。
 *   - 全部版本删除后，npmjs.com 上的包页面会自动消失。
 *   - 需要先 `npm login`（或本机已有 ~/.npmrc 凭据）。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

function parseArgs(argv) {
    const args = { execute: false, keepLatest: false, otp: null, pkg: null };
    for (const a of argv) {
        if (a === "--execute") args.execute = true;
        else if (a === "--keep-latest") args.keepLatest = true;
        else if (a.startsWith("--otp=")) args.otp = a.slice("--otp=".length);
        else if (a.startsWith("--package=")) args.pkg = a.slice("--package=".length);
        else if (a === "--help" || a === "-h") args.help = true;
        else {
            console.error(`未知参数: ${a}`);
            process.exit(1);
        }
    }
    return args;
}

function runNpm(args, opts = {}) {
    const cmd = [NPM, ...args].join(" ");
    const r = spawnSync(cmd, { shell: true, encoding: "utf8", ...opts });
    return { code: r.status ?? 1, stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").trim(), cmd };
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("*/")[0] + "*/");
        return;
    }

    const root = process.cwd();
    const pkgJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const pkg = args.pkg || pkgJson.name;

    console.log(`包名: ${pkg}`);
    console.log(`模式: ${args.execute ? "EXECUTE（真实下架）" : "DRY RUN（预演，不改动）"}`);
    console.log();

    // 1. 登录态检查：拉取包信息
    const view = runNpm(["view", pkg, "versions", "--json"]);
    if (view.code !== 0) {
        console.error(`读取版本列表失败（可能未登录或包不存在）：\n${view.stderr || view.stdout}`);
        console.error("\n提示：先运行 `npm whoami` / `npm login`。如果包本身不存在，则无需清理。");
        process.exit(1);
    }
    let versions;
    try {
        versions = JSON.parse(view.stdout);
    } catch {
        console.error(`无法解析版本列表:\n${view.stdout}`);
        process.exit(1);
    }
    if (!Array.isArray(versions) || versions.length === 0) {
        console.log("registry 上没有任何历史版本，无需处理。");
        return;
    }
    // npm view 可能返回 semver 排序而非发布顺序，按 publish time 排序最稳妥
    const timeView = runNpm(["view", pkg, "time", "--json"]);
    let times = {};
    if (timeView.code === 0) {
        try { times = JSON.parse(timeView.stdout) || {}; } catch { /* ignore */ }
    }
    versions.sort((a, b) => new Date(times[a] || 0) - new Date(times[b] || 0));
    const targets = args.keepLatest ? versions.slice(0, -1) : versions;

    console.log(`registry 上的版本（${versions.length} 个）：`);
    for (const v of versions) {
        const t = times[v] ? `  (${times[v]})` : "";
        console.log(`  - ${v}${t}${args.keepLatest && v === versions[versions.length - 1] ? "  [保留]" : "  [待删除]"}`);
    }
    console.log();

    if (!args.execute) {
        console.log("DRY RUN：将逐个执行以下命令（加 --execute 才会真正执行）：");
        for (const v of targets) {
            const otp = args.otp ? ` --otp=${args.otp}` : "";
            console.log(`  npm unpublish ${pkg}@${v} --force${otp}`);
        }
        console.log("\n确认无误后运行: node scripts/npm-unpublish-history.mjs --execute");
        return;
    }

    // 2. 逐版本下架
    let ok = 0, fail = 0;
    for (const v of targets) {
        const npmArgs = ["unpublish", `${pkg}@${v}`, "--force"];
        if (args.otp) npmArgs.push(`--otp=${args.otp}`);
        const r = runNpm(npmArgs);
        if (r.code === 0) {
            ok++;
            console.log(`✔ 已下架 ${pkg}@${v}`);
        } else {
            fail++;
            console.log(`✘ 下架失败 ${pkg}@${v}`);
            if (r.stderr) console.log(`    ${r.stderr.split("\n").slice(0, 4).join("\n    ")}`);
        }
    }

    console.log(`\n完成：成功 ${ok}，失败 ${fail}`);
    if (fail > 0) {
        console.log("常见失败原因：");
        console.log("  - 需要 2FA 验证码：加 --otp=XXXXXX 重新运行");
        console.log("  - 403：账号无权限，确认 `npm whoami` 是发布者");
        console.log("  - npm 政策限制：包发布超过 72h 只允许逐版本下架，不允许整包一键消失——本脚本正是逐版本处理");
        process.exit(2);
    }
    if (targets.length === versions.length) {
        console.log("所有版本均已下架，npm 上已无此包。");
    }
}

main();
