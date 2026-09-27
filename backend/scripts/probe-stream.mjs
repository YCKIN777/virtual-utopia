// 直接实测 langchainModelClient 的流式：onToken 是否触发、chunk 结构
import { writeFileSync } from 'node:fs';
import { createModelClient } from '../src/ai/modelClientFactory.js';

const out = [];
const client = createModelClient();
out.push('backend: ' + client.backend + ' | model: ' + client.model);
out.push('has createStructuredResponseStream: ' + typeof client.createStructuredResponseStream);
out.push('has createToolCallResponseStream: ' + typeof client.createToolCallResponseStream);

const messages = [
  { role: 'system', content: '你是大院管家阿禾。请用 JSON 回复，格式 {"reply":"...","risk":"low","sceneId":"yard","actions":[]}' },
  { role: 'user', content: '你好，介绍一下大院' },
];

let tokenCount = 0;
let firstToken = '';
const started = Date.now();
try {
  const resp = await client.createStructuredResponseStream({
    messages,
    responseSchema: null,
    onToken: (t) => {
      tokenCount++;
      if (!firstToken) firstToken = t;
    },
  });
  out.push('耗时: ' + (Date.now() - started) + ' ms | onToken 触发次数: ' + tokenCount);
  out.push('首 token: ' + JSON.stringify(firstToken.slice(0, 50)));
  out.push('reply: ' + String(resp?.data?.reply ?? 'N/A').slice(0, 60));
  out.push('attempts: ' + resp?.attempts);
} catch (e) {
  out.push('异常: ' + e.code + ' ' + String(e.message).slice(0, 200));
}
writeFileSync('H:/BP2/probe-out.txt', out.join('\n'), 'utf8');
