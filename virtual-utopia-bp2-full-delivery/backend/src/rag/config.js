import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(moduleDirectory, '../..');

const toInteger = (value, fallback, minimum = 0) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < minimum) {
    return fallback;
  }

  return parsed;
};

export const ragConfig = Object.freeze({
  chromaUrl: process.env.CHROMA_URL || 'http://localhost:8000',
  collectionName: process.env.CHROMA_COLLECTION || 'virtual_utopia_rag',
  port: toInteger(process.env.RAG_PORT, 3100, 1),
  docsDirectory: path.resolve(
    process.env.RAG_DOCS_DIR || path.join(backendDirectory, 'rag-docs'),
  ),
  chunkSize: toInteger(process.env.RAG_CHUNK_SIZE, 800, 1),
  chunkOverlap: toInteger(process.env.RAG_CHUNK_OVERLAP, 120, 0),
});
