import { Bp3NotFoundError } from '../../../backend/src/errors.js';
import { createOpaqueToken } from '../../../backend/src/security.js';

const timestamp = () => new Date().toISOString();

const mapCatalogEntry = (row) =>
  row
    ? {
        id: row.id,
        kind: row.kind,
        name: row.name,
        description: row.description,
        icon: row.icon,
        displayOrder: row.display_order,
      }
    : null;

const mapAvatarState = (row) =>
  row
    ? {
        userId: row.user_id,
        actionId: row.action_id,
        emoteId: row.emote_id,
        sequence: row.sequence,
        updatedAt: row.updated_at,
      }
    : null;

const mapMessage = (row) =>
  row
    ? {
        id: row.id,
        plotId: row.plot_id,
        authorUserId: row.author_user_id,
        authorUsername: row.author_username,
        authorDisplayName: row.author_display_name,
        content: row.content,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;

export const createP2Repositories = ({ database, transaction }) => {
  const all = (sql, parameters = []) =>
    database.prepare(sql).all(...parameters);
  const get = (sql, parameters = []) =>
    database.prepare(sql).get(...parameters);
  const run = (sql, parameters = []) =>
    database.prepare(sql).run(...parameters);

  const avatar = {
    listCatalog(kind = null) {
      if (kind) {
        return all(
          `SELECT *
           FROM bp3_p2_avatar_catalog
           WHERE kind = ?
           ORDER BY display_order ASC, id ASC`,
          [kind],
        ).map(mapCatalogEntry);
      }

      return all(
        `SELECT *
         FROM bp3_p2_avatar_catalog
         ORDER BY display_order ASC, id ASC`,
      ).map(mapCatalogEntry);
    },
    getCatalogEntry(id) {
      return mapCatalogEntry(
        get(
          `SELECT *
           FROM bp3_p2_avatar_catalog
           WHERE id = ?`,
          [id],
        ),
      );
    },
    getState(userId) {
      return mapAvatarState(
        get(
          `SELECT *
           FROM bp3_p2_avatar_states
           WHERE user_id = ?`,
          [userId],
        ),
      );
    },
    listStates(userIds = null) {
      if (userIds?.length) {
        const placeholders = userIds.map(() => '?').join(', ');

        return all(
          `SELECT *
           FROM bp3_p2_avatar_states
           WHERE user_id IN (${placeholders})
           ORDER BY updated_at DESC`,
          userIds,
        ).map(mapAvatarState);
      }

      return all(
        `SELECT *
         FROM bp3_p2_avatar_states
         ORDER BY updated_at DESC
         LIMIT 200`,
      ).map(mapAvatarState);
    },
    upsertState({ userId, actionId, emoteId }) {
      const currentTime = timestamp();

      run(
        `INSERT INTO bp3_p2_avatar_states (
          user_id,
          action_id,
          emote_id,
          sequence,
          updated_at
        ) VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          action_id = excluded.action_id,
          emote_id = excluded.emote_id,
          sequence = bp3_p2_avatar_states.sequence + 1,
          updated_at = excluded.updated_at`,
        [userId, actionId, emoteId, currentTime],
      );

      return avatar.getState(userId);
    },
  };

  const messages = {
    create({ plotId, author, content }) {
      const id = `message-${Date.now()}-${createOpaqueToken(5)}`;
      const currentTime = timestamp();

      run(
        `INSERT INTO bp3_p2_home_messages (
          id,
          plot_id,
          author_user_id,
          author_username,
          author_display_name,
          content,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        [
          id,
          plotId,
          author.id,
          author.username,
          author.displayName || author.username,
          content,
          currentTime,
          currentTime,
        ],
      );

      return messages.get(id);
    },
    get(id) {
      return mapMessage(
        get(
          `SELECT *
           FROM bp3_p2_home_messages
           WHERE id = ?`,
          [id],
        ),
      );
    },
    list(plotId, limit = 100) {
      return all(
        `SELECT *
         FROM bp3_p2_home_messages
         WHERE plot_id = ?
           AND status = 'active'
         ORDER BY created_at DESC
         LIMIT ?`,
        [plotId, limit],
      ).map(mapMessage);
    },
    softDelete(id) {
      const current = messages.get(id);

      if (!current) {
        throw new Bp3NotFoundError('Home message not found');
      }

      run(
        `UPDATE bp3_p2_home_messages
         SET status = 'deleted',
             updated_at = ?
         WHERE id = ?`,
        [timestamp(), id],
      );

      return messages.get(id);
    },
  };

  const auditLogs = {
    record({
      actorUserId = null,
      action,
      resourceType,
      resourceId = null,
      result,
      details = {},
    }) {
      run(
        `INSERT INTO bp3_p2_audit_logs (
          actor_user_id,
          action,
          resource_type,
          resource_id,
          result,
          details_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          actorUserId,
          action,
          resourceType,
          resourceId,
          result,
          JSON.stringify(details),
          timestamp(),
        ],
      );
    },
  };

  return Object.freeze({
    auditLogs,
    avatar,
    messages,
    transaction,
  });
};
