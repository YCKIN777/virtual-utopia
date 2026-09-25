// backend/src/ai/ragEngine.js
// P2: RAG 引擎工厂 —— 按环境变量 AI_RAG_BACKEND 选择实现：
//   langchain（默认）→ ai/rag（官方 TextSplitter + Embeddings 接口 + Chroma 集成）
//   legacy           → rag/（自研 textChunker + 哈希向量 + 手写 upsert/query，回退）
// 切换后重启服务生效。
import { env } from '../config/env.js';
import * as legacyRag from '../rag/index.js';
import * as langchainRag from './rag/index.js';

export const createRagEngine = (options = {}) => {
  const backend = String(options.backend ?? env.ai.ragBackend).toLowerCase();

  if (backend === 'legacy') {
    return legacyRag;
  }

  return langchainRag;
};
