/**
 * 虚拟世界状态读写模块：upsert 模式，JSON 存储场景/NPC/全局数据。
 * world_state 表：key 为唯一键（如 scene:yard / npc:ahe），payload_json 存 JSON。
 */
export const createWorldStateStore = ({ db }) => {
  const parse = (payloadJson) => {
    try {
      return JSON.parse(payloadJson);
    } catch {
      return null;
    }
  };

  const get = (key) => {
    const row = db
      .prepare(
        'SELECT key, kind, payload_json, updated_at FROM world_state WHERE key = ?',
      )
      .get(key);
    if (!row) return null;
    return {
      key: row.key,
      kind: row.kind,
      payload: parse(row.payload_json),
      updatedAt: row.updated_at,
    };
  };

  const set = ({ key, kind = 'global', payload }) => {
    const payloadJson = JSON.stringify(payload ?? {});
    const updatedAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO world_state (key, kind, payload_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         kind = excluded.kind,
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`,
    ).run(key, kind, payloadJson, updatedAt);
    return get(key);
  };

  const list = ({ kind } = {}) => {
    const rows = kind
      ? db
          .prepare(
            'SELECT key, kind, payload_json, updated_at FROM world_state WHERE kind = ? ORDER BY key',
          )
          .all(kind)
      : db
          .prepare(
            'SELECT key, kind, payload_json, updated_at FROM world_state ORDER BY key',
          )
          .all();
    return rows.map((row) => ({
      key: row.key,
      kind: row.kind,
      payload: parse(row.payload_json),
      updatedAt: row.updated_at,
    }));
  };

  return { get, set, list };
};
