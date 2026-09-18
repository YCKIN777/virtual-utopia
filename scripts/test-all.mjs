#!/usr/bin/env node
/**
 * 全量回归聚合脚本（R-23）：一条命令跑完所有单元测试 + E2E，产出统一结论。
 *
 * 用法：node scripts/test-all.mjs
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SUITES = [
  { label: 'backend 单元测试', cwd: ROOT, cmd: 'npm', args: ['test', '--workspace', 'backend'] },
  { label: 'frontend 单元测试', cwd: ROOT, cmd: 'npm', args: ['test', '--workspace', 'frontend'] },
  { label: '场景流 E2E', cwd: ROOT, cmd: 'npm', args: ['run', 'test:e2e'] },
  { label: 'BP3 单元测试', cwd: resolve(ROOT, 'bp3'), cmd: 'npm', args: ['run', 'test'] },
];

let failed = 0;
const results = [];

for (const suite of SUITES) {
  console.log('\n[test-all] ' + suite.label + ' ...');
  try {
    execFileSync(suite.cmd, suite.args, { cwd: suite.cwd, stdio: 'inherit' });
    results.push({ label: suite.label, ok: true });
  } catch {
    failed += 1;
    results.push({ label: suite.label, ok: false });
  }
}

console.log('\n[test-all] 汇总:');
for (const r of results) {
  console.log((r.ok ? '  [ok] ' : '  [FAIL] ') + r.label);
}
console.log(
  failed === 0
    ? '[test-all] 全部通过'
    : '[test-all] ' + failed + ' 项失败',
);
process.exit(failed === 0 ? 0 : 1);
