// backend/src/ai/rag/splitter.js
// P2: 官方文本分块 —— RecursiveCharacterTextSplitter（替代自研 textChunker）。
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export const createSplitter = ({ chunkSize, chunkOverlap }) =>
  new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    // 中文语料边界优先：段落 → 换行 → 句号 → 空格
    separators: ['\n\n', '\n', '。', '！', '？', '. ', ' ', ''],
    keepSeparator: false,
  });
