import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const now = () => new Date().toISOString();

const mapEvent = (row) => ({
  id: row.id,
  actorUserId: row.actor_user_id,
  actorUsername: row.actor_username,
  action: row.action,
  result: row.result,
  resourceType: row.resource_type,
  resourceId: row.resource_id,
  details: JSON.parse(row.details_json || '{}'),
  ipAddress: row.ip_address,
  userAgent: row.user_agent,
  createdAt: row.created_at,
});

export const createAuditStore = (databasePath = ':memory:') => {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), {
      recursive: true,
    });
  }

  const database = new DatabaseSync(databasePath);

  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS phase6_audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER,
      actor_username TEXT,
      action TEXT NOT NULL,
      result TEXT NOT NULL CHECK (result IN ('success', 'failure')),
      resource_type TEXT,
      resource_id TEXT,
      details_json TEXT NOT NULL DEFAULT '{}',
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_phase6_audit_created
      ON phase6_audit_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_phase6_audit_actor
      ON phase6_audit_events(actor_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_phase6_audit_action
      ON phase6_audit_events(action, created_at DESC);
  `);

  const insert = database.prepare(`
    INSERT INTO phase6_audit_events (
      actor_user_id,
      actor_username,
      action,
      result,
      resource_type,
      resource_id,
      details_json,
      ip_address,
      user_agent,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const record = ({
    actorUserId = null,
    actorUsername = null,
    action,
    result,
    resourceType = null,
    resourceId = null,
    details = {},
    ipAddress = null,
    userAgent = null,
  }) => {
    const createdAt = now();
    const resultRow = insert.run(
      actorUserId,
      actorUsername,
      action,
      result,
      resourceType,
      resourceId,
      JSON.stringify(details),
      ipAddress,
      userAgent,
      createdAt,
    );

    return {
      id: Number(resultRow.lastInsertRowid),
      actorUserId,
      actorUsername,
      action,
      result,
      resourceType,
      resourceId,
      details,
      ipAddress,
      userAgent,
      createdAt,
    };
  };

  const list = ({ action, limit = 100, offset = 0 } = {}) => {
    const parameters = [];
    const where = action ? 'WHERE action = ?' : '';

    if (action) {
      parameters.push(action);
    }

    parameters.push(Math.min(Math.max(limit, 1), 500), Math.max(offset, 0));

    return database
      .prepare(
        `
        SELECT *
        FROM phase6_audit_events
        ${where}
        ORDER BY created_at DESC
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
