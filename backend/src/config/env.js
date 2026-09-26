import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(currentDir, '../..');
const nodeEnv = process.env.NODE_ENV || 'development';

dotenv.config({
  path: path.join(backendRoot, `.env.${nodeEnv}`),
});
dotenv.config({
  path: path.join(backendRoot, '.env'),
});

const toBoolean = (value, fallback = false) => {
  if (value === undefined) {
    return fallback;
  }

  return value === 'true';
};

const toInteger = (value, fallback, minimum = 0) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < minimum) {
    return fallback;
  }

  return parsed;
};

export const env = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT) || 3000,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || '',
  codeGenerationEnabled:
    nodeEnv !== 'production' &&
    toBoolean(process.env.CODEX_CODE_GENERATION_ENABLED),
  deepSeek: Object.freeze({
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: (
      process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
    ).replace(/\/+$/, ''),
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    timeoutMs: toInteger(process.env.DEEPSEEK_TIMEOUT_MS, 30000, 1),
    maxRetries: toInteger(process.env.DEEPSEEK_MAX_RETRIES, 2, 0),
    maxConcurrent: toInteger(process.env.DEEPSEEK_MAX_CONCURRENT, 2, 1),
    maxQueue: toInteger(process.env.DEEPSEEK_MAX_QUEUE, 20, 0),
    circuitFailureThreshold: toInteger(
      process.env.DEEPSEEK_CIRCUIT_FAILURE_THRESHOLD,
      3,
      1,
    ),
    circuitResetMs: toInteger(process.env.DEEPSEEK_CIRCUIT_RESET_MS, 30000, 1),
  }),
  session: Object.freeze({
    ttlMs: toInteger(process.env.SESSION_TTL_MS, 1800000, 1000),
    cleanupIntervalMs: toInteger(
      process.env.SESSION_CLEANUP_INTERVAL_MS,
      300000,
      1000,
    ),
    maxCount: toInteger(process.env.SESSION_MAX_COUNT, 1000, 1),
  }),
  phase6: Object.freeze({
    // P4 收尾：场景服务真实认证 —— AI 对话请求经 Bearer token 调 phase6 /auth/me
    // 解析身份（替换前端 body.user 直传信任）。生产指向 phase6 网关地址。
    baseUrl: (process.env.PHASE6_BASE_URL || 'http://localhost:3400').replace(
      /\/+$/,
      '',
    ),
  }),
  phase5: Object.freeze({
    // 待办⑤：外层壳注册代理 —— 验证码校验通过后转发 phase5 注册端点。
    baseUrl: (process.env.PHASE5_BASE_URL || 'http://localhost:3300').replace(
      /\/+$/,
      '',
    ),
  }),
  ai: Object.freeze({
    llmBackend: process.env.AI_LLM_BACKEND || 'langchain',
    ragBackend: process.env.AI_RAG_BACKEND || 'langchain',
    // P5.3-⑪：LangSmith 可观测。LangChain/LangGraph tracing 由环境变量驱动
    // （LANGSMITH_TRACING=true + LANGSMITH_API_KEY + LANGSMITH_PROJECT，dotenv 已载入
    // process.env → @langchain/core 自动上传），无需代码改动；此处仅暴露开关供逻辑判断。
    langsmithTracing: toBoolean(process.env.LANGSMITH_TRACING),
    useLanggraph: process.env.USE_LANGGRAPH !== '0',
    // P4: HITL（KIN 审批）—— 命中敏感工具时 interrupt 暂停等审批。
    // 可关：AI_HITL_ENABLED=false；敏感工具清单：AI_APPROVAL_TOOLS=guestbook_write
    // P5.2-⑤（2026-09-26）：默认清单收窄为写入类 guestbook_write ——
    // query_friends 为无参数、仅查本人数据的只读工具，不涉他人隐私，移出审批（避免「查自己好友也卡审批」）。
    hitlEnabled: process.env.AI_HITL_ENABLED !== 'false',
    // 待办③：工具轮调试日志门控（nodes.js 5 处 [debug-branch] 日志）。
    // 默认关（生产无噪音）；排查工具轮时开：AI_TOOLS_DEBUG=true
    toolsDebug: toBoolean(process.env.AI_TOOLS_DEBUG, false),
    approvalTools: (process.env.AI_APPROVAL_TOOLS || 'guestbook_write')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  }),
});
