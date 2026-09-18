const timestamp = () => new Date().toISOString();

const parseJson = (value, fallback = []) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const mapLayout = (row) =>
  row
    ? {
        plotId: row.plot_id,
        ownerUserId: row.owner_user_id,
        items: parseJson(row.layout_json, []),
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;

const mapEvent = (row) => ({
  id: row.id,
  plotId: row.plot_id,
  actorUserId: row.actor_user_id,
  eventType: row.event_type,
  payload: parseJson(row.payload_json, {}),
  sequence: row.sequence,
  createdAt: row.created_at,
});

export const createM5Repositories = (database) => {
  const all = (sql, parameters = []) =>
    database.prepare(sql).all(...parameters);
  const get = (sql, parameters = []) =>
    database.prepare(sql).get(...parameters);
  const run = (sql, parameters = []) =>
    database.prepare(sql).run(...parameters);

  const layouts = {
    get(plotId) {
      return mapLayout(
        get(
          `SELECT *
           FROM bp4_m5_home_layouts
           WHERE plot_id = ?`,
          [plotId],
        ),
      );
    },
    list() {
      return all(
        `SELECT *
         FROM bp4_m5_home_layouts
         ORDER BY plot_id ASC`,
      ).map(mapLayout);
    },
    upsert({ plotId, ownerUserId, items }) {
      const current = layouts.get(plotId);
      const currentTime = timestamp();
      const version = (current?.version || 0) + 1;

      run(
        `INSERT INTO bp4_m5_home_layouts (
          plot_id,
          owner_user_id,
          layout_json,
          version,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(plot_id) DO UPDATE SET
          owner_user_id = excluded.owner_user_id,
          layout_json = excluded.layout_json,
          version = excluded.version,
          updated_at = excluded.updated_at`,
        [
          plotId,
          ownerUserId,
          JSON.stringify(items),
          version,
          current?.createdAt || currentTime,
          currentTime,
        ],
      );

      return layouts.get(plotId);
    },
  };

  const events = {
    append({ plotId, actorUserId, eventType, payload = {} }) {
      const row = get(
        `SELECT COALESCE(MAX(sequence), 0) AS sequence
         FROM bp4_m5_home_events
         WHERE plot_id = ?`,
        [plotId],
      );
      const sequence = Number(row.sequence || 0) + 1;

      run(
        `INSERT INTO bp4_m5_home_events (
          plot_id,
          actor_user_id,
          event_type,
          payload_json,
          sequence,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          plotId,
          actorUserId,
          eventType,
          JSON.stringify(payload),
          sequence,
          timestamp(),
        ],
      );

      return {
        plotId,
        actorUserId,
        eventType,
        payload,
        sequence,
      };
    },
    list(plotId, afterSequence = 0, limit = 200) {
      return all(
        `SELECT *
         FROM bp4_m5_home_events
         WHERE plot_id = ?
           AND sequence > ?
         ORDER BY sequence ASC
         LIMIT ?`,
        [plotId, afterSequence, limit],
      ).map(mapEvent);
    },
  };

  const audit = {
    record({ actor, action, resourceType, resourceId, result, details = {} }) {
      run(
        `INSERT INTO bp4_m5_audit_logs (
          actor_user_id,
          action,
          resource_type,
          resource_id,
          result,
          details_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          actor?.id || null,
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
    audit,
    events,
    layouts,
  });
};
