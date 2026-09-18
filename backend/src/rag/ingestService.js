import { createHash } from 'node:crypto';
import { ragConfig } from './config.js';
import { loadDocuments } from './documentLoader.js';
import { RagValidationError } from './errors.js';
import { chunkText } from './textChunker.js';
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
  const ingestedAt = new Date().toISOString();
  const chunks = [];

  for (const document of documents) {
    const documentChunks = chunkText(document.content, {
      chunkSize,
      chunkOverlap,
    });

    for (const chunk of documentChunks) {
      chunks.push({
        id: createChunkId({
          source: document.source,
          index: chunk.index,
          text: chunk.text,
        }),
        text: chunk.text,
        metadata: {
          source: document.source,
          fileName: document.fileName,
          chunkIndex: chunk.index,
          contentHash: createContentHash(chunk.text),
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
