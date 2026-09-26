// backend/src/services/sceneAuditStore.js
// P5.2-⑧：KIN 审批（HITL resume 决策）审计留痕 —— SQLite 持久化。
// 记录：谁（actor）在何时对哪个会话（conversationId）作出了批准/拒绝决策。
// 独立于 phase6 的审计库（scene 服务自持，避免跨服务写 phase6 库的耦合）；
// 查询端点在 scene 服务提供（GET /api/scene/route/audit，admin 可见）。
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const now = () => new Date().toISOString();

const mapEvent = (row) => ({
  id: row.id,
  conversationId: row.conversation_id,
  actorUserId: row.actor_user_id,
  actorUsername: row.actor_username,
  actorRole: row.actor_role,
  approved: row.approved === 1,
  reason: row.reason,
  ipAddress: row.ip_address,
  userAgent: row.user_agent,
  createdAt: row.created_at,
});

export const createSceneAuditStore = ({
  databasePath = ':memory:',
} = {}) => {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);

  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS scene_audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      actor_user_id INTEGER,
      actor_username TEXT,
      actor_role TEXT,
      approved INTEGER NOT NULL CHECK (approved IN (0, 1)),
      reason TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scene_audit_created
      ON scene_audit_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_scene_audit_conv
      ON scene_audit_events(conversation_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_scene_audit_approved
      ON scene_audit_events(approved, created_at DESC);
  `);

  const insert = database.prepare(`
    INSERT INTO scene_audit_events (
      conversation_id,
      actor_user_id,
      actor_username,
      actor_role,
      approved,
      reason,
      ip_address,
      user_agent,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const record = ({
    conversationId,
    actorUserId = null,
    actorUsername = null,
    actorRole = null,
    approved,
    reason = null,
    ipAddress = null,
    userAgent = null,
  }) => {
    const createdAt = now();
    const resultRow = insert.run(
      conversationId,
      actorUserId,
      actorUsername,
      actorRole,
      approved ? 1 : 0,
      reason,
      ipAddress,
      userAgent,
      createdAt,
    );

    return {
      id: Number(resultRow.lastInsertRowid),
      conversationId,
      actorUserId,
      actorUsername,
      actorRole,
      approved,
      reason,
      ipAddress,
      userAgent,
      createdAt,
    };
  };

  const list = ({ approved, limit = 100, offset = 0 } = {}) => {
    const parameters = [];
    const clauses = [];

    if (approved !== undefined && approved !== null) {
      clauses.push('approved = ?');
      parameters.push(approved ? 1 : 0);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    parameters.push(Math.min(Math.max(limit, 1), 500), Math.max(offset, 0));

    return database
      .prepare(
        `
        SELECT *
        FROM scene_audit_events
        ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(...parameters)
      .map(mapEvent);
  };

  return Object.freeze({
    record,
    list,
    close() {
      database.close();
    },
  });
};
