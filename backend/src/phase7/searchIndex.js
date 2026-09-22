import {
  PHASE7_LIMITS,
  PHASE7_VERSION,
  phase7Paths,
} from './config.js';
import { readJson, writeJson } from './jsonFile.js';

/**
 * 轻量关键词检索索引（v1.0）。
 *
 * 结构（data/index/search_index.json）：
 *   { version, updatedAt, tokens: { [token]: docId[] }, docs: { [docId]: doc } }
 *
 * 中文按「单字 + 相邻双字（bigram）」切词，英文/数字按词切；查询时要求
 * 所有查询词均命中（交集），再按命中数 + 时间排序。预留 upgrade 字段，
 * 后续可平滑升级为语义检索（本次不实现向量 RAG）。
 */
export const tokenize = (text) => {
  const normalized = String(text ?? '').toLowerCase();
  const tokens = new Set();

  const words = normalized.match(/[a-z0-9_]{2,}/g) || [];
  words.forEach((word) => tokens.add(word));

  const cjkSegments = normalized.match(/[\u4e00-\u9fff]+/g) || [];
  cjkSegments.forEach((segment) => {
    for (let index = 0; index < segment.length; index += 1) {
      tokens.add(segment[index]);
      if (index + 1 < segment.length) {
        tokens.add(segment.slice(index, index + 2));
      }
    }
  });

  return [...tokens];
};

const emptyIndex = () => ({
  version: PHASE7_VERSION,
  updatedAt: new Date().toISOString(),
  upgrade: { semantic: false },
  tokens: {},
  docs: {},
});

export const createSearchIndex = ({ dataDirectory }) => {
  const indexPath = phase7Paths(dataDirectory).index;
  let cache = null;

  const load = () => {
    if (cache) {
      return cache;
    }
    const stored = readJson(indexPath, null);
    cache =
      stored && typeof stored === 'object' && stored.docs && stored.tokens
        ? stored
        : emptyIndex();
    return cache;
  };

  const flush = () => {
    const index = load();
    index.updatedAt = new Date().toISOString();
    writeJson(indexPath, index);
  };

  const detach = (docId) => {
    const index = load();
    const previous = index.docs[docId];
    if (!previous) {
      return;
    }
    tokenize(previous.text).forEach((token) => {
      const posting = index.tokens[token];
      if (!posting) {
        return;
      }
      const next = posting.filter((id) => id !== docId);
      if (next.length) {
        index.tokens[token] = next;
      } else {
        delete index.tokens[token];
      }
    });
    delete index.docs[docId];
  };

  return {
    /** 新增或覆盖一条文档并重建其倒排项 */
    upsert(doc, { defer = false } = {}) {
      const index = load();
      if (!doc?.id) {
        return;
      }
      detach(doc.id);
      const normalized = { ...doc, tokens: undefined };
      index.docs[doc.id] = normalized;
      tokenize(`${doc.text || ''} ${doc.ownerName || ''}`).forEach((token) => {
        index.tokens[token] ||= [];
        if (!index.tokens[token].includes(doc.id)) {
          index.tokens[token].push(doc.id);
        }
      });
      if (!defer) {
        flush();
      }
    },
    remove(docId, { defer = false } = {}) {
      detach(docId);
      if (!defer) {
        flush();
      }
    },
    removeMany(docIds, { defer = false } = {}) {
      docIds.forEach((docId) => detach(docId));
      if (!defer) {
        flush();
      }
    },
    flush,
    getDoc(docId) {
      return load().docs[docId] || null;
    },
    /** 关键词检索：返回按命中数 + 时间排序的文档（未做权限过滤） */
    query(rawQuery, { limit = PHASE7_LIMITS.maxSearchResults } = {}) {
      const index = load();
      const tokens = tokenize(rawQuery);
      if (!tokens.length) {
        return [];
      }

      let candidates = null;
      tokens.forEach((token) => {
        const posting = index.tokens[token] || [];
        if (candidates === null) {
          candidates = new Set(posting);
          return;
        }
        candidates = new Set(posting.filter((id) => candidates.has(id)));
      });

      if (!candidates || !candidates.size) {
        return [];
      }

      const normalizedQuery = String(rawQuery).toLowerCase();
      return [...candidates]
        .map((docId) => index.docs[docId])
        .filter(Boolean)
        .map((doc) => {
          const haystack = String(doc.text || '').toLowerCase();
          const position = haystack.indexOf(normalizedQuery);
          const score =
            (position >= 0 ? 2 : 0) +
            tokens.filter((token) => haystack.includes(token)).length;
          return { doc, score, position };
        })
        .sort(
          (left, right) =>
            right.score - left.score ||
            String(right.doc.at || '').localeCompare(String(left.doc.at || '')),
        )
        .slice(0, limit)
        .map(({ doc, position }) => ({
          ...doc,
          snippet: buildSnippet(doc.text, rawQuery, position),
        }));
    },
    stats() {
      const index = load();
      return {
        documents: Object.keys(index.docs).length,
        tokens: Object.keys(index.tokens).length,
        updatedAt: index.updatedAt,
      };
    },
  };
};

const buildSnippet = (text, rawQuery, position) => {
  const source = String(text ?? '');
  const needle = String(rawQuery ?? '').toLowerCase();
  const matchIndex = position >= 0 ? position : source.toLowerCase().indexOf(needle);
  if (matchIndex < 0 || source.length <= 48) {
    return source.slice(0, 80);
  }
  const start = Math.max(0, matchIndex - 16);
  const end = Math.min(source.length, matchIndex + needle.length + 24);
  return `${start > 0 ? '…' : ''}${source.slice(start, end)}${
    end < source.length ? '…' : ''
  }`;
};
