// backend/src/services/conversationRegistry.js
// 待办⑥：conversationId → owner 归属注册表（HITL resume 归属校验）。
// P5.2-⑥（2026-09-26）：存储从内存 Map 落 SQLite（backend/data/conversation-registry.db，跨重启持久化）。
// 语义不变：注册会话发起人（userContext.userId），供 resume 校验「请求者是否为该会话 owner」；
// 上限清理防无限增长。
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(currentDir, '../..');

export const createConversationRegistry = ({
  // 默认内存（测试/回退友好）；生产持久化由 server.js 显式传入 backend/data/conversation-registry.db。
  databasePath = ':memory:',
  maxEntries = 2000,
  now = Date.now,
} = {}) => {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);

  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS conversation_owners (
      conversation_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      role TEXT,
      username TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const ensureCapacity = () => {
    const { count } = database
      .prepare('SELECT COUNT(*) AS count FROM conversation_owners')
      .get();

    if (count < maxEntries) return;

    // 简单 FIFO 清理：删除最早的若干条（保留最新的一半）
    const rows = database
      .prepare(
        `SELECT conversation_id FROM conversation_owners
         ORDER BY updated_at ASC
         LIMIT ?`,
      )
      .all(Math.ceil(maxEntries / 2));

    const remove = database.prepare(
      'DELETE FROM conversation_owners WHERE conversation_id = ?',
    );
    for (const row of rows) remove.run(row.conversation_id);
  };

  const mapOwner = (row) =>
    row
      ? {
          userId: row.user_id,
          role: row.role ?? null,
          username: row.username,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      : null;

  return {
    // 注册/更新 owner：同一 conversationId 首次记录发起人；后续同人刷新不覆盖，异人更新（最后写入者视为 owner）。
    register(conversationId, userContext) {
      if (!conversationId || !userContext?.userId) return;

      ensureCapacity();

      const timestamp = now();
      const previous = database
        .prepare('SELECT created_at FROM conversation_owners WHERE conversation_id = ?')
        .get(conversationId);

      database
        .prepare(
          `INSERT INTO conversation_owners (
            conversation_id, user_id, role, username, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(conversation_id) DO UPDATE SET
            user_id = excluded.user_id,
            role = excluded.role,
            username = excluded.username,
            updated_at = excluded.updated_at`,
        )
        .run(
          conversationId,
          userContext.userId,
          userContext.role ?? null,
          userContext.username ?? '',
          previous?.created_at ?? timestamp,
          timestamp,
        );
    },

    // 查询 owner 归属（不存在返回 null）
    getOwner(conversationId) {
      const row = database
        .prepare('SELECT * FROM conversation_owners WHERE conversation_id = ?')
        .get(conversationId);

      return mapOwner(row);
    },

    // 校验：请求者是否该会话 owner（admin 在路由层单独放行）
    isOwner(conversationId, userId) {
      if (!conversationId || !userId) return false;

      const row = database
        .prepare('SELECT user_id FROM conversation_owners WHERE conversation_id = ?')
        .get(conversationId);

      return row?.user_id === userId;
    },

    get size() {
      return database
        .prepare('SELECT COUNT(*) AS count FROM conversation_owners')
        .get().count;
    },

    close() {
      database.close();
    },
  };
};

// 模块单例：默认内存（兼容旧行为）；生产持久化实例在 server.js 装配。
export const conversationRegistry = createConversationRegistry();
