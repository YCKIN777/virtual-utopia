const timestamp = () => new Date().toISOString();

const parseJson = (value, fallback = {}) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const mapHome = (row, friends = []) =>
  row
    ? {
        plotId: row.plot_id,
        ownerUserId:
          row.owner_user_id === null ? null : Number(row.owner_user_id),
        ownerUsername: row.owner_username,
        accessMode: row.access_mode,
        version: Number(row.version),
        friendUserIds: friends,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;

export const createModuleARepositories = (database) => {
  const all = (sql, parameters = []) =>
    database.prepare(sql).all(...parameters);
  const get = (sql, parameters = []) =>
    database.prepare(sql).get(...parameters);
  const run = (sql, parameters = []) =>
    database.prepare(sql).run(...parameters);

  const users = {
    upsert(user) {
      const currentTime = timestamp();

      run(
        `INSERT INTO bp4_module_a_users (
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
          currentTime,
        ],
      );

      return get(
        `SELECT *
         FROM bp4_module_a_users
         WHERE user_id = ?`,
        [user.id],
      );
    },
    list() {
      return all(
        `SELECT *
         FROM bp4_module_a_users
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

  const friends = {
    list(plotId) {
      return all(
        `SELECT friend_user_id
         FROM bp4_module_a_friends
         WHERE plot_id = ?
         ORDER BY friend_user_id ASC`,
        [plotId],
      ).map((row) => Number(row.friend_user_id));
    },
  };

  const homes = {
    ensure(plotId) {
      const currentTime = timestamp();

      run(
        `INSERT INTO bp4_module_a_homes (
          plot_id,
          owner_user_id,
          owner_username,
          access_mode,
          version,
          created_at,
          updated_at
        ) VALUES (?, NULL, NULL, 'private', 1, ?, ?)
        ON CONFLICT(plot_id) DO NOTHING`,
        [plotId, currentTime, currentTime],
      );

      return homes.get(plotId);
    },
    get(plotId) {
      return mapHome(
        get(
          `SELECT *
           FROM bp4_module_a_homes
           WHERE plot_id = ?`,
          [plotId],
        ),
        friends.list(plotId),
      );
    },
    list() {
      return all(
        `SELECT *
         FROM bp4_module_a_homes
         ORDER BY plot_id ASC`,
      ).map((row) => mapHome(row, friends.list(row.plot_id)));
    },
    updateOwner({ plotId, ownerUserId, ownerUsername }) {
      const current = homes.ensure(plotId);
      const currentTime = timestamp();
      const version = current.version + 1;

      run(
        `UPDATE bp4_module_a_homes
         SET owner_user_id = ?,
             owner_username = ?,
             version = ?,
             updated_at = ?
         WHERE plot_id = ?`,
        [ownerUserId, ownerUsername, version, currentTime, plotId],
      );

      return homes.get(plotId);
    },
    updateAccess({ plotId, accessMode, friendUserIds }) {
      const current = homes.ensure(plotId);
      const currentTime = timestamp();
      const version = current.version + 1;

      database.exec('BEGIN IMMEDIATE');
      try {
        run(
          `UPDATE bp4_module_a_homes
           SET access_mode = ?,
               version = ?,
               updated_at = ?
           WHERE plot_id = ?`,
          [accessMode, version, currentTime, plotId],
        );
        run(
          `DELETE FROM bp4_module_a_friends
           WHERE plot_id = ?`,
          [plotId],
        );
        friendUserIds.forEach((friendUserId) => {
          run(
            `INSERT INTO bp4_module_a_friends (
              plot_id,
              friend_user_id,
              created_at
            ) VALUES (?, ?, ?)`,
            [plotId, friendUserId, currentTime],
          );
        });
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }

      return homes.get(plotId);
    },
    summary() {
      return all(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN owner_user_id IS NULL THEN 1 ELSE 0 END)
             AS unassigned,
           SUM(CASE WHEN access_mode = 'private' THEN 1 ELSE 0 END)
             AS private_count,
           SUM(CASE WHEN access_mode = 'friends' THEN 1 ELSE 0 END)
             AS friends_count,
           SUM(CASE WHEN access_mode = 'public' THEN 1 ELSE 0 END)
             AS public_count
         FROM bp4_module_a_homes`,
      )[0];
    },
  };

  const permissionEvents = {
    append({
      plotId,
      actorUserId,
      eventType,
      mode,
      ownerUserId,
      payload,
      version,
    }) {
      run(
        `INSERT INTO bp4_module_a_permission_events (
          plot_id,
          actor_user_id,
          event_type,
          mode,
          owner_user_id,
          payload_json,
          version,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          plotId,
          actorUserId,
          eventType,
          mode,
          ownerUserId,
          JSON.stringify(payload),
          version,
          timestamp(),
        ],
      );

      return get(
        `SELECT *
         FROM bp4_module_a_permission_events
         WHERE id = last_insert_rowid()`,
      );
    },
    list(plotId = null, limit = 100) {
      const rows = plotId
        ? all(
            `SELECT *
             FROM bp4_module_a_permission_events
             WHERE plot_id = ?
             ORDER BY id DESC
             LIMIT ?`,
            [plotId, limit],
          )
        : all(
            `SELECT *
             FROM bp4_module_a_permission_events
             ORDER BY id DESC
             LIMIT ?`,
            [limit],
          );

      return rows.map((row) => ({
        id: Number(row.id),
        plotId: row.plot_id,
        actorUserId: row.actor_user_id,
        eventType: row.event_type,
        mode: row.mode,
        ownerUserId: row.owner_user_id,
        payload: parseJson(row.payload_json),
        version: Number(row.version),
        createdAt: row.created_at,
      }));
    },
  };

  const audit = {
    record({ actor, action, resourceType, resourceId, result, details = {} }) {
      run(
        `INSERT INTO bp4_module_a_audit_logs (
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
         FROM bp4_module_a_audit_logs
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
    events: permissionEvents,
    friends,
    homes,
    users,
  });
};
