// backend/src/ai/modelClientFactory.js
// P1: 模型客户端工厂 —— 按环境变量 AI_LLM_BACKEND 选择实现：
//   langchain（默认）→ createLangChainModelClient（@langchain/deepseek）
//   legacy           → createDeepSeekClient（自研旧客户端，回退开关）
// 切换后重启服务生效。
import { env } from '../config/env.js';
import { createDeepSeekClient } from '../services/deepSeekClient.js';
import { createLangChainModelClient } from './langchainModelClient.js';

export const createModelClient = (options = {}) => {
  const backend = String(options.backend ?? env.ai.llmBackend).toLowerCase();

  if (backend === 'legacy') {
    return createDeepSeekClient(options);
  }

  return createLangChainModelClient(options);
};
