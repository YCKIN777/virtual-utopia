// 给旧版 rag/vectorStore.js 的 chromaClient 加鉴权 header
import { readFileSync, writeFileSync } from 'node:fs';
const p = 'H:/BP2/backend/src/rag/vectorStore.js';
let t = readFileSync(p, 'utf8');
const old = `const chromaUrl = new URL(ragConfig.chromaUrl);
const chromaClient = new ChromaClient({
  host: chromaUrl.hostname,
  port: Number(chromaUrl.port) || 8000,
  ssl: chromaUrl.protocol === 'https:',
});`;
const next = `const chromaUrl = new URL(ragConfig.chromaUrl);
const authToken = ragConfig.chromaAuthToken;
const chromaClient = new ChromaClient({
  host: chromaUrl.hostname,
  port: Number(chromaUrl.port) || 8000,
  ssl: chromaUrl.protocol === 'https:',
  // P5.6-1：Chroma 鉴权（与服务端 CHROMA_SERVER_AUTHN_CREDENTIALS 配对）
  ...(authToken ? { headers: { 'X-Chroma-Token': authToken } } : {}),
});`;
if (!t.includes(old)) {
  writeFileSync('H:/BP2/rag-patch.txt', '旧串未命中，未修改', 'utf8');
  process.exit(0);
}
t = t.replace(old, next);
writeFileSync(p, t, 'utf8');
writeFileSync('H:/BP2/rag-patch.txt', '已加鉴权 header', 'utf8');
