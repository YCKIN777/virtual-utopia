import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * 串门留言簿存储（P1-3）：宅院留言（可回复，parent_id 线程）+ 来访记录。
 *
 * - home_messages：宅院留言，parent_id 为 null 表示顶层留言，非 null 表示对某条留言的回复。
 * - home_visits：来访记录（visit:enter 触发），供院主查看/推送「谁来串门了」。
 */
const now = () => new Date().toISOString();

const mapMessage = (row) => ({
  id: row.id,
  plotId: row.plot_id,
  authorUserId: row.author_user_id,
  authorName: row.author_name,
  content: row.content,
  parentId: row.parent_id,
  createdAt: row.created_at,
});

const mapVisit = (row) => ({
  id: row.id,
  plotId: row.plot_id,
  visitorUserId: row.visitor_user_id,
  visitorName: row.visitor_name,
  visitedAt: row.visited_at,
});

export const createHomeSocialStore = ({ databasePath = ':memory:' } = {}) => {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);

  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS home_messages (
      id TEXT PRIMARY KEY,
      plot_id TEXT NOT NULL,
      author_user_id INTEGER NOT NULL,
      author_name TEXT NOT NULL,
      content TEXT NOT NULL,
      parent_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_home_messages_plot
      ON home_messages(plot_id, created_at);

    CREATE TABLE IF NOT EXISTS home_visits (
      id TEXT PRIMARY KEY,
      plot_id TEXT NOT NULL,
      visitor_user_id INTEGER NOT NULL,
      visitor_name TEXT NOT NULL,
      visited_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_home_visits_plot
      ON home_visits(plot_id, visited_at);
  `);

  const listMessages = (plotId) =>
    database
      .prepare(
        `SELECT * FROM home_messages
         WHERE plot_id = ?
         ORDER BY created_at ASC, id ASC`,
      )
      .all(plotId)
      .map(mapMessage);

  const createMessage = ({ plotId, authorUserId, authorName, content, parentId }) => {
    const createdAt = now();
    const id = `hm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const message = {
      id,
      plotId,
      authorUserId,
      authorName,
      content,
      parentId: parentId || null,
      createdAt,
    };

    database
      .prepare(
        `INSERT INTO home_messages (
          id, plot_id, author_user_id, author_name, content, parent_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        message.id,
        message.plotId,
        message.authorUserId,
        message.authorName,
        message.content,
        message.parentId,
        message.createdAt,
      );

    return message;
  };

  const listVisits = (plotId) =>
    database
      .prepare(
        `SELECT * FROM home_visits
         WHERE plot_id = ?
         ORDER BY visited_at DESC, id DESC`,
      )
      .all(plotId)
      .map(mapVisit);

  const recordVisit = ({ plotId, visitorUserId, visitorName }) => {
    const visitedAt = now();
    const id = `hv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const visit = { id, plotId, visitorUserId, visitorName, visitedAt };

    database
      .prepare(
        `INSERT INTO home_visits (
          id, plot_id, visitor_user_id, visitor_name, visited_at
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(visit.id, visit.plotId, visit.visitorUserId, visit.visitorName, visit.visitedAt);

    return visit;
  };

  return Object.freeze({
    listMessages,
    createMessage,
    listVisits,
    recordVisit,
    close() {
      database.close();
    },
  });
};
