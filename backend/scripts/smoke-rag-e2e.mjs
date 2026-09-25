// P2 真实联调：ingest → query 全链路（需 Chroma 运行在 localhost:8000）。
// 验证：
//   1) langchain 引擎（官方 TextSplitter + Chroma 集成）真实写入与检索
//   2) 跨引擎兼容：同一库内 legacy 自研检索也能命中（哈希向量同构承诺）
// 用法：node scripts/smoke-rag-e2e.mjs
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(currentDir, '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const fixturesDir = path.join(backendRoot, 'rag-docs', '_e2e-fixtures');

const fixtures = [
  {
    name: 'basic-rules.md',
    content:
      '# 乌托邦基本规则\n\n虚拟乌托邦是一座以乡墅生活为核心的多人在线世界。\n\n每位原住民都拥有50块宅院地块中的一块，可以在院内自由布置家具，也可以开放参观。\n\n所有居民在广场上享有平等的发言权，可以讨论公共事务、发起投票、分享生活见闻。\n\n邻里之间应当互相尊重，恶意破坏他人宅院的行为将被城主记录并处理。',
  },
  {
    name: 'social-life.md',
    content:
      '# 广场与邻里社交\n\n广场是乌托邦邻里交流的中心。\n\n居民每天可以在广场签到，与邻居打招呼，参与公共话题讨论。\n\n定期举办的市集活动允许居民摆摊交易自产物品。\n\n宅院开放参观是结识新邻居的主要方式，参观者可以留下留言。',
  },
  {
    name: 'visitor-system.md',
    content:
      '# 访客制度\n\n访客进入乌托邦需要先提交申请，说明来访目的和预计停留时间。\n\n城主对访客申请进行审核，审核通过后分配临时名额。\n\n每位访客同时只能占用一个名额，名额在访客离开后自动释放。\n\n访客在乌托邦内享有参观权利，但不参与公共事务投票。',
  },
];

// 1) 准备测试文档
await fs.mkdir(fixturesDir, { recursive: true });
for (const fixture of fixtures) {
  await fs.writeFile(
    path.join(fixturesDir, fixture.name),
    fixture.content,
    'utf8',
  );
}

const { createRagEngine } = await import('../src/ai/ragEngine.js');
const langchainEngine = createRagEngine({ backend: 'langchain' });
const legacyEngine = createRagEngine({ backend: 'legacy' });

const fixturePaths = ['_e2e-fixtures']; // 相对 rag-docs，由 documentLoader 递归收集

// 2) langchain 引擎 ingest（reset=true 清空后写入）
const ingestResult = await langchainEngine.ingestDocuments({
  paths: fixturePaths,
  reset: true,
});
console.log('ingest:', JSON.stringify(ingestResult));

// 3) 双引擎 query 对比
const query = '访客如何进入乌托邦？';
const langchainHits = await langchainEngine.retrieveKnowledge({
  query,
  topK: 3,
});
console.log('--- langchain 引擎 query ---');
for (const match of langchainHits.matches) {
  console.log(
    `  [sim=${match.similarity}] ${match.source} #${match.chunkIndex}: ${match.chunk.slice(0, 40)}`,
  );
}

const legacyHits = await legacyEngine.retrieveKnowledge({ query, topK: 3 });
console.log('--- legacy 引擎 query（同一库，兼容验证）---');
for (const match of legacyHits.matches) {
  console.log(
    `  [sim=${match.similarity}] ${match.source} #${match.chunkIndex}: ${match.chunk.slice(0, 40)}`,
  );
}

console.log('E2E_DONE');

// 清理：移除本次测试写入的示例文档，恢复 rag-docs 原状
await fs.rm(fixturesDir, { recursive: true, force: true });
console.log('fixtures cleaned');
