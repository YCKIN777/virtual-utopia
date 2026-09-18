/**
 * memoryRetriever 向量召回 单元测试。
 * 覆盖：embedding 生成与相似度、权重模式、向量模式、旧记忆无向量兼容。
 *
 * 用法：node --test backend/src/memory/tests/memoryRetriever.test.js
 */
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { openMemoryDatabase, newId, now } from '../database.mjs';
import { createEmbeddingGenerator } from '../embedding.mjs';
import { createMemoryRetriever } from '../memoryRetriever.mjs';

const dbPath = 'H:/BP2/data/retriever-test.sqlite';
const userId = 'u_test';
let db;

beforeEach(() => {
  if (db) {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
  for (const s of ['', '-wal', '-shm']) {
    try {
      rmSync(dbPath + s, { force: true });
    } catch {
      // ignore
    }
  }
  db = openMemoryDatabase({ databasePath: dbPath });
  db.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)').run(
    userId,
    now(),
    now(),
  );
});

after(() => {
  try {
    db.close();
  } catch {
    // ignore
  }
  for (const s of ['', '-wal', '-shm']) {
    try {
      rmSync(dbPath + s, { force: true });
    } catch {
      // ignore
    }
  }
});

const insert = (content, importance, embedding) => {
  db.prepare(
    'INSERT INTO user_memory (id, user_id, content, category, importance, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(newId('mem'), userId, content, 'preference', importance, embedding, now(), now());
};

test('embedding：相似文本相似度更高，且生成确定性', () => {
  const emb = createEmbeddingGenerator();
  const a = emb.generate('用户偏好宋式美学风格');
  const b = emb.generate('用户喜欢宋式美学装修');
  const c = emb.generate('今天天气晴朗适合散步');
  assert.equal(a.length, 128);
  assert.ok(emb.cosine(a, b) > emb.cosine(a, c), '相似文本余弦相似度应更高');
  assert.deepEqual(emb.generate('测试'), emb.generate('测试'), 'embedding 应确定性');
});

test('权重模式：按 importance 降序', () => {
  insert('低权重记忆', 0.3, null);
  insert('高权重记忆', 0.9, null);
  const retriever = createMemoryRetriever({ db, mode: 'weight' });
  const rows = retriever.retrieve({ userId, limit: 10 });
  assert.equal(rows[0].content, '高权重记忆');
  assert.equal(rows[0].importance, 0.9);
});

test('向量模式：按相关性召回（相似度优先，importance 二次排序）', () => {
  const emb = createEmbeddingGenerator();
  insert(
    '用户偏好宋式美学风格',
    0.4,
    JSON.stringify(emb.generate('用户偏好宋式美学风格')),
  );
  insert(
    '用户职业是社区规划师',
    0.9,
    JSON.stringify(emb.generate('用户职业是社区规划师')),
  );
  const retriever = createMemoryRetriever({ db, mode: 'vector' });
  const rows = retriever.retrieve({ userId, query: '你喜欢什么装修风格？', limit: 10 });
  const songshi = rows.find((r) => r.content.includes('宋式'));
  const career = rows.find((r) => r.content.includes('社区规划师'));
  assert.ok(songshi && career, '两条记忆都应被召回');
  assert.ok(
    songshi.similarity > career.similarity,
    '即使职业记忆 importance 更高，宋式相关记忆相似度应更高并排前',
  );
  assert.equal(rows[0].content, songshi.content, '向量召回应优先相关性最高记忆');
});

test('兼容旧记忆：无向量 similarity=0，不崩溃', () => {
  insert('旧记忆无向量', 0.6, null);
  const retriever = createMemoryRetriever({ db, mode: 'vector' });
  const rows = retriever.retrieve({ userId, query: '随便问点什么', limit: 10 });
  const old = rows.find((r) => r.content === '旧记忆无向量');
  assert.ok(old, '旧记忆（无向量）应被召回');
  assert.equal(old.similarity, 0, '无向量记忆 similarity 应为 0');
});
