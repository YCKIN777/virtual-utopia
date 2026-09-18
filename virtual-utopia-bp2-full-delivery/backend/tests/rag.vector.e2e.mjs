import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deleteCollection, ragConfig } from '../src/rag/index.js';

const ragBaseUrl = process.env.RAG_BASE_URL || 'http://localhost:3100';
const collectionName = ['virtual_utopia_rag_e2e', process.pid, Date.now()].join(
  '_',
);
const fileName = `rag-vector-e2e-${process.pid}.md`;
const filePath = path.join(ragConfig.docsDirectory, fileName);
let collectionCreated = false;

const requestRag = async (route, body) => {
  const response = await fetch(`${ragBaseUrl}${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      `RAG request failed with status ${response.status}: ${JSON.stringify(payload)}`,
    );
  }

  return payload;
};

const fixture = [
  '# 虚拟乌托邦知识测试',
  '',
  '资源墙由知予负责，用于社区资源分类、标签整理和信息缺口识别。',
  '',
  '议事亭由叙白负责，用于议题梳理、观点归纳和会议议程生成。',
  '',
  '小屋私聊由风禾负责，仅使用prv_会话，不写入持久化数据库。',
].join('\n');

try {
  await writeFile(filePath, fixture, 'utf8');

  const ingestResult = await requestRag('/api/rag/ingest', {
    paths: [fileName],
    collectionName,
    chunkSize: 160,
    chunkOverlap: 30,
    reset: true,
  });
  collectionCreated = true;

  assert.equal(ingestResult.documents, 1);
  assert.ok(ingestResult.chunks >= 1);

  const retrievalResult = await requestRag('/api/rag/query', {
    query: '社区资源墙如何分类和添加标签',
    collectionName,
    topK: 3,
  });

  assert.ok(retrievalResult.matches.length >= 1);

  const matchedResourceChunk = retrievalResult.matches.some(
    (match) =>
      match.chunk.includes('资源墙') || match.chunk.includes('资源分类'),
  );

  assert.equal(matchedResourceChunk, true);

  for (const match of retrievalResult.matches) {
    assert.equal(match.source, fileName);
    assert.equal(typeof match.chunkIndex, 'number');
    assert.equal(typeof match.distance, 'number');
    assert.equal(typeof match.similarity, 'number');
  }

  console.log(
    JSON.stringify(
      {
        collectionName,
        ingest: ingestResult,
        retrieval: retrievalResult,
      },
      null,
      2,
    ),
  );
} finally {
  if (collectionCreated) {
    await deleteCollection(collectionName);
  }

  await rm(filePath, { force: true });
}
