// backend/src/ai/rag/embeddings.js
// P2: LangChain Embeddings 接口封装。
// 默认实现 HashEmbeddings：复用现有自研哈希向量（384 维），零外部依赖、行为与旧版同构
// （旧库向量可直接继续使用）。后续可替换为任意官方 Embeddings（如 SiliconFlow/OpenAI），
// 只需实现 embedDocuments / embedQuery 两个方法。
import { Embeddings } from '@langchain/core/embeddings';
import {
  embedText,
  EMBEDDING_DIMENSIONS,
} from '../../rag/embedding.js';

export class HashEmbeddings extends Embeddings {
  constructor(fields) {
    super(fields ?? {});
  }

  async embedDocuments(texts) {
    return texts.map((text) => embedText(text));
  }

  async embedQuery(text) {
    return embedText(text);
  }

  get dimensions() {
    return EMBEDDING_DIMENSIONS;
  }
}
