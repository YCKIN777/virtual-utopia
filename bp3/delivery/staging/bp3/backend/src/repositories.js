import { createOpaqueToken, hashToken } from './security.js';

const timestamp = () => new Date().toISOString();

const parseJson = (value, fallback = {}) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const toBoolean = (value) => value === 1;

const mapOwner = (row) =>
  row
    ? {
        plotId: row.plot_id,
        userId: row.user_id,
        source: row.source,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;

const mapVoiceParticipant = (row) =>
  row
    ? {
        channelId: row.channel_id,
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name,
        role: row.role,
        muted: toBoolean(row.muted),
        speaking: toBoolean(row.speaking),
        connectionId: row.connection_id,
        joinedAt: row.joined_at,
        lastSeenAt: row.last_seen_at,
      }
    : null;

const mapAccessRule = (row) =>
  row
    ? {
        plotId: row.plot_id,
        ownerUserId: row.owner_user_id,
        accessMode: row.access_mode,
        lockEnabled: toBoolean(row.lock_enabled),
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;

const mapVisitor = (row) =>
  row
    ? {
        plotId: row.plot_id,
        userId: row.user_id,
        listType: row.list_type,
        grantedBy: row.granted_by,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;

const mapRequest = (row) =>
  row
    ? {
        id: row.id,
        plotId: row.plot_id,
        requesterUserId: row.requester_user_id,
        requesterUsername: row.requester_username,
        requesterDisplayName: row.requester_display_name,
        message: row.message,
        status: row.status,
        resolverUserId: row.resolver_user_id,
        requestedAt: row.requested_at,
        resolvedAt: row.resolved_at,
      }
    : null;

const mapGrant = (row) =>
  row
    ? {
        id: row.id,
        plotId: row.plot_id,
        userId: row.user_id,
        grantType: row.grant_type,
        expiresAt: row.expires_at,
        maxUses: row.max_uses,
        usedCount: row.used_count,
        revokedAt: row.revoked_at,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;

const mapVisitLog = (row) =>
  row
    ? {
        id: row.id,
        plotId: row.plot_id,
        userId: row.user_id,
        username: row.username,
        action: row.action,
        result: row.result,
        reason: row.reason,
        details: parseJson(row.details_json),
        createdAt: row.created_at,
      }
    : null;

export const createRepositories = ({ database, transaction }) => {
  const all = (sql, parameters = []) =>
    database.prepare(sql).all(...parameters);
  const get = (sql, parameters = []) =>
    database.prepare(sql).get(...parameters);
  const run = (sql, parameters = []) =>
    database.prepare(sql).run(...parameters);

  const plotOwners = {
    getByPlot(plotId) {
      return mapOwner(
        get('SELECT * FROM bp3_plot_owners WHERE plot_id = ?', [plotId]),
      );
    },
    getByUser(userId) {
      return mapOwner(
        get('SELECT * FROM bp3_plot_owners WHERE user_id = ?', [userId]),
      );
    },
    upsert({ plotId, userId, source = 'phase5-world-state' }) {
      const currentTime = timestamp();

      run(
        `INSERT INTO bp3_plot_owners (
          plot_id,
          user_id,
          source,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(plot_id) DO UPDATE SET
          user_id = excluded.user_id,
          source = excluded.source,
          updated_at = excluded.updated_at`,
        [plotId, userId, source, currentTime, currentTime],
      );

      return plotOwners.getByPlot(plotId);
    },
  };

  const voiceChannels = {
    list() {
      return all(
        `SELECT *
         FROM bp3_voice_channels
         WHERE status = 'active'
         ORDER BY created_at ASC`,
      ).map((row) => ({
        id: row.id,
        name: row.name,
        sfuRoomId: row.sfu_room_id,
        status: row.status,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    },
    getById(channelId) {
      const row = get('SELECT * FROM bp3_voice_channels WHERE id = ?', [
        channelId,
      ]);

      return row
        ? {
            id: row.id,
            name: row.name,
            sfuRoomId: row.sfu_room_id,
            status: row.status,
            createdBy: row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          }
        : null;
    },
    ensure({ id, name, createdBy }) {
      const currentTime = timestamp();

      run(
        `INSERT OR IGNORE INTO bp3_voice_channels (
          id,
          name,
          sfu_room_id,
          status,
          created_by,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, 'active', ?, ?, ?)`,
        [id, name, id, createdBy, currentTime, currentTime],
      );

      return voiceChannels.getById(id);
    },
  };

  const voiceParticipants = {
    list(channelId) {
      return all(
        `SELECT *
         FROM bp3_voice_participants
         WHERE channel_id = ?
         ORDER BY joined_at ASC`,
        [channelId],
      ).map(mapVoiceParticipant);
    },
    get(channelId, userId) {
      return mapVoiceParticipant(
        get(
          `SELECT *
           FROM bp3_voice_participants
           WHERE channel_id = ? AND user_id = ?`,
          [channelId, userId],
        ),
      );
    },
    upsert({ channelId, userId, username, displayName, role, connectionId }) {
      const currentTime = timestamp();

      run(
        `INSERT INTO bp3_voice_participants (
          channel_id,
          user_id,
          username,
          display_name,
          role,
          muted,
          speaking,
          connection_id,
          joined_at,
          last_seen_at
        ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
        ON CONFLICT(channel_id, user_id) DO UPDATE SET
          username = excluded.username,
          display_name = excluded.display_name,
          role = excluded.role,
          connection_id = excluded.connection_id,
          last_seen_at = excluded.last_seen_at`,
        [
          channelId,
          userId,
          username,
          displayName,
          role,
          connectionId,
          currentTime,
          currentTime,
        ],
      );

      return voiceParticipants.get(channelId, userId);
    },
    remove(channelId, userId) {
      run(
        `DELETE FROM bp3_voice_participants
         WHERE channel_id = ? AND user_id = ?`,
        [channelId, userId],
      );
    },
    updateState({ channelId, userId, muted, speaking, connectionId }) {
      const current = voiceParticipants.get(channelId, userId);

      if (!current) {
        return null;
      }

      run(
        `UPDATE bp3_voice_participants
         SET muted = ?,
             speaking = ?,
             connection_id = ?,
             last_seen_at = ?
         WHERE channel_id = ? AND user_id = ?`,
        [
          muted === undefined ? Number(current.muted) : Number(muted),
          speaking === undefined ? Number(current.speaking) : Number(speaking),
          connectionId === undefined ? current.connectionId : connectionId,
          timestamp(),
          channelId,
          userId,
        ],
      );

      return voiceParticipants.get(channelId, userId);
    },
    removeByConnection(channelId, connectionId) {
      run(
        `DELETE FROM bp3_voice_participants
         WHERE channel_id = ? AND connection_id = ?`,
        [channelId, connectionId],
      );
    },
  };

  const voiceBlacklist = {
    has(channelId, userId) {
      return Boolean(
        get(
          `SELECT 1 AS present
           FROM bp3_voice_blacklist
           WHERE channel_id = ? AND user_id = ?`,
          [channelId, userId],
        ),
      );
    },
    add({ channelId, userId, reason = null, createdBy }) {
      run(
        `INSERT INTO bp3_voice_blacklist (
          channel_id,
          user_id,
          reason,
          created_by,
          created_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(channel_id, user_id) DO UPDATE SET
          reason = excluded.reason,
          created_by = excluded.created_by,
          created_at = excluded.created_at`,
        [channelId, userId, reason, createdBy, timestamp()],
      );
    },
    remove(channelId, userId) {
      run(
        `DELETE FROM bp3_voice_blacklist
         WHERE channel_id = ? AND user_id = ?`,
        [channelId, userId],
      );
    },
  };

  const accessRules = {
    get(plotId) {
      return mapAccessRule(
        get('SELECT * FROM bp3_home_access_rules WHERE plot_id = ?', [plotId]),
      );
    },
    upsert({ plotId, ownerUserId, accessMode, lockEnabled }) {
      const current = accessRules.get(plotId);
      const currentTime = timestamp();

      if (current) {
        run(
          `UPDATE bp3_home_access_rules
           SET owner_user_id = ?,
               access_mode = ?,
               lock_enabled = ?,
               version = version + 1,
               updated_at = ?
           WHERE plot_id = ?`,
          [
            ownerUserId ?? current.ownerUserId,
            accessMode ?? current.accessMode,
            lockEnabled === undefined
              ? Number(current.lockEnabled)
              : Number(lockEnabled),
            currentTime,
            plotId,
          ],
        );
      } else {
        run(
          `INSERT INTO bp3_home_access_rules (
            plot_id,
            owner_user_id,
            access_mode,
            lock_enabled,
            version,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, 1, ?, ?)`,
          [
            plotId,
            ownerUserId,
            accessMode || 'public',
            lockEnabled === undefined ? 1 : Number(lockEnabled),
            currentTime,
            currentTime,
          ],
        );
      }

      return accessRules.get(plotId);
    },
  };

  const visitors = {
    list(plotId, listType) {
      const parameters = [plotId];
      const typeClause = listType ? 'AND list_type = ?' : '';

      if (listType) {
        parameters.push(listType);
      }

      return all(
        `SELECT *
         FROM bp3_home_visitors
         WHERE plot_id = ? ${typeClause}
         ORDER BY updated_at DESC`,
        parameters,
      ).map(mapVisitor);
    },
    get(plotId, userId) {
      return mapVisitor(
        get(
          `SELECT *
           FROM bp3_home_visitors
           WHERE plot_id = ? AND user_id = ?`,
          [plotId, userId],
        ),
      );
    },
    set({ plotId, userId, listType, grantedBy, expiresAt = null }) {
      const currentTime = timestamp();

      run(
        `INSERT INTO bp3_home_visitors (
          plot_id,
          user_id,
          list_type,
          granted_by,
          expires_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(plot_id, user_id) DO UPDATE SET
          list_type = excluded.list_type,
          granted_by = excluded.granted_by,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at`,
        [
          plotId,
          userId,
          listType,
          grantedBy,
          expiresAt,
          currentTime,
          currentTime,
        ],
      );

      return visitors.get(plotId, userId);
    },
    remove(plotId, userId) {
      run(
        `DELETE FROM bp3_home_visitors
         WHERE plot_id = ? AND user_id = ?`,
        [plotId, userId],
      );
    },
  };

  const accessRequests = {
    create({ plotId, requester, message = null }) {
      const id = `req-${Date.now()}-${createOpaqueToken(6)}`;
      const currentTime = timestamp();

      run(
        `INSERT INTO bp3_home_access_requests (
          id,
          plot_id,
          requester_user_id,
          requester_username,
          requester_display_name,
          message,
          status,
          requested_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [
          id,
          plotId,
          requester.id,
          requester.username,
          requester.displayName || requester.username,
          message,
          currentTime,
        ],
      );

      return accessRequests.get(id);
    },
    get(id) {
      return mapRequest(
        get('SELECT * FROM bp3_home_access_requests WHERE id = ?', [id]),
      );
    },
    listByPlot(plotId, status) {
      const parameters = [plotId];
      const statusClause = status ? 'AND status = ?' : '';

      if (status) {
        parameters.push(status);
      }

      return all(
        `SELECT *
         FROM bp3_home_access_requests
         WHERE plot_id = ? ${statusClause}
         ORDER BY requested_at DESC`,
        parameters,
      ).map(mapRequest);
    },
    listByRequester(userId) {
      return all(
        `SELECT *
         FROM bp3_home_access_requests
         WHERE requester_user_id = ?
         ORDER BY requested_at DESC`,
        [userId],
      ).map(mapRequest);
    },
    findPending(plotId, userId) {
      return mapRequest(
        get(
          `SELECT *
           FROM bp3_home_access_requests
           WHERE plot_id = ?
             AND requester_user_id = ?
             AND status = 'pending'
           ORDER BY requested_at DESC
           LIMIT 1`,
          [plotId, userId],
        ),
      );
    },
    resolve({ id, status, resolverUserId }) {
      run(
        `UPDATE bp3_home_access_requests
         SET status = ?,
             resolver_user_id = ?,
             resolved_at = ?
         WHERE id = ?`,
        [status, resolverUserId, timestamp(), id],
      );

      return accessRequests.get(id);
    },
  };

  const accessGrants = {
    create({
      plotId,
      userId,
      grantType,
      token = null,
      expiresAt = null,
      maxUses = 1,
      createdBy,
    }) {
      const id = `grant-${Date.now()}-${createOpaqueToken(6)}`;
      const currentTime = timestamp();

      run(
        `INSERT INTO bp3_home_access_grants (
          id,
          plot_id,
          user_id,
          grant_type,
          token_hash,
          expires_at,
          max_uses,
          used_count,
          created_by,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [
          id,
          plotId,
          userId,
          grantType,
          token ? hashToken(token) : null,
          expiresAt,
          maxUses,
          createdBy,
          currentTime,
          currentTime,
        ],
      );

      return accessGrants.get(id);
    },
    get(id) {
      return mapGrant(
        get('SELECT * FROM bp3_home_access_grants WHERE id = ?', [id]),
      );
    },
    getByToken(token) {
      return mapGrant(
        get(
          `SELECT *
           FROM bp3_home_access_grants
           WHERE token_hash = ?`,
          [hashToken(token)],
        ),
      );
    },
    findActive(plotId, userId) {
      return mapGrant(
        get(
          `SELECT *
           FROM bp3_home_access_grants
           WHERE plot_id = ?
             AND user_id = ?
             AND revoked_at IS NULL
             AND used_count < max_uses
             AND (
               expires_at IS NULL OR expires_at > ?
             )
           ORDER BY created_at DESC
           LIMIT 1`,
          [plotId, userId, timestamp()],
        ),
      );
    },
    listByPlot(plotId) {
      return all(
        `SELECT *
         FROM bp3_home_access_grants
         WHERE plot_id = ?
         ORDER BY created_at DESC`,
        [plotId],
      ).map(mapGrant);
    },
    consume(id) {
      run(
        `UPDATE bp3_home_access_grants
         SET used_count = used_count + 1,
             updated_at = ?
         WHERE id = ?`,
        [timestamp(), id],
      );

      return accessGrants.get(id);
    },
    revoke(id) {
      run(
        `UPDATE bp3_home_access_grants
         SET revoked_at = ?,
             updated_at = ?
         WHERE id = ?`,
        [timestamp(), timestamp(), id],
      );

      return accessGrants.get(id);
    },
    revokeForUser(plotId, userId) {
      run(
        `UPDATE bp3_home_access_grants
         SET revoked_at = ?,
             updated_at = ?
         WHERE plot_id = ?
           AND user_id = ?
           AND revoked_at IS NULL`,
        [timestamp(), timestamp(), plotId, userId],
      );
    },
  };

  const visitLogs = {
    record({
      plotId,
      userId,
      username,
      action,
      result,
      reason = null,
      details = {},
    }) {
      run(
        `INSERT INTO bp3_home_visit_logs (
          plot_id,
          user_id,
          username,
          action,
          result,
          reason,
          details_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          plotId,
          userId,
          username,
          action,
          result,
          reason,
          JSON.stringify(details),
          timestamp(),
        ],
      );
    },
    list(plotId, limit = 100) {
      return all(
        `SELECT *
         FROM bp3_home_visit_logs
         WHERE plot_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [plotId, limit],
      ).map(mapVisitLog);
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
        `INSERT INTO bp3_audit_logs (
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
    accessGrants,
    accessRequests,
    accessRules,
    auditLogs,
    plotOwners,
    transaction,
    visitLogs,
    visitors,
    voiceBlacklist,
    voiceChannels,
    voiceParticipants,
  });
};
