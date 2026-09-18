const timestamp = () => new Date().toISOString();

const parseJson = (value, fallback = {}) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const mapMessage = (row) =>
  row
    ? {
        id: row.id,
        clientMessageId: row.client_message_id,
        channelType: row.channel_type,
        channelId: row.channel_id,
        senderUserId: Number(row.sender_user_id),
        senderUsername: row.sender_username,
        content: row.status === 'recalled' ? '[消息已撤回]' : row.content,
        filtered: Boolean(row.filtered),
        status: row.status,
        createdAt: row.created_at,
        recalledAt: row.recalled_at,
        recalledBy: row.recalled_by === null ? null : Number(row.recalled_by),
      }
    : null;

export const createModuleBRepositories = (database) => {
  const all = (sql, parameters = []) =>
    database.prepare(sql).all(...parameters);
  const get = (sql, parameters = []) =>
    database.prepare(sql).get(...parameters);
  const run = (sql, parameters = []) =>
    database.prepare(sql).run(...parameters);

  const users = {
    upsert(user) {
      run(
        `INSERT INTO bp4_module_b_users (
          user_id,
          username,
          display_name,
          phase5_role,
          last_seen_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          username = excluded.username,
          display_name = excluded.display_name,
          phase5_role = excluded.phase5_role,
          last_seen_at = excluded.last_seen_at`,
        [
          user.id,
          user.username,
          user.displayName || user.username,
          user.role,
          timestamp(),
        ],
      );
    },
    list() {
      return all(
        `SELECT *
         FROM bp4_module_b_users
         ORDER BY username ASC`,
      ).map((row) => ({
        userId: Number(row.user_id),
        username: row.username,
        displayName: row.display_name,
        phase5Role: row.phase5_role,
        lastSeenAt: row.last_seen_at,
      }));
    },
  };

  const messages = {
    insert(message) {
      run(
        `INSERT INTO bp4_module_b_messages (
          id,
          client_message_id,
          channel_type,
          channel_id,
          sender_user_id,
          sender_username,
          content,
          filtered,
          status,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [
          message.id,
          message.clientMessageId || null,
          message.channelType,
          message.channelId,
          message.senderUserId,
          message.senderUsername,
          message.content,
          message.filtered ? 1 : 0,
          message.createdAt,
        ],
      );

      return messages.get(message.id);
    },
    get(messageId) {
      return mapMessage(
        get(
          `SELECT *
           FROM bp4_module_b_messages
           WHERE id = ?`,
          [messageId],
        ),
      );
    },
    list({ channelId, limit = 50 }) {
      return all(
        `SELECT *
         FROM bp4_module_b_messages
         WHERE channel_id = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?`,
        [channelId, limit],
      )
        .reverse()
        .map(mapMessage);
    },
    recall({ messageId, recalledBy, recalledAt }) {
      run(
        `UPDATE bp4_module_b_messages
         SET status = 'recalled',
             recalled_at = ?,
             recalled_by = ?
         WHERE id = ?
           AND status = 'active'`,
        [recalledAt, recalledBy, messageId],
      );

      return messages.get(messageId);
    },
  };

  const audit = {
    record({ actor, action, resourceType, resourceId, result, details = {} }) {
      run(
        `INSERT INTO bp4_module_b_audit_logs (
          actor_user_id,
          actor_username,
          action,
          resource_type,
          resource_id,
          result,
          details_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          actor?.id || null,
          actor?.username || null,
          action,
          resourceType,
          resourceId,
          result,
          JSON.stringify(details),
          timestamp(),
        ],
      );
    },
    list(limit = 100) {
      return all(
        `SELECT *
         FROM bp4_module_b_audit_logs
         ORDER BY id DESC
         LIMIT ?`,
        [limit],
      ).map((row) => ({
        id: Number(row.id),
        actorUserId: row.actor_user_id,
        actorUsername: row.actor_username,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        result: row.result,
        details: parseJson(row.details_json),
        createdAt: row.created_at,
      }));
    },
  };

  return Object.freeze({
    audit,
    messages,
    users,
  });
};
