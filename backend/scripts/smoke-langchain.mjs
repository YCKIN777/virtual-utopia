// P1 联调冒烟：LangChain 适配器走完整 orchestrator 链路（真实 DeepSeek 调用）。
// 用法：node scripts/smoke-langchain.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(currentDir, '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const { createModelClient } = await import('../src/ai/modelClientFactory.js');
const { createSceneOrchestrator } = await import('../src/agents/orchestrator.js');

const modelClient = createModelClient();
const orchestrator = createSceneOrchestrator({ modelClient });

console.log('backend :', modelClient.backend);

const result = await orchestrator.handle({
  sceneId: 'yard',
  input: { content: '介绍一下大院，今天有什么安排？' },
  history: [],
});

console.log('sceneId :', result.sceneId);
console.log('reply   :', result.result.reply);
console.log('intent  :', result.result.intent);
console.log('risk    :', result.result.risk);
console.log('actions :', JSON.stringify(result.result.actions));
console.log('meta    :', JSON.stringify(result.meta));
console.log('SMOKE_OK');
