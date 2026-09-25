// P0-4 最小验证脚本：确认 ChatDeepSeek（@langchain/deepseek）可调用、可流式。
// 用法：node scripts/verify-llm.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(currentDir, '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const { ChatDeepSeek } = await import('@langchain/deepseek');

const model = new ChatDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY,
  model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  temperature: 0.2,
});

// 1) 普通调用
const response = await model.invoke([
  { role: 'system', content: '你是一个验证助手。' },
  { role: 'user', content: '用一句话确认：DeepSeek 模型通过 LangChain.js 调用成功。' },
]);

const content =
  typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content);

console.log('reply  :', content);
console.log('model  :', response.response_metadata?.model ?? model.model);

const usageMeta = response.usage_metadata;
console.log('usage  :', JSON.stringify(usageMeta ?? null));

// 2) 流式验证
let chunkCount = 0;
let streamedText = '';
for await (const chunk of await model.stream([
  { role: 'user', content: '从 1 数到 3，用逗号分隔。' },
])) {
  chunkCount += 1;
  streamedText += typeof chunk.content === 'string' ? chunk.content : '';
}

console.log('stream : chunks=' + chunkCount + ' text="' + streamedText + '"');
console.log('VERIFY_OK');
