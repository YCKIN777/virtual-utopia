// backend/src/ai/rag/ingest.js
// P2: 官方摄取管线 —— 文档加载复用自研 documentLoader（IO/路径安全已完善），
// 分块用 RecursiveCharacterTextSplitter，写入用 Chroma 官方集成。
// chunk id / contentHash 生成规则与旧版一致，保证库内标识稳定。
import { createHash } from 'node:crypto';
import { ragConfig } from '../../rag/config.js';
import { loadDocuments } from '../../rag/documentLoader.js';
import { RagValidationError } from '../../rag/errors.js';
import { createSplitter } from './splitter.js';
import { deleteCollection, upsertChunks } from './vectorStore.js';

const createChunkId = ({ source, index, text }) =>
  createHash('sha256')
    .update(`${source}\n${index}\n${text}`)
    .digest('hex')
    .slice(0, 32);

const createContentHash = (text) =>
  createHash('sha256').update(text).digest('hex').slice(0, 16);

export const ingestDocuments = async ({
  paths,
  collectionName = ragConfig.collectionName,
  chunkSize = ragConfig.chunkSize,
  chunkOverlap = ragConfig.chunkOverlap,
  reset = false,
} = {}) => {
  if (
    !Number.isInteger(chunkSize) ||
    !Number.isInteger(chunkOverlap) ||
    chunkSize <= 0 ||
    chunkOverlap < 0 ||
    chunkOverlap >= chunkSize
  ) {
    throw new RagValidationError('chunkSize and chunkOverlap are invalid');
  }

  const documents = await loadDocuments({ paths });
  const splitter = createSplitter({ chunkSize, chunkOverlap });
  const ingestedAt = new Date().toISOString();
  const chunks = [];

  for (const document of documents) {
    const textChunks = await splitter.splitText(document.content);

    for (let index = 0; index < textChunks.length; index += 1) {
      const text = textChunks[index].trim();

      if (text === '') {
        continue;
      }

      chunks.push({
        id: createChunkId({
          source: document.source,
          index,
          text,
        }),
        text,
        metadata: {
          source: document.source,
          fileName: document.fileName,
          chunkIndex: index,
          contentHash: createContentHash(text),
          ingestedAt,
        },
      });
    }
  }

  if (chunks.length === 0) {
    throw new RagValidationError('documents did not produce any text chunks');
  }

  if (reset) {
    await deleteCollection(collectionName);
  }

  const writeResult = await upsertChunks({
    collectionName,
    chunks,
  });

  return {
    collectionName: writeResult.collectionName,
    documents: documents.length,
    chunks: writeResult.count,
    ids: chunks.map((chunk) => chunk.id),
  };
};
