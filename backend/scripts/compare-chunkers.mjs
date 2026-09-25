// P2 验证：新旧分块器结构对比（自研 chunkText vs RecursiveCharacterTextSplitter）。
// 用法：node scripts/compare-chunkers.mjs
import { chunkText } from '../src/rag/textChunker.js';
import { createSplitter } from '../src/ai/rag/splitter.js';

const paragraph =
  '虚拟乌托邦是一座以乡墅生活为核心的多人在线世界。居民们拥有自己的宅院地块，可以在院内自由布置家具，也可以开放参观。广场是邻里交流的中心，大家在此讨论公共事务、分享生活见闻。每位原住民都享有平等的发言权，访客则受名额限制，需要城主审核通过后才能进入。';
const text = Array.from({ length: 30 }, () => paragraph).join('\n\n');

const oldChunks = chunkText(text, { chunkSize: 800, chunkOverlap: 120 });
const newChunks = await createSplitter({
  chunkSize: 800,
  chunkOverlap: 120,
}).splitText(text);

const summarize = (chunks, getLength) => {
  const total = chunks.reduce((sum, chunk) => sum + getLength(chunk), 0);

  return {
    count: chunks.length,
    avgLength: Number((total / chunks.length).toFixed(0)),
    maxLength: Math.max(...chunks.map(getLength)),
    minLength: Math.min(...chunks.map(getLength)),
  };
};

const oldStats = summarize(oldChunks, (chunk) => chunk.text.length);
const newStats = summarize(newChunks, (chunk) => chunk.length);

console.log('old (自研 chunkText)   :', JSON.stringify(oldStats));
console.log('new (官方 TextSplitter):', JSON.stringify(newStats));
console.log('COMPARE_DONE');
