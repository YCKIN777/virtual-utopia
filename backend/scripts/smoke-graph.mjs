// P3 冒烟：LangGraph StateGraph 图编排 + SQLite Checkpointer 断点续跑（真实模型）。
// 用法：node scripts/smoke-graph.mjs [conversationId]
// 验证：
//   1) yard 场景经图路由到 ahe 分支，返回结构与 meta 正常
//   2) 同一 conversationId 二次调用：checkpoint 恢复上一轮 assistant 回复（短记忆生效）
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(currentDir, '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const { createModelClient } = await import('../src/ai/modelClientFactory.js');
const { createSceneGraphOrchestrator } = await import(
  '../src/ai/graph/graphOrchestrator.js'
);

const conversationId = process.argv[2] ?? 'smoke-graph-demo';
const orchestrator = createSceneGraphOrchestrator({
  modelClient: createModelClient(),
});

// 第一轮
console.log('--- 第 1 轮（yard / 你好）---');
const first = await orchestrator.handle({
  conversationId,
  sceneId: 'yard',
  input: { content: '你好' },
});
console.log('reply:', first.result.reply);
console.log(
  'meta:',
  JSON.stringify({
    targetAgentId: first.meta.targetAgentId,
    branchName: first.meta.branchName,
    mode: first.meta.mode,
    intent: first.meta.intent,
    fallback: first.meta.fallback,
    model: first.meta.model,
    attempts: first.meta.attempts,
    latencyMs: first.meta.latencyMs,
    usage: first.meta.usage,
  }),
);

// 第二轮：不带 history（前端只需传 conversationId，历史由 checkpoint 恢复）
console.log('--- 第 2 轮（yard / 帮我组织一次邻里清扫，不带 history）---');
const second = await orchestrator.handle({
  conversationId,
  sceneId: 'yard',
  input: { content: '帮我组织一次邻里清扫，应该怎么安排？' },
});
console.log('reply:', second.result.reply);
console.log(
  'meta:',
  JSON.stringify({
    targetAgentId: second.meta.targetAgentId,
    branchName: second.meta.branchName,
    intent: second.meta.intent,
    fallback: second.meta.fallback,
    model: second.meta.model,
  }),
);
console.log('GRAPH_SMOKE_DONE');
