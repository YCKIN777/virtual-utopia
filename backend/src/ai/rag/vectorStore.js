// backend/src/ai/rag/vectorStore.js
// P2: Chroma 官方集成（@langchain/community Chroma）——替代自研 vectorStore 的
// 手写 upsert/query。检索分数语义：similaritySearchWithScore 返回 Chroma 原生
// distance（cosine 空间），similarity = 1 - distance，与旧版返回格式一致。
import { ChromaClient, ChromaNotFoundError } from 'chromadb';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { ragConfig } from '../../rag/config.js';
import { RagError } from '../../rag/errors.js';
import { HashEmbeddings } from './embeddings.js';

const toChromaClient = () => {
  const url = new URL(ragConfig.chromaUrl);

  return new ChromaClient({
    host: url.hostname,
    port: Number(url.port) || 8000,
    ssl: url.protocol === 'https:',
  });
};

const wrapVectorStoreError = (message, error) => {
  if (error instanceof RagError) {
    return error;
  }

  return new RagError(message, {
    code: 'RAG_VECTOR_STORE_ERROR',
    statusCode: 503,
    cause: error,
  });
};

export const openVectorStore = async ({
  collectionName = ragConfig.collectionName,
  client = toChromaClient(),
} = {}) => {
  try {
    return new Chroma(new HashEmbeddings(), {
      index: client,
      collectionName,
      collectionMetadata: { 'hnsw:space': 'cosine' },
    });
  } catch (error) {
    throw wrapVectorStoreError('failed to open Chroma collection', error);
  }
};

export const checkVectorStore = async () => {
  try {
    const client = toChromaClient();
    await client.heartbeat();

    return {
      status: 'ok',
      chromaUrl: ragConfig.chromaUrl,
      collectionName: ragConfig.collectionName,
    };
  } catch (error) {
    throw wrapVectorStoreError('Chroma service is unavailable', error);
  }
};

export const upsertChunks = async ({
  collectionName = ragConfig.collectionName,
  chunks,
}) => {
  const store = await openVectorStore({ collectionName });

  try {
    await store.addDocuments(
      chunks.map((chunk) => ({
        pageContent: chunk.text,
        metadata: chunk.metadata,
      })),
      { ids: chunks.map((chunk) => chunk.id) },
    );
  } catch (error) {
    throw wrapVectorStoreError(
      'failed to write chunks into Chroma collection',
      error,
    );
  }

  return {
    collectionName,
    count: chunks.length,
  };
};

export const queryChunks = async ({
  collectionName = ragConfig.collectionName,
  query,
  topK,
}) => {
  const store = await openVectorStore({ collectionName });
  let results;

  try {
    results = await store.similaritySearchWithScore(query, topK);
  } catch (error) {
    throw wrapVectorStoreError('failed to query Chroma collection', error);
  }

  return results.map(([document, score]) => ({
    id: document.id,
    chunk: document.pageContent,
    source: document.metadata?.source,
    chunkIndex: document.metadata?.chunkIndex,
    distance:
      typeof score === 'number' ? Number(score.toFixed(6)) : null,
    similarity:
      typeof score === 'number' ? Number((1 - score).toFixed(6)) : null,
  }));
};

export const deleteCollection = async (
  collectionName = ragConfig.collectionName,
) => {
  const client = toChromaClient();

  try {
    await client.deleteCollection({ name: collectionName });
  } catch (error) {
    if (error instanceof ChromaNotFoundError) {
      return;
    }

    throw wrapVectorStoreError('failed to delete Chroma collection', error);
  }
};
