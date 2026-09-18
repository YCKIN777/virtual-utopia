/**
 * 确定性本地 Embedding 向量生成（字符 n-gram 哈希），无外部依赖、无网络。
 * 用于记忆向量召回；后续可替换为真实 embedding 模型（扩展点见 memoryRetriever.retrieveByVector）。
 */

const hashFn = (str) => {
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const normalizeText = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[\s，。！？、,.!?；;：:""''（）()【】]+/g, '');

const normalizeVector = (vec) => {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
};

export const createEmbeddingGenerator = ({ dimensions = 128 } = {}) => {
  const generate = (text) => {
    const vec = new Array(dimensions).fill(0);
    const s = normalizeText(text);
    if (!s) return vec;

    const grams = [];
    for (let i = 0; i < s.length - 1; i++) grams.push(s.slice(i, i + 2));
    for (let i = 0; i < s.length - 2; i++) grams.push(s.slice(i, i + 3));
    if (grams.length === 0) grams.push(s);

    for (const g of grams) {
      const h = hashFn(g);
      const idx = h % dimensions;
      const sign = (h & 1) === 0 ? 1 : -1;
      vec[idx] += sign;
    }
    return normalizeVector(vec);
  };

  const cosine = (a, b) => {
    const len = Math.min(a.length, b.length);
    let dot = 0;
    for (let i = 0; i < len; i++) dot += a[i] * b[i];
    return dot; // 归一化后 dot = cosine ∈ [-1, 1]
  };

  return { generate, cosine, dimensions };
};
