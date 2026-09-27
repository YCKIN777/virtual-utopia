/**
 * 异步记忆提炼模块：从对话中提取事实，入库 user_memory。
 * 特性：LLM 提取（无 key 时启发式回退）、事实去重、冲突权重降级。
 */
import { newId, now } from './database.mjs';
import { createEmbeddingGenerator } from './embedding.mjs';

const EXTRACT_PROMPT = `你是记忆提炼器。从以下对话中提取值得长期记住的用户事实。
只输出 JSON 数组，每个元素格式：
{"category":"preference|identity|fact|instruction","content":"事实描述","importance":0.0~1.0}
只提取稳定的、跨会话有价值的事实（用户偏好、身份、长期目标等），不要提取寒暄。`;

const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[\s，。！？、,.!?；;：:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const clampImportance = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
};

export const createMemoryExtractor = ({ db, llmClient, embeddingGenerator } = {}) => {
  const emb = embeddingGenerator || createEmbeddingGenerator();
  const extractFacts = async ({ userId, conversationId, messages }) => {
    const facts = await callLlmForFacts(messages);
    const inserted = [];

    for (const fact of facts) {
      const content = String((fact && fact.content) || '').trim();
      if (!content) continue;
      const category = (fact && fact.category) || 'fact';
      const importance = clampImportance(fact && fact.importance);
      const norm = normalize(content);

      const existing = db
        .prepare(
          'SELECT id, content, category, importance FROM user_memory WHERE user_id = ?',
        )
        .all(userId);

      // 1) 去重：完全相同的记忆跳过
      const dup = existing.find((e) => normalize(e.content) === norm);
      if (dup) continue;

      // 2) 冲突：同类目且共享主语片段但内容不同 → 旧记忆权重降级
      const conflict = existing.find(
        (e) =>
          (e.category === category || !e.category) &&
          shareSubject(normalize(e.content), norm),
      );
      if (conflict) {
        db.prepare(
          'UPDATE user_memory SET importance = ?, updated_at = ? WHERE id = ?',
        ).run(
          Math.max(0.1, Number(conflict.importance) * 0.5),
          now(),
          conflict.id,
        );
      }

      const id = newId('mem');
      const embedding = JSON.stringify(emb.generate(content));
      db.prepare(
        `INSERT INTO user_memory
         (id, user_id, content, category, importance, source_conversation_id, embedding, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, userId, content, category, importance, conversationId, embedding, now(), now());

      inserted.push({ id, content, category, importance });
    }

    return inserted;
  };

  const callLlmForFacts = async (messages) => {
    if (llmClient) {
      try {
        let parsed = null;
        if (typeof llmClient.completeJson === 'function') {
          parsed = await llmClient.completeJson([
            { role: 'system', content: EXTRACT_PROMPT },
            ...messages,
          ]);
        } else if (typeof llmClient.createStructuredResponse === 'function') {
          const response = await llmClient.createStructuredResponse({
            messages: [
              { role: 'system', content: EXTRACT_PROMPT },
              ...messages,
            ],
            responseSchema: {
              type: 'object',
              properties: { facts: { type: 'array' } },
            },
          });
          parsed = response?.data;
        }
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.facts)) return parsed.facts;
      } catch (error) {
        console.warn(
          '[memory-extractor] LLM 提炼失败，回退启发式:',
          error?.message,
        );
      }
    }
    return heuristicExtract(messages);
  };

  const heuristicExtract = (messages) => {
    const facts = [];
    const patterns = [
      { re: /我(?:喜欢|偏好|最爱|想要|希望|也喜欢|就爱)[：:，,\s]*([^。！？!?\n]{2,40})/g, category: 'preference' },
      { re: /我(?:每天|每周|每年|常常|经常|习惯|平时|一向)[：:，,\s]*([^。！？!?\n]{2,40})/g, category: 'preference' },
      { re: /我是([^。！？!?\n]{1,20})/g, category: 'identity' },
    ];
    for (const m of messages || []) {
      if (!m || m.role !== 'user') continue;
      const text = String(m.content || '');
      for (const { re, category } of patterns) {
        let match;
        while ((match = re.exec(text)) !== null) {
          facts.push({
            category,
            content: '用户：' + match[1].trim(),
            importance: 0.7,
          });
        }
      }
    }
    return facts;
  };

  // 简单主语共享判定：取规范化后前 6 字符作为主语片段比对
  const shareSubject = (a, b) => {
    const sa = a.slice(0, Math.min(6, a.length));
    const sb = b.slice(0, Math.min(6, b.length));
    return sa.length > 0 && sa === sb;
  };

  return { extractFacts };
};
