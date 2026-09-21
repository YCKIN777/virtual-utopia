#!/usr/bin/env node
/**
 * 宅院模型部署「备份 / 回滚」工具。
 *
 *   node scripts/rollback-manor-deploy.mjs --backup            # 部署前：把当前 GLB 快照到备份目录
 *   node scripts/rollback-manor-deploy.mjs                     # 部署失败：从备份还原三个 GLB
 *   node scripts/rollback-manor-deploy.mjs --dry-run           # 只看会还原什么，不动文件
 *   node scripts/rollback-manor-deploy.mjs --from <dir>        # 指定备份目录（默认 .workbuddy/tmp/manor-backup）
 *   node scripts/rollback-manor-deploy.mjs --list              # 列出备份目录里的快照
 *
 * 只动 `frontend/src/virtual-utopia/webgl/models/*-manor.glb` 三个模型文件，
 * 不碰代码、材质、坐标、碰撞与任何业务逻辑。
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { inspectGlb } from './inspect-manor-glb.mjs';

const MODELS_DIR = path.resolve('frontend/src/virtual-utopia/webgl/models');
const TARGETS = ['terrace-manor.glb', 'forest-manor.glb', 'cliff-manor.glb'];

const argOf = (flag, fallback = null) => {
  const withEq = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (withEq) return withEq.slice(flag.length + 1);
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')
    ? process.argv[idx + 1]
    : fallback;
};

const BACKUP_DIR = path.resolve(
  argOf('--from', argOf('--to', '.workbuddy/tmp/manor-backup')),
);
const MODE_BACKUP = process.argv.includes('--backup');
const MODE_LIST = process.argv.includes('--list');
const DRY_RUN = process.argv.includes('--dry-run');

const shortHash = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12);

const describe = (dir, name) => {
  const full = path.join(dir, name);
  if (!existsSync(full)) return { name, exists: false };
  const stat = statSync(full);
  let geometry = null;
  try {
    const glb = inspectGlb(full);
    geometry = `${glb.triangles} 面 · ${glb.sizeX.toFixed(2)}×${glb.sizeZ.toFixed(2)}×${glb.sizeY.toFixed(2)}`;
  } catch {
    geometry = '（无法解析）';
  }
  return {
    name,
    exists: true,
    bytes: stat.size,
    mtime: new Date(stat.mtimeMs).toISOString().slice(0, 19).replace('T', ' '),
    hash: shortHash(full),
    geometry,
  };
};

const pad = (s, n) => String(s).padEnd(n);

console.log(`备份目录: ${BACKUP_DIR}`);
console.log(`模型目录: ${MODELS_DIR}\n`);

// ------------------------------------------------------------------ --list
if (MODE_LIST) {
  if (!existsSync(BACKUP_DIR)) {
    console.log('（备份目录不存在，尚未做过备份）');
    process.exit(0);
  }
  const files = readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.glb')).sort();
  if (!files.length) {
    console.log('（备份目录为空）');
    process.exit(0);
  }
  console.log('名称 | 字节 | 修改时间 | sha256 | 几何');
  console.log('-'.repeat(72));
  files.forEach((f) => {
    const d = describe(BACKUP_DIR, f);
    console.log(
      `${pad(d.name, 22)}| ${pad(d.bytes, 8)}| ${pad(d.mtime, 20)}| ${pad(d.hash, 14)}| ${d.geometry}`,
    );
  });
  process.exit(0);
}

// ------------------------------------------------------------------ --backup
if (MODE_BACKUP) {
  mkdirSync(BACKUP_DIR, { recursive: true });
  let copied = 0;
  let missing = 0;

  TARGETS.forEach((name) => {
    const src = path.join(MODELS_DIR, name);
    if (!existsSync(src)) {
      console.log(`MISS ${name} —— 模型目录里没有这个文件，跳过`);
      missing += 1;
      return;
    }
    const dst = path.join(BACKUP_DIR, name);
    if (DRY_RUN) {
      console.log(`DRY  ${name} → ${path.relative(process.cwd(), dst)}`);
      return;
    }
    copyFileSync(src, dst);
    const d = describe(BACKUP_DIR, name);
    console.log(`OK   ${pad(name, 22)} ${pad(d.bytes + 'B', 10)} sha256=${d.hash} · ${d.geometry}`);
    copied += 1;
  });

  console.log(
    `\n=== 备份完成: 复制 ${copied} 个${DRY_RUN ? '（dry-run，未实际写入）' : ''}，缺失 ${missing} 个 ===`,
  );
  process.exit(missing && !copied ? 1 : 0);
}

// ------------------------------------------------------------------ 还原
if (!existsSync(BACKUP_DIR)) {
  console.log(`FAIL 备份目录不存在: ${BACKUP_DIR}`);
  console.log('     请先做一次 --backup，或 --from 指定正确的备份目录。');
  process.exit(1);
}

const snapshot = TARGETS.map((name) => ({
  name,
  backup: describe(BACKUP_DIR, name),
  current: describe(MODELS_DIR, name),
}));

console.log('还原计划：');
console.log('  名称 | 当前 sha256 | 备份 sha256 | 几何（备份）');
console.log('  ' + '-'.repeat(68));
snapshot.forEach((row) => {
  console.log(
    `  ${pad(row.name, 22)}| ${pad(row.current.hash || '-', 14)}| ${pad(row.backup.hash || '-', 14)}| ${row.backup.geometry || '-'}`,
  );
});

const restorable = snapshot.filter((r) => r.backup.exists);
const alreadySame = restorable.filter((r) => r.current.hash === r.backup.hash);

if (!restorable.length) {
  console.log('\nFAIL 备份目录里没有任何可用的 GLB，无法还原。');
  process.exit(1);
}

if (DRY_RUN) {
  console.log(
    `\n=== dry-run: 将还原 ${restorable.length} 个文件（其中 ${alreadySame.length} 个与备份已一致） ===`,
  );
  console.log('去掉 --dry-run 即执行。');
  process.exit(0);
}

let restored = 0;

restorable.forEach((row) => {
  copyFileSync(path.join(BACKUP_DIR, row.name), path.join(MODELS_DIR, row.name));
  const after = describe(MODELS_DIR, row.name);
  const ok = after.hash === row.backup.hash;
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${pad(row.name, 22)} → sha256=${after.hash} · ${after.geometry}`,
  );
  if (ok) restored += 1;
});

console.log(
  `\n=== 还原完成: ${restored}/${restorable.length} 个文件已回到备份状态 ===`,
);
console.log('建议紧接着跑：node scripts/verify-manor-deploy.mjs --glb-only');
process.exit(restored === restorable.length ? 0 : 1);
