#!/usr/bin/env node
/**
 * 冻结边界检查脚本（R-15）：检测冻结目录/文件是否有未提交变更。
 * 依赖 git 仓库；用于 CI 或提交前拦截对冻结产物的修改。
 *
 * 用法：node scripts/check-frozen.mjs
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FROZEN = [
  'backend/src/agents',
  'backend/src/routes',
  'backend/src/services',
  'backend/src/rag',
  'backend/src/phase4',
  'stage2_memory.md',
  'stage3_memory.md',
  'stage4_memory.md',
];

let violations = 0;

for (const path of FROZEN) {
  let out;
  try {
    out = execFileSync('git', ['status', '--porcelain', '--', path], {
      cwd: ROOT,
      encoding: 'utf8',
    });
  } catch (error) {
    console.error('[冻结检查] git 不可用或仓库未初始化: ' + (error && error.message));
    process.exit(2);
  }
  if (out.trim()) {
    violations += 1;
    console.log('[冻结违规] ' + path + ':');
    console.log(out.trim());
  }
}

if (violations === 0) {
  console.log('[冻结检查] 通过：冻结目录/文件无未提交变更');
} else {
  console.log('[冻结检查] 发现 ' + violations + ' 处冻结目录变更，请勿提交');
}
process.exit(violations === 0 ? 0 : 1);
