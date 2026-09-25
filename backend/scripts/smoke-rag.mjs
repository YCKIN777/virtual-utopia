// P2 冒烟：验证官方 RAG 组件层（splitter / embeddings / 错误映射），不依赖 Chroma 运行。
// 用法：node scripts/smoke-rag.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(currentDir, '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const { createSplitter } = await import('../src/ai/rag/splitter.js');
const { HashEmbeddings } = await import('../src/ai/rag/embeddings.js');
const { checkVectorStore } = await import('../src/ai/rag/vectorStore.js');

// 1) 官方分块器（RecursiveCharacterTextSplitter，中文边界）
const splitter = createSplitter({ chunkSize: 800, chunkOverlap: 120 });
const sampleText =
  '虚拟乌托邦是一个多人在线的3D乡墅世界。\n\n居民可以在自己的宅院里自由装扮，也可以到广场与邻里交流。\n\n每位原住民都拥有50块宅院地块中的一块，访客则受到名额限制。';
const pieces = await splitter.splitText(sampleText);
console.log('splitter chunks:', pieces.length);
pieces.forEach((piece, index) => {
  console.log(`  chunk[${index}] len=${piece.length} head=${piece.slice(0, 24)}`);
});

// 2) Embeddings 接口（HashEmbeddings，384 维，与旧版同构）
const embeddings = new HashEmbeddings();
const vectors = await embeddings.embedDocuments(['你好世界', '另一段文本']);
console.log('embeddings vectors:', vectors.length, 'dims:', vectors[0].length);
const queryVector = await embeddings.embedQuery('你好');
console.log('query vector dims:', queryVector.length);

// 3) Chroma 不可用时的错误映射（预期 RAG_VECTOR_STORE_ERROR / 503）
try {
  const health = await checkVectorStore();
  console.log('chroma status:', JSON.stringify(health));
} catch (error) {
  console.log('chroma status:', error.code, 'statusCode=', error.statusCode);
}
console.log('SMOKE_OK');
