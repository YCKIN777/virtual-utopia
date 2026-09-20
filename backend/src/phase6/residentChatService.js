/**
 * 居民一对一私聊服务（独立于冻结模块，复用 memory 模块的 createLlmClient）。
 * 通过 residentName 绑定居民人设，生成带人设的对话回复。
 * 无 API Key / LLM 不可用时降级为本地 mock 回复，保证功能可用。
 */
import { createLlmClient } from '../memory/llmClient.mjs';
import { Phase6ValidationError } from './errors.js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 加载 backend/.env 真实 DeepSeek 密钥（覆盖 .env.development 中的空值）
const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
dotenv.config({ path: path.join(backendRoot, '.env'), override: true });

const MAX_MESSAGE_LENGTH = 200;
const MAX_HISTORY_ITEMS = 20;

const buildResidentPersona = (residentName) =>
  [
    `你是虚拟乌托邦的居民「${residentName}」，本宅院住户。`,
    '性格温和，熟悉本家园环境，可以描述庭院、风景、日常起居。',
    '请以居民的第一人称口吻简短作答，语气亲切自然。',
    '不要越界讨论外部无关内容，也不要透露你是 AI。',
  ].join('\n');

const buildFallbackReply = (residentName) =>
  `你好呀，我是${residentName}。今儿庭院里的景致不错，有空常来坐坐。`;

export const createResidentChatService = ({ llmClient } = {}) => {
  const client =
    llmClient ||
    createLlmClient({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    });

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
        temperature: 0.7,
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
