import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * 邻里留言簿存储（居民主页迭代 S2）。
 *
 * 仅原住民（editor/admin）可读写；游客不可访问（由上层 app.js 拦截）。
 * 纯留言，无点赞 / 热度 / 排行。
 */
const now = () => new Date().toISOString();

const mapMessage = (row) => ({
  id: row.id,
  fromUserId: row.from_user_id,
  fromUsername: row.from_username,
  content: row.content,
  createdAt: row.created_at,
});

export const createGuestbookStore = ({ databasePath = ':memory:' } = {}) => {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);

  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS guestbook_messages (
      id TEXT PRIMARY KEY,
      from_user_id INTEGER NOT NULL,
      from_username TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_guestbook_created
      ON guestbook_messages(created_at DESC, id DESC);
  `);

  const getById = (id) => {
    const row = database
      .prepare('SELECT * FROM guestbook_messages WHERE id = ?')
      .get(id);

    return row ? mapMessage(row) : null;
  };

  const list = (limit = 100) =>
    database
      .prepare(
        `SELECT * FROM guestbook_messages
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      )
      .all(limit)
      .map(mapMessage);

  const create = ({ fromUserId, fromUsername, content }) => {
    const createdAt = now();
    const id = `gb-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const message = {
      id,
      fromUserId,
      fromUsername: fromUsername || '',
      content,
      createdAt,
    };

    database
      .prepare(
        `INSERT INTO guestbook_messages (
          id, from_user_id, from_username, content, created_at
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        message.id,
        message.fromUserId,
        message.fromUsername,
        message.content,
        message.createdAt,
      );

    return message;
  };

  const remove = (id) => {
    const current = getById(id);

    if (!current) return null;

    database.prepare('DELETE FROM guestbook_messages WHERE id = ?').run(id);
    return current;
  };

  return Object.freeze({
    getById,
    list,
    create,
    remove,
    close() {
      database.close();
    },
  });
};
