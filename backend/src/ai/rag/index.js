// backend/src/ai/rag/index.js
// P2: RAG 官方组件层统一出口 —— 接口与自研 rag/index.js 完全对齐，
// 供 ragEngine 按开关切换。
export { ragConfig } from '../../rag/config.js';
export { loadDocuments } from '../../rag/documentLoader.js';
export { ingestDocuments } from './ingest.js';
export { retrieveKnowledge } from './retrieve.js';
export {
  checkVectorStore,
  deleteCollection,
  queryChunks,
  upsertChunks,
} from './vectorStore.js';
