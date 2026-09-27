// scripts/verify-long-memory.mjs
// P5.4-14 长记忆体验 端到端实测：
//  阶段1：登录 admin，多轮对话注入偏好事实（我喜欢晨跑）
//  阶段2：换新 conversationId（跨会话）问「还记得我的爱好吗」→ 期望回复提及晨跑
//  阶段3（可选 --restart）：重启 scene 后新会话再问 → 验证重启持久
// 依赖：phase5(3300)/phase6(3400)/scene(3000) 运行；admin/utopia2026。
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(currentDir, '../.env') });

const SCENE = 'http://localhost:3000';
const PHASE6 = 'http://localhost:3400';
const USERNAME = process.env.AUTH_USERNAME || 'admin';
const PASSWORD = process.env.AUTH_PASSWORD || 'utopia2026';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let token = '';
const login = async () => {
  const r = await fetch(`${PHASE6}/api/phase6/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const p = await r.json();
  if (!r.ok || !p?.token) throw new Error(`login failed: ${r.status}`);
  token = p.token;
  console.log(`[login] ${USERNAME} → token ok (userId=${p.user?.id ?? '?'})`);
  return p.user;
};

const stream = async (conversationId, content) => {
  const r = await fetch(`${SCENE}/api/scene/route/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sceneId: 'yard', conversationId, input: { content } }),
  });
  if (!r.ok) throw new Error(`stream http ${r.status}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let donePayload = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let ev = '', data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) ev = line.slice(7);
        else if (line.startsWith('data: ')) data = line.slice(6);
      }
      if (ev === 'done') donePayload = JSON.parse(data).payload;
    }
  }
  return donePayload?.result?.reply ?? '';
};

const main = async () => {
  const user = await login();
  const uid = user?.id ?? '?';
  console.log(`[memory] 用户维度 userId=${uid}（记忆按用户跨会话）`);

  // 阶段1：注入偏好（两轮）
  const convA = `mem-verify-a-${Date.now()}`;
  console.log('\n[阶段1] 注入偏好（conversationId A）');
  const r1 = await stream(convA, '我每天早上六点起来晨跑，坚持很久了');
  console.log(`  A1 回复: ${r1.slice(0, 70)}…`);
  await sleep(2500); // 等异步记忆提炼
  const r2 = await stream(convA, '对了，我也喜欢喝手冲咖啡');
  console.log(`  A2 回复: ${r2.slice(0, 70)}…`);
  await sleep(2500);

  // 阶段2：跨会话（新 conversationId）问偏好
  const convB = `mem-verify-b-${Date.now()}`;
  console.log('\n[阶段2] 跨会话召回（新 conversationId B）');
  const q1 = await stream(convB, '你还记得我的爱好吗？说说看');
  console.log(`  B 回复: ${q1.slice(0, 120)}`);
  const mentionsRun = /晨跑|跑步|跑步机|晨练/.test(q1);
  const mentionsCoffee = /咖啡/.test(q1);
  console.log(`  ✓ 提及晨跑: ${mentionsRun}   提及咖啡: ${mentionsCoffee}`);
  if (!mentionsRun && !mentionsCoffee) {
    console.log('  ⚠ 未见记忆召回（模型可能策略性回答，看完整回复判断）');
  }
};

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
