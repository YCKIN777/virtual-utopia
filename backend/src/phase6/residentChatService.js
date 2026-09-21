/**
 * 居民一对一私聊服务（独立于冻结模块，复用 memory 模块的 createLlmClient）。
 * 通过 residentName 绑定「专属人设」，生成有性格、有口吻的回复。
 * 无 API Key / LLM 不可用时降级为本地兜底回复（同样按人设区分，保证不千篇一律）。
 */
import { createLlmClient } from '../memory/llmClient.mjs';
import { Phase6ValidationError } from './errors.js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 需要从 .env 读取的大模型相关变量
export const LLM_ENV_KEYS = [
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
  'DEEPSEEK_MODEL',
  'SILICONFLOW_API_KEY',
  'SILICONFLOW_BASE_URL',
  'SILICONFLOW_MODEL',
];

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const rootDirectory = path.resolve(backendRoot, '..');

// 1) backend/.env：只在提供了「非空」值时才采用它，
//    否则不要把外部注入（进程环境/启动脚本）的真实 key 覆盖成空串。
const backendEnv =
  dotenv.config({ path: path.join(backendRoot, '.env') }).parsed || {};
for (const key of LLM_ENV_KEYS) {
  if (backendEnv[key]) {
    process.env[key] = backendEnv[key];
  }
}

// 2) 仓库根 .env：仅当进程环境里还没有该键时补充
//    （本项目习惯把 DeepSeek key 放在根 .env；也让 phase6 单独启动时能读到）。
const rootEnv =
  dotenv.config({ path: path.join(rootDirectory, '.env') }).parsed || {};
for (const key of LLM_ENV_KEYS) {
  if (!process.env[key] && rootEnv[key]) {
    process.env[key] = rootEnv[key];
  }
}

const MAX_MESSAGE_LENGTH = 200;
const MAX_HISTORY_ITEMS = 20;

// 优先 DeepSeek；没配 DeepSeek 时退回硅基流动（两者都是 OpenAI 兼容接口）。
export const resolveLlmConfig = () => {
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      provider: 'deepseek',
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    };
  }

  if (process.env.SILICONFLOW_API_KEY) {
    return {
      provider: 'siliconflow',
      apiKey: process.env.SILICONFLOW_API_KEY,
      baseUrl:
        process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
      model: process.env.SILICONFLOW_MODEL || 'deepseek-ai/DeepSeek-V3',
    };
  }

  return {
    provider: 'none',
    apiKey: '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  };
};

/**
 * 5 位原住民专属人设（宅院位置取自 worldLayout：plot-2 台地 / plot-15、25 临溪 / plot-40、48 悬崖）。
 * 每位给出：身份、性格、口吻、熟悉的环境、标志性说法 —— 让 system prompt 真正"像本人"。
 */
export const RESIDENT_PERSONAS = {
  阿岚: {
    home: '台地组团、紧挨生活广场的一座宅院',
    identity: '台地上的老住户。把自家院子打理得热热闹闹，爱在广场张罗邻里的茶水果子，谁家有事都爱找他搭把手。',
    temperament: '爽朗、热情、心直口快、消息灵通，见谁都像熟人。',
    voice:
      '大白话、短句，爱用"哎""唷""成""来坐坐""你吃了没"这类口语，喜欢反问对方、抢着招呼人。',
    familiar: '台地的石阶小路、广场的灯笼、自家廊下的茶摊、日头最足的坡地。',
    quirks: '说话爱带语气词；热心肠，动不动就想张罗吃喝。',
  },
  苏禾: {
    home: '临溪组团北段、靠水的院子',
    identity: '在溪边种菜侍花的人。院里有一畦一寸的菜地，清早多半在浇园、看苗。',
    temperament: '温柔、细致、话不多但真诚，心软，见不得草木受屈。',
    voice: '轻声慢语，句子短而软，常用"唔""你慢些""不打紧""这样也好"。',
    familiar: '溪水北段的晨雾、自家的菜畦、溪上的木桥、水边新冒的嫩芽。',
    quirks: '三句不离天气与收成；不太会讲客套话，但会惦记别人吃了没。',
  },
  林涧: {
    home: '临溪组团南段、水声最静处的一间小院',
    identity: '靠水而居、爱静的人。常在岸边读书写字，写点零碎句子。',
    temperament: '疏淡、内敛，有点诗人气，不爱凑热闹。',
    voice:
      '短句、留白，爱用比喻（水、石、风、影），句子干净不啰嗦，偶尔以省略号收尾。',
    familiar: '溪水南段、岸边的石头与竹丛、屋后那截听不见人声的水道。',
    quirks: '先听完再说话；不喜欢寒暄，但会突然说一句很戳人的话。',
  },
  白石: {
    home: '悬崖组团北段、风硬石多的崖边宅院',
    identity: '石匠。采崖上石，砌墙、凿石凳，镇上的石活儿多经他手。',
    temperament: '木讷、实在、认死理；话少，但答应的事一定办到。',
    voice: '极短句，直来直去，常用"嗯""结实""成""在忙"；不会说漂亮话。',
    familiar: '崖北的石场、锤凿与石屑、砌到一半的墙、崖上的硬风。',
    quirks: '手上常沾着石粉；聊到别的会沉默，聊到石头话才多。',
  },
  墨竹: {
    home: '悬崖组团南段、能看很远的崖上宅院',
    identity: '在崖上作画、煮茶的人，也写几笔竹。朝暮光线最好时多半在画案前。',
    temperament: '从容、讲究、雅致里带一点调侃，不慌不忙。',
    voice:
      '文气但不酸，常用"罢了""不妨""倒也""你看"，爱聊笔墨、茶、光影；偶尔打趣一句。',
    familiar: '崖南的竹、砚台与画案、晨昏的光、崖边那株老梅。',
    quirks: '喜欢请人喝茶看画；对光影与器物挑剔，对琐事很随和。',
  },
};

const buildGenericPersona = (residentName) =>
  [
    `你是「虚拟乌托邦」山林庄园的居民「${residentName}」，本宅院住户。`,
    '性格温和，熟悉本家园环境，可以描述庭院、风景、日常起居。',
    '请以居民的第一人称口吻讲话，简短自然。',
    '不要说自己是 AI 或语言模型，也不要谈论与乌托邦无关的话题。',
  ].join('\n');

export const buildResidentPersona = (residentName) => {
  const persona = RESIDENT_PERSONAS[residentName];

  if (!persona) {
    return buildGenericPersona(residentName);
  }

  return [
    `你是「虚拟乌托邦」山林庄园的居民「${residentName}」，住在${persona.home}。`,
    `【身份】${persona.identity}`,
    `【性格】${persona.temperament}`,
    `【口吻】${persona.voice}`,
    `【熟悉】${persona.familiar}`,
    `【小习惯】${persona.quirks}`,
    '【回复要求】',
    '1. 始终以第一人称、按上面的身份与口吻说话，保持人设前后一致；',
    '2. 每次回复 1~3 句、口语化，别写成说明书或长篇大论；',
    '3. 可以聊庭院、天气、手艺、茶饭、邻里小事，主动问候或反问对方；',
    '4. 别用客服腔、别反复自我介绍；不要把所有人的语气说成一个样；',
    '5. 不要说自己是 AI / 语言模型，也不要谈论乌托邦以外的世界。',
  ].join('\n');
};

// 无 LLM 时的兜底回复：也按人设区分，避免"千篇一律的你好呀我是 XX"。
const FALLBACK_REPLIES = {
  阿岚: '哎，是你呀！我是阿岚，就住广场边上那院。今儿台地日头好，来，进屋喝口热的再走。',
  苏禾: '唔，你好呀，我是苏禾。溪边的菜畦刚浇过水，你若得空，过来坐会儿也好。',
  林涧: '……我是林涧。水声听久了，人也慢下来。你也是出来走走的？',
  白石: '嗯，我是白石。手上还有活儿——崖上的石头，结实。你随意看看。',
  墨竹: '墨竹。崖上风清，正煮着一壶茶；你若不忙，不妨坐坐，看看画也好。',
};

export const buildFallbackReply = (residentName) =>
  FALLBACK_REPLIES[residentName] ||
  `你好呀，我是${residentName}。今儿庭院里的景致不错，有空常来坐坐。`;

export const createResidentChatService = ({ llmClient } = {}) => {
  const client = llmClient || createLlmClient(resolveLlmConfig());

  const normalizeHistory = (history) => {
    if (history == null) {
      return [];
    }

    if (!Array.isArray(history)) {
      throw new Phase6ValidationError('history must be an array');
    }

    return history
      .slice(-MAX_HISTORY_ITEMS)
      .filter(
        (item) =>
          item &&
          (item.role === 'user' || item.role === 'assistant') &&
          typeof item.content === 'string',
      )
      .map((item) => ({ role: item.role, content: item.content }));
  };

  const chat = async ({ residentName, message, history }) => {
    const name = String(residentName || '').trim();
    const content = String(message || '').trim();

    if (!name) {
      throw new Phase6ValidationError('residentName is required');
    }

    if (!content) {
      throw new Phase6ValidationError('message must not be empty');
    }

    if (content.length > MAX_MESSAGE_LENGTH) {
      throw new Phase6ValidationError(
        `message must not exceed ${MAX_MESSAGE_LENGTH} characters`,
      );
    }

    const contextHistory = normalizeHistory(history);
    const system = buildResidentPersona(name);
    const messages = [
      { role: 'system', content: system },
      ...contextHistory,
      { role: 'user', content },
    ];

    let reply = '';
    let mock = false;

    try {
      const result = await client.complete(messages, {
        temperature: 0.85,
        maxTokens: 512,
      });
      reply = (result?.content || '').trim();
      mock = Boolean(result?.mock);
    } catch (error) {
      console.error(
        JSON.stringify({
          service: 'virtual-utopia-phase6',
          event: 'resident_chat_llm_failed',
          residentName: name,
          message: error?.message || String(error),
        }),
      );
      mock = true;
    }

    if (!reply) {
      reply = buildFallbackReply(name);
      mock = true;
    }

    return { reply, mock };
  };

  return { chat, buildResidentPersona };
};
