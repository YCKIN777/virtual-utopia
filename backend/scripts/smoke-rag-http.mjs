// P2 HTTP 层验证：RAG 服务（3100）经 ragEngine 路由后 API 行为不变。
// 用法：node scripts/smoke-rag-http.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(currentDir, '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const { startRagServer } = await import('../src/rag/httpServer.js');
const { ragConfig } = await import('../src/rag/config.js');

const server = await startRagServer({ port: 3100 });
const baseUrl = `http://localhost:${ragConfig.port}`;

try {
  // 1) health
  const health = await fetch(`${baseUrl}/health`).then((response) =>
    response.json(),
  );
  console.log('health:', JSON.stringify(health));

  // 2) query（沿用 E2E 已写入的默认 collection）
  const queryResponse = await fetch(`${baseUrl}/api/rag/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '访客如何进入乌托邦？', topK: 2 }),
  });
  const query = await queryResponse.json();
  console.log('query status:', queryResponse.status, JSON.stringify(query));
  console.log('query matches:', query.matches?.length);
  (query.matches ?? []).forEach((match) => {
    console.log(
      `  [sim=${match.similarity}] ${match.source} #${match.chunkIndex}: ${match.chunk.slice(0, 30)}`,
    );
  });

  console.log('HTTP_DONE');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
