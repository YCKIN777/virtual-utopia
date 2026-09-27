import { ChromaClient, ChromaNotFoundError } from 'chromadb';
import { ragConfig } from './config.js';
import { embedText } from './embedding.js';
import { RagError } from './errors.js';

const chromaUrl = new URL(ragConfig.chromaUrl);
const authToken = ragConfig.chromaAuthToken;
const chromaClient = new ChromaClient({
  host: chromaUrl.hostname,
  port: Number(chromaUrl.port) || 8000,
  ssl: chromaUrl.protocol === 'https:',
  // P5.6-1：Chroma 鉴权（与服务端 CHROMA_SERVER_AUTHN_CREDENTIALS 配对）
  ...(authToken ? { headers: { 'X-Chroma-Token': authToken } } : {}),
});

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

const getCollection = async (collectionName) => {
  try {
    return await chromaClient.getOrCreateCollection({
      name: collectionName,
      metadata: {
        'hnsw:space': 'cosine',
      },
      embeddingFunction: null,
    });
  } catch (error) {
    throw wrapVectorStoreError('failed to open Chroma collection', error);
  }
};

export const checkVectorStore = async () => {
  try {
    await chromaClient.heartbeat();

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
  const collection = await getCollection(collectionName);
  const embeddings = chunks.map((chunk) => embedText(chunk.text));

  try {
    await collection.upsert({
      ids: chunks.map((chunk) => chunk.id),
      embeddings,
      documents: chunks.map((chunk) => chunk.text),
      metadatas: chunks.map((chunk) => chunk.metadata),
    });
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
  const collection = await getCollection(collectionName);
  const queryEmbedding = embedText(query);
  let result;

  try {
    result = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      include: ['documents', 'metadatas', 'distances'],
    });
  } catch (error) {
    throw wrapVectorStoreError('failed to query Chroma collection', error);
  }

  const ids = result.ids?.[0] || [];
  const documents = result.documents?.[0] || [];
  const metadatas = result.metadatas?.[0] || [];
  const distances = result.distances?.[0] || [];

  return ids.map((id, index) => {
    const metadata = metadatas[index] || {};
    const distance = distances[index];

    return {
      id,
      chunk: documents[index],
      source: metadata.source,
      chunkIndex: metadata.chunkIndex,
      distance,
      similarity:
        typeof distance === 'number' ? Number((1 - distance).toFixed(6)) : null,
    };
  });
};

export const deleteCollection = async (
  collectionName = ragConfig.collectionName,
) => {
  try {
    await chromaClient.deleteCollection({
      name: collectionName,
    });
  } catch (error) {
    if (error instanceof ChromaNotFoundError) {
      return;
    }

    throw wrapVectorStoreError('failed to delete Chroma collection', error);
  }
};
