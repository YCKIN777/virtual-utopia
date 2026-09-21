#!/usr/bin/env node
/**
 * 【阶段四】居民回复个性化 + 真实 LLM —— 自测。
 *
 * 分两段：
 *  A. 离线单测（不依赖网络）：5 位居民的专属人设是否各自成立、是否被真正送进 LLM，
 *     兜底回复是否按人设区分。
 *  B. 在线接口（依赖运行中的 phase6 3400）：同一句话问 5 位居民，回复是否各不相同，
 *     并报告真实 LLM 是否接入（mock=false）。
 */
import {
  buildResidentPersona,
  buildFallbackReply,
  RESIDENT_PERSONAS,
  resolveLlmConfig,
  createResidentChatService,
} from '../backend/src/phase6/residentChatService.js';

const WORLD_API = process.env.API_URL || 'http://localhost:3400';
const RESIDENTS = ['阿岚', '苏禾', '林涧', '白石', '墨竹'];
const GENERIC_OLD_FALLBACK =
  '你好呀，我是%s。今儿庭院里的景致不错，有空常来坐坐。';

const KEYWORDS = {
  阿岚: ['广场', '茶', '热闹'],
  苏禾: ['菜畦', '溪', '温和'],
  林涧: ['水声', '比喻', '静'],
  白石: ['石匠', '石头', '实在'],
  墨竹: ['画', '茶', '从容'],
};

const results = [];
const record = (label, ok, extra = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' · ' + extra : ''}`);
};
const info = (label, extra = '') => {
  console.log(`INFO ${label}${extra ? ' · ' + extra : ''}`);
};

// ---------------- A. 离线单测 ----------------
console.log('=== A. 离线单测：人设个性化 ===');

const personas = Object.fromEntries(
  RESIDENTS.map((name) => [name, buildResidentPersona(name)]),
);

record(
  '5 位居民各有独立 system prompt（互不相同）',
  new Set(Object.values(personas)).size === 5,
  `unique=${new Set(Object.values(personas)).size}/5`,
);
record(
  '每个人设都点名本人 + 含专属性格/环境关键词',
  RESIDENTS.every((name) => {
    const text = personas[name];
    return (
      text.includes(`「${name}」`) &&
      text.includes('【口吻】') &&
      KEYWORDS[name].some((k) => text.includes(k))
    );
  }),
  RESIDENTS.map((n) => `${n}:${KEYWORDS[n].filter((k) => personas[n].includes(k)).length}`).join(' '),
);
record(
  '人设不再是通用模板（旧模板文案已消失）',
  RESIDENTS.every(
    (name) => !personas[name].includes('性格温和，熟悉本家园环境，可以描述庭院'),
  ),
);

const fallbacks = RESIDENTS.map((name) => buildFallbackReply(name));
record(
  '无 Key 兜底回复也按人设区分（5 条互不相同）',
  new Set(fallbacks).size === 5,
  `unique=${new Set(fallbacks).size}/5`,
);
record(
  '兜底回复已不再是"你好呀我是 XX"千篇一律',
  RESIDENTS.every(
    (name, index) => fallbacks[index] !== GENERIC_OLD_FALLBACK.replace('%s', name),
  ),
);

// 用"记录型 stub LLM"验证：chat() 真的把各自的人设送进模型，且不同人设产出不同回复
const seenSystems = [];
const stub = {
  complete: async (messages) => {
    const system = messages.find((m) => m.role === 'system')?.content || '';
    seenSystems.push(system);
    const voiceLine =
      system.split('\n').find((line) => line.startsWith('【口吻】')) || system;
    return { content: `[stub]${voiceLine}`, mock: false };
  },
};
const service = createResidentChatService({ llmClient: stub });
const stubReplies = [];
for (const name of RESIDENTS) {
  const out = await service.chat({
    residentName: name,
    message: '你好，最近在忙什么？',
    history: [],
  });
  stubReplies.push(out.reply);
}
record(
  'chat() 把「本人」的人设原文送进 LLM（5 份互不相同）',
  new Set(seenSystems).size === 5,
  `unique=${new Set(seenSystems).size}/5`,
);
record(
  '同一句话 → 5 位居民产出各自的口气',
  new Set(stubReplies).size === 5,
);
record(
  '未知居民仍有兜底人设（不报错）',
  buildResidentPersona('路人甲').includes('居民') &&
    buildFallbackReply('路人甲').includes('路人甲'),
);

info(
  '当前 LLM 配置来源',
  `${resolveLlmConfig().provider}（none=未配置 key，将走兜底文案）`,
);

// ---------------- B. 在线接口 ----------------
console.log('\n=== B. 在线接口：同一句话问 5 位居民 ===');

try {
  const loginRes = await fetch(`${WORLD_API}/api/phase6/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'traveler', password: 'utopia2026' }),
  });
  const loginJson = await loginRes.json();
  const token = loginJson?.token;
  if (!token) throw new Error('登录失败: ' + JSON.stringify(loginJson));

  const replies = [];
  const mocks = [];
  for (const name of RESIDENTS) {
    const res = await fetch(`${WORLD_API}/api/phase6/chat/resident`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        residentName: name,
        message: '你好，最近在忙什么？',
        history: [],
      }),
    });
    const json = await res.json();
    replies.push(json?.reply || '');
    mocks.push(Boolean(json?.mock));
    console.log(`  ${name}: ${json?.reply || '(空)'}   [mock=${json?.mock}]`);
  }

  record(
    '在线：同一句话问 5 位居民，回复互不相同',
    new Set(replies).size === 5 && replies.every((r) => r.length > 0),
    `unique=${new Set(replies).size}/5`,
  );
  record(
    '在线：真实 LLM 已接入（mock=false）',
    mocks.every((m) => m === false),
    `mock flags=${JSON.stringify(mocks)}`,
  );
  record(
    '在线：回复不是兜底模板（内容非预置文案）',
    replies.every((r) => !fallbacks.includes(r)),
  );
} catch (error) {
  record('在线接口执行异常', false, error.message);
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n=== 汇总: ${failed.length === 0 ? '全部通过' : failed.length + ' 项失败'} ===`,
);
process.exit(failed.length ? 1 : 0);
