#!/usr/bin/env node
/**
 * 山林公共环境细化 · 备份 / 回滚工具（纯代码，无二进制资产）。
 *
 *   node scripts/rollback-mountain-env.mjs --backup   # 部署前：快照当前 HEAD + 环境相关文件清单
 *   node scripts/rollback-mountain-env.mjs            # 部署失败：把环境相关文件还原到备份的 HEAD 版本
 *   node scripts/rollback-mountain-env.mjs --dry-run  # 只看会还原什么，不动文件
 *   node scripts/rollback-mountain-env.mjs --list     # 列出当前备份快照
 *
 * 说明：本迭代的山林环境是程序化几何（mountainEnv.js）+ ThreeWorld.js 的外科接入，没有 GLB / 贴图等
 * 二进制资产。因此"备份"记录的是部署前的 commit SHA 与环境相关文件清单；"回滚"用
 * `git checkout <sha> -- <文件>` 把这些文件还原到部署前状态。其它业务文件一概不动。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const BACKUP_FILE = path.resolve('.workbuddy/tmp/mountain-env-backup.json');

/** 环境迭代涉及的文件（仅这些会被备份 / 回滚）。 */
const ENV_FILES = [
  'frontend/src/virtual-utopia/webgl/decorations/mountainEnv.js',
  'frontend/src/virtual-utopia/webgl/ThreeWorld.js',
];

const MODE_BACKUP = process.argv.includes('--backup');
const MODE_LIST = process.argv.includes('--list');
const DRY_RUN = process.argv.includes('--dry-run');

const git = (args) => execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8' }).trim();
const shortHash = (file) => {
  try {
    return createHash('sha256').update(readFileSync(path.resolve(ROOT, file))).digest('hex').slice(0, 12);
  } catch {
    return '(缺失)';
  }
};

console.log('目标：山林公共环境细化（纯代码，git 快照式备份/回滚）\n');

// ---------------------------------------------------------------- --list
if (MODE_LIST) {
  if (!existsSync(BACKUP_FILE)) {
    console.log('（尚无备份快照，请先跑 --backup）');
    process.exit(0);
  }
  const snap = JSON.parse(readFileSync(BACKUP_FILE, 'utf8'));
  console.log(`备份于 HEAD: ${snap.head}`);
  console.log(`时间: ${snap.time}`);
  snap.files.forEach((f) => console.log(`  · ${f}  (sha256=${shortHash(f)})`));
  process.exit(0);
}

// ---------------------------------------------------------------- --backup
if (MODE_BACKUP) {
  mkdirSync(path.dirname(BACKUP_FILE), { recursive: true });
  const head = git('rev-parse HEAD');
  const snapshot = {
    head,
    time: new Date().toISOString(),
    files: ENV_FILES,
  };
  writeFileSync(BACKUP_FILE, JSON.stringify(snapshot, null, 2));
  console.log(`OK  已快照 HEAD=${head}`);
  snapshot.files.forEach((f) =>
    console.log(`     · ${f}  (当前 sha256=${shortHash(f)})`),
  );
  console.log('\n若后续部署出现 FAIL，运行：node scripts/rollback-mountain-env.mjs');
  process.exit(0);
}

// ---------------------------------------------------------------- 还原
if (!existsSync(BACKUP_FILE)) {
  console.log('FAIL 找不到备份快照，请先跑 --backup，或 git reset --hard <部署前 commit>。');
  process.exit(1);
}
const snap = JSON.parse(readFileSync(BACKUP_FILE, 'utf8'));
const missing = snap.files.filter((f) => !existsSync(path.resolve(ROOT, f)));

if (DRY_RUN) {
  console.log(`dry-run: 将把以下文件还原到 HEAD=${snap.head}`);
  snap.files.forEach((f) => console.log(`  → git checkout ${snap.head.slice(0, 12)} -- ${f}`));
  console.log('去掉 --dry-run 即执行。');
  process.exit(0);
}

console.log(`还原环境相关文件到 HEAD=${snap.head} ...\n`);
snap.files.forEach((f) => {
  try {
    git(`checkout ${snap.head} -- ${f}`);
    console.log(`OK   ${f}  → sha256=${shortHash(f)}`);
  } catch (e) {
    console.log(`FAIL ${f}  ${e.message}`);
  }
});

if (missing.length) {
  console.log(`\n注意：以下文件在备份时已不存在，已跳过：${missing.join(', ')}`);
}
console.log('\n还原完成。建议紧接着跑：node scripts/verify-mountain-env.mjs');
process.exit(missing.length ? 1 : 0);
