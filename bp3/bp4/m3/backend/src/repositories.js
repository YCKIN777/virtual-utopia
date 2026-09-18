const timestamp = () => new Date().toISOString();

const parseJson = (value, fallback = {}) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const mapRoleGrant = (row) =>
  row
    ? {
        userId: row.user_id,
        opsRole: row.ops_role,
        grantedBy: row.granted_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;

const mapWorld = (row) =>
  row
    ? {
        id: row.id,
        name: row.name,
        region: row.region,
        status: row.status,
        capacity: row.capacity,
        currentPlayers: row.current_players,
        version: row.version,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;

const mapHome = (row) =>
  row
    ? {
        plotId: row.plot_id,
        worldId: row.world_id,
        ownerUserId: row.owner_user_id,
        ownerUsername: row.owner_username,
        status: row.status,
        visitMode: row.visit_mode,
        lastSeenAt: row.last_seen_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;

const mapAudit = (row) => ({
  id: row.id,
  actorUserId: row.actor_user_id,
  actorUsername: row.actor_username,
  action: row.action,
  resourceType: row.resource_type,
  resourceId: row.resource_id,
  result: row.result,
  details: parseJson(row.details_json),
  createdAt: row.created_at,
});

export const createM3Repositories = (database) => {
  const all = (sql, parameters = []) =>
    database.prepare(sql).all(...parameters);
  const get = (sql, parameters = []) =>
    database.prepare(sql).get(...parameters);
  const run = (sql, parameters = []) =>
    database.prepare(sql).run(...parameters);

  const roleGrants = {
    get(userId) {
      return mapRoleGrant(
        get(
          `SELECT *
           FROM bp4_m3_role_grants
           WHERE user_id = ?`,
          [userId],
        ),
      );
    },
    list() {
      return all(
        `SELECT *
         FROM bp4_m3_role_grants
         ORDER BY updated_at DESC`,
      ).map(mapRoleGrant);
    },
    set({ userId, opsRole, grantedBy }) {
      run(
        `INSERT INTO bp4_m3_role_grants (
          user_id,
          ops_role,
          granted_by,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          ops_role = excluded.ops_role,
          granted_by = excluded.granted_by,
          updated_at = excluded.updated_at`,
        [userId, opsRole, grantedBy, timestamp(), timestamp()],
      );

      return roleGrants.get(userId);
    },
  };

  const worlds = {
    create({
      id,
      name,
      region,
      status = 'draft',
      capacity = 100,
      version = 'BP4',
      createdBy,
    }) {
      const currentTime = timestamp();

      run(
        `INSERT INTO bp4_m3_world_instances (
          id,
          name,
          region,
          status,
          capacity,
          current_players,
          version,
          created_by,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        [
          id,
          name,
          region,
          status,
          capacity,
          version,
          createdBy,
          currentTime,
          currentTime,
        ],
      );

      return worlds.get(id);
    },
    get(id) {
      return mapWorld(
        get(
          `SELECT *
           FROM bp4_m3_world_instances
           WHERE id = ?`,
          [id],
        ),
      );
    },
    list() {
      return all(
        `SELECT *
         FROM bp4_m3_world_instances
         ORDER BY created_at ASC`,
      ).map(mapWorld);
    },
    update(id, fields) {
      const current = worlds.get(id);

      if (!current) {
        return null;
      }

      run(
        `UPDATE bp4_m3_world_instances
         SET name = ?,
             region = ?,
             status = ?,
             capacity = ?,
             current_players = ?,
             version = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          fields.name ?? current.name,
          fields.region ?? current.region,
          fields.status ?? current.status,
          fields.capacity ?? current.capacity,
          fields.currentPlayers ?? current.currentPlayers,
          fields.version ?? current.version,
          timestamp(),
          id,
        ],
      );

      return worlds.get(id);
    },
  };

  const homes = {
    create({
      plotId,
      worldId,
      ownerUserId,
      ownerUsername,
      status = 'active',
      visitMode = 'public',
    }) {
      const currentTime = timestamp();

      run(
        `INSERT INTO bp4_m3_home_instances (
          plot_id,
          world_id,
          owner_user_id,
          owner_username,
          status,
          visit_mode,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          plotId,
          worldId,
          ownerUserId,
          ownerUsername,
          status,
          visitMode,
          currentTime,
          currentTime,
        ],
      );

      return homes.get(plotId);
    },
    get(plotId) {
      return mapHome(
        get(
          `SELECT *
           FROM bp4_m3_home_instances
           WHERE plot_id = ?`,
          [plotId],
        ),
      );
    },
    list({ worldId = null } = {}) {
      if (worldId) {
        return all(
          `SELECT *
           FROM bp4_m3_home_instances
           WHERE world_id = ?
           ORDER BY plot_id ASC`,
          [worldId],
        ).map(mapHome);
      }

      return all(
        `SELECT *
         FROM bp4_m3_home_instances
         ORDER BY plot_id ASC`,
      ).map(mapHome);
    },
    update(plotId, fields) {
      const current = homes.get(plotId);

      if (!current) {
        return null;
      }

      run(
        `UPDATE bp4_m3_home_instances
         SET world_id = ?,
             owner_user_id = ?,
             owner_username = ?,
             status = ?,
             visit_mode = ?,
             last_seen_at = ?,
             updated_at = ?
         WHERE plot_id = ?`,
        [
          fields.worldId ?? current.worldId,
          fields.ownerUserId ?? current.ownerUserId,
          fields.ownerUsername ?? current.ownerUsername,
          fields.status ?? current.status,
          fields.visitMode ?? current.visitMode,
          fields.lastSeenAt === undefined
            ? current.lastSeenAt
            : fields.lastSeenAt,
          timestamp(),
          plotId,
        ],
      );

      return homes.get(plotId);
    },
  };

  const audit = {
    record({
      actor,
      action,
      resourceType,
      resourceId = null,
      result,
      details = {},
    }) {
      run(
        `INSERT INTO bp4_m3_audit_logs (
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
         FROM bp4_m3_audit_logs
         ORDER BY created_at DESC
         LIMIT ?`,
        [limit],
      ).map(mapAudit);
    },
  };

  return Object.freeze({
    audit,
    homes,
    roleGrants,
    worlds,
  });
};
