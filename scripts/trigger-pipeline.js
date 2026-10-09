#!/usr/bin/env node
/**
 * IMWallet CI/CD 流水线触发脚本（跨平台，仅依赖 Node.js 内置模块）
 * ================================================================
 *
 * 用法：
 *   node scripts/trigger-pipeline.js <target> [version] [options]
 *
 * target（流水线目标）：
 *   android          Android APK —— GitHub Actions 本地构建（build-android-github.yml）
 *   android-eas      Android APK —— EAS 云构建（build-android.yml）
 *   ios              iOS IPA —— EAS 云构建（build-ios.yml）
 *   ios-store        iOS App Store —— EAS 构建并提交（build-ios-store.yml）
 *   server           服务端二进制 Release（Linux/Windows）（server-release.yml）
 *   server-docker    服务端 Docker 镜像（server-docker.yml）
 *   server-ci        服务端 CI（lint/test）（server-ci.yml）
 *
 * version：
 *   - server / server-docker：必填（如 v0.2.10 / latest）
 *   - android / android-eas / ios / ios-store：可选，留空则流水线内部读取 package.json
 *
 * options：
 *   --ref <branch|tag>   指定触发用的 ref（默认 main）
 *   --watch              触发后轮询并打印运行状态，直到结束
 *   --repo <owner/repo>  指定仓库（默认从 git remote origin 自动识别）
 *   --token <token>      GitHub Token（默认读取 GITHUB_TOKEN / GH_TOKEN / ~/.git-credentials）
 *   -h, --help           显示帮助
 *
 * 示例：
 *   node scripts/trigger-pipeline.js server v0.2.10
 *   node scripts/trigger-pipeline.js android 1.2.25 --watch
 *   node scripts/trigger-pipeline.js ios-store --watch
 *   node scripts/trigger-pipeline.js server-docker latest --repo sixinyiyu/imwallet
 *
 * 提示：Token 需要具备 `actions:write`（经典 PAT 需要 repo 权限）才能触发 workflow_dispatch。
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------------------------------------------------------------------------
// 目标流水线定义
// ---------------------------------------------------------------------------
const TARGETS = {
    android: {
        workflow: 'build-android-github.yml',
        inputKey: 'version',
        label: 'Android APK（GitHub Actions 本地构建）',
        versionRequired: false,
    },
    'android-eas': {
        workflow: 'build-android.yml',
        inputKey: 'version',
        label: 'Android APK（EAS 云构建）',
        versionRequired: false,
    },
    ios: {
        workflow: 'build-ios.yml',
        inputKey: 'version',
        label: 'iOS IPA（EAS 云构建）',
        versionRequired: false,
    },
    'ios-store': {
        workflow: 'build-ios-store.yml',
        inputKey: 'version',
        label: 'iOS App Store（EAS 构建并提交）',
        versionRequired: false,
    },
    server: {
        workflow: 'server-release.yml',
        inputKey: 'version',
        label: '服务端二进制 Release（Linux/Windows）',
        versionRequired: true,
    },
    'server-docker': {
        workflow: 'server-docker.yml',
        inputKey: 'tag',
        label: '服务端 Docker 镜像',
        versionRequired: true,
    },
    'server-ci': {
        workflow: 'server-ci.yml',
        inputKey: null,
        label: '服务端 CI（lint/test）',
        versionRequired: false,
    },
};

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------
function parseArgs(argv) {
    const opts = { ref: 'main', watch: false, repo: null, token: null, target: null, version: null };
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--watch') opts.watch = true;
        else if (a === '--ref') opts.ref = argv[++i];
        else if (a === '--repo') opts.repo = argv[++i];
        else if (a === '--token') opts.token = argv[++i];
        else if (a === '-h' || a === '--help') opts.help = true;
        else positional.push(a);
    }
    opts.target = positional[0] || null;
    opts.version = positional[1] || null;
    return opts;
}

function printHelp() {
    const lines = fs.readFileSync(__filename, 'utf8').split('\n');
    // 打印文件头部的注释块（去掉 /** 与 */ 两行）
    const start = lines.findIndex((l) => l.startsWith('/**'));
    const end = lines.findIndex((l, i) => i > start && l.trim() === '*/');
    console.log(
        lines
            .slice(start + 1, end)
            .map((l) => l.replace(/^\s*\*?\s?/, ''))
            .join('\n')
    );
    console.log('\n可用 target：');
    for (const [k, v] of Object.entries(TARGETS)) {
        console.log(`  ${k.padEnd(14)} ${v.label}  [${v.workflow}]`);
    }
}

// ---------------------------------------------------------------------------
// 仓库 / Token 解析
// ---------------------------------------------------------------------------
function detectRepo(explicit) {
    if (explicit) return explicit;
    if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
    try {
        const url = execSync('git remote get-url origin', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
        if (m) return `${m[1]}/${m[2]}`;
    } catch (_) {
        /* ignore */
    }
    throw new Error('无法自动识别仓库，请使用 --repo <owner/repo> 指定');
}

function detectToken(explicit) {
    if (explicit) return explicit;
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
    if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
    const credPath = path.join(os.homedir(), '.git-credentials');
    if (fs.existsSync(credPath)) {
        const line = fs
            .readFileSync(credPath, 'utf8')
            .split('\n')
            .find((l) => l.includes('github.com'));
        if (line) {
            const m = line.match(/^https:\/\/([^:]+):([^@]+)@github\.com/);
            if (m) return m[2];
        }
    }
    throw new Error('未找到 GitHub Token，请设置 GITHUB_TOKEN 环境变量或使用 --token 指定');
}

// ---------------------------------------------------------------------------
// GitHub API
// ---------------------------------------------------------------------------
async function ghApi(method, url, token, body) {
    const res = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'imwallet-trigger-script',
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null; // dispatch 成功无返回体
    const text = await res.text();
    if (!res.ok) {
        let hint = '';
        if (res.status === 401) hint = '（Token 无效或已过期）';
        else if (res.status === 403) hint = '（Token 权限不足，需要 actions:write / repo 权限）';
        else if (res.status === 404) hint = '（仓库或 workflow 不存在，或 Token 无该仓库权限）';
        throw new Error(`GitHub API ${res.status} ${hint}\n${text}`);
    }
    return text ? JSON.parse(text) : null;
}

async function dispatch({ repo, token, workflow, ref, inputs }) {
    const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`;
    await ghApi('POST', url, token, { ref, inputs });
}

async function findRun({ repo, token, workflow, ref, sinceMs }) {
    const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/runs?per_page=10`;
    const data = await ghApi('GET', url, token);
    const runs = (data && data.workflow_runs) || [];
    // 选取触发时间 >= 触发开始时刻、且 ref 匹配的最新一次运行
    return (
        runs
            .filter((r) => new Date(r.created_at).getTime() >= sinceMs - 15000)
            .filter((r) => !ref || r.head_branch === ref)
            .sort((a, b) => b.run_number - a.run_number)[0] || null
    );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function watchRun({ repo, token, workflow, ref, sinceMs }) {
    process.stdout.write('⏳ 等待运行创建');
    let run = null;
    for (let i = 0; i < 20 && !run; i++) {
        await sleep(3000);
        process.stdout.write('.');
        run = await findRun({ repo, token, workflow, ref, sinceMs });
    }
    console.log();
    if (!run) {
        console.log('⚠️ 未找到对应的运行记录，请到 Actions 页面查看。');
        return;
    }
    console.log(`🔗 运行 #${run.run_number}: ${run.html_url}`);

    const icon = (s, c) => (c === 'success' ? '✅' : c === 'failure' ? '❌' : c ? `⚠️ ${c}` : '🔄');
    let last = null;
    while (true) {
        const cur = await ghApi('GET', `https://api.github.com/repos/${repo}/actions/runs/${run.id}`, token);
        const line = `  状态: ${cur.status}  结论: ${cur.conclusion || '-'}`;
        if (line !== last) {
            console.log(line);
            last = line;
        }
        if (cur.status === 'completed') {
            console.log(`${icon(cur.status, cur.conclusion)} 流水线结束，结论：${cur.conclusion}`);
            console.log(`🔗 ${cur.html_url}`);
            process.exitCode = cur.conclusion === 'success' ? 0 : 1;
            return;
        }
        await sleep(15000);
    }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
    const opts = parseArgs(process.argv.slice(2));

    if (opts.help || !opts.target) {
        printHelp();
        process.exit(opts.target ? 0 : 1);
    }

    const target = TARGETS[opts.target];
    if (!target) {
        console.error(`❌ 未知 target: ${opts.target}`);
        console.error(`   可用 target: ${Object.keys(TARGETS).join(', ')}`);
        process.exit(1);
    }

    if (target.versionRequired && !opts.version) {
        console.error(`❌ target "${opts.target}" 需要指定版本号，例如：`);
        console.error(`   node scripts/trigger-pipeline.js ${opts.target} ${opts.target === 'server-docker' ? 'latest' : 'v0.2.10'}`);
        process.exit(1);
    }

    const repo = detectRepo(opts.repo);
    const token = detectToken(opts.token);

    const inputs = {};
    if (target.inputKey) {
        inputs[target.inputKey] = opts.version || '';
    }

    console.log('🚀 触发流水线');
    console.log(`   仓库     : ${repo}`);
    console.log(`   流水线   : ${target.label}`);
    console.log(`   workflow : ${target.workflow}`);
    console.log(`   ref      : ${opts.ref}`);
    if (target.inputKey) console.log(`   ${target.inputKey.padEnd(8)} : ${opts.version || '(读取 package.json)'}`);
    console.log('');

    const sinceMs = Date.now();
    await dispatch({ repo, token, workflow: target.workflow, ref: opts.ref, inputs });
    console.log('✅ 触发成功（HTTP 204）');
    console.log(`🔗 https://github.com/${repo}/actions/workflows/${target.workflow}`);

    if (opts.watch) {
        await watchRun({ repo, token, workflow: target.workflow, ref: opts.ref, sinceMs });
    } else {
        console.log('\n提示：加 --watch 可实时跟踪运行状态。');
    }
}

main().catch((err) => {
    console.error(`\n❌ ${err.message}`);
    process.exit(1);
});
