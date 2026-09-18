import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED_DIRS = [
  'frontend',
  'backend',
  'bp3',
  'docs',
  'database',
  'data',
  'scripts',
  'backend/src/agents',
  'backend/src/routes',
  'backend/src/services',
  'backend/src/rag',
  'backend/src/phase4',
  'backend/src/phase5',
  'backend/src/phase6',
];

// 冻结目录：这些目录的源码不得被脚本自动修改
const FROZEN_DIRS = [
  'backend/src/agents',
  'backend/src/routes',
  'backend/src/services',
  'backend/src/rag',
  'backend/src/phase4',
];

// 服务端口清单（文档基线）
const PORTS = {
  'BP2 后端': 3000,
  RAG: 3100,
  Phase4: 3200,
  Phase5: 3300,
  Phase6: 3400,
  'BP3 后端': 3500,
  '前端 5173': 5173,
  世界前端: 5175,
  'BP3 前端': 5176,
};

let failed = 0;

for (const d of REQUIRED_DIRS) {
  if (existsSync(join(ROOT, d))) {
    console.log('[ok] ' + d);
  } else {
    console.log('[MISSING] ' + d);
    failed++;
  }
}

console.log('');
console.log('[frozen] 冻结目录: ' + FROZEN_DIRS.join(', '));
console.log('[ports] ' + JSON.stringify(PORTS, null, 2));

console.log('');
console.log(
  failed === 0
    ? '[pass] 结构校验通过'
    : '[fail] 存在 ' + failed + ' 个缺失目录',
);
process.exitCode = failed === 0 ? 0 : 1;
