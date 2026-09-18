const timestamp = () => new Date().toISOString();

const parseJson = (value, fallback = {}) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const mapTemplate = (row) =>
  row
    ? {
        id: row.id,
        templateType: row.template_type,
        name: row.name,
        description: row.description,
        version: row.version,
        status: row.status,
        payload: parseJson(row.payload_json),
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        publishedAt: row.published_at,
      }
    : null;

export const createM4Repositories = (database) => {
  const all = (sql, parameters = []) =>
    database.prepare(sql).all(...parameters);
  const get = (sql, parameters = []) =>
    database.prepare(sql).get(...parameters);
  const run = (sql, parameters = []) =>
    database.prepare(sql).run(...parameters);

  const templates = {
    create({
      id,
      templateType,
      name,
      description,
      version = '1.0.0',
      payload = {},
      createdBy,
    }) {
      const currentTime = timestamp();

      run(
        `INSERT INTO bp4_m4_content_templates (
          id,
          template_type,
          name,
          description,
          version,
          status,
          payload_json,
          created_by,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
        [
          id,
          templateType,
          name,
          description,
          version,
          JSON.stringify(payload),
          createdBy,
          currentTime,
          currentTime,
        ],
      );

      return templates.get(id);
    },
    get(id) {
      return mapTemplate(
        get(
          `SELECT *
           FROM bp4_m4_content_templates
           WHERE id = ?`,
          [id],
        ),
      );
    },
    list({ templateType = null, status = null } = {}) {
      const clauses = [];
      const parameters = [];

      if (templateType) {
        clauses.push('template_type = ?');
        parameters.push(templateType);
      }

      if (status) {
        clauses.push('status = ?');
        parameters.push(status);
      }

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

      return all(
        `SELECT *
         FROM bp4_m4_content_templates
         ${where}
         ORDER BY updated_at DESC`,
        parameters,
      ).map(mapTemplate);
    },
    update(id, fields) {
      const current = templates.get(id);

      if (!current) {
        return null;
      }

      run(
        `UPDATE bp4_m4_content_templates
         SET name = ?,
             description = ?,
             version = ?,
             status = ?,
             payload_json = ?,
             published_at = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          fields.name ?? current.name,
          fields.description ?? current.description,
          fields.version ?? current.version,
          fields.status ?? current.status,
          JSON.stringify(fields.payload ?? current.payload),
          fields.status === 'published' ? timestamp() : current.publishedAt,
          timestamp(),
          id,
        ],
      );

      return templates.get(id);
    },
    stats() {
      return all(
        `SELECT
           template_type,
           status,
           COUNT(*) AS count
         FROM bp4_m4_content_templates
         GROUP BY template_type, status
         ORDER BY template_type, status`,
      ).map((row) => ({
        templateType: row.template_type,
        status: row.status,
        count: row.count,
      }));
    },
  };

  const audit = {
    record({ actor, action, templateId, result, details = {} }) {
      run(
        `INSERT INTO bp4_m4_template_audit (
          actor_user_id,
          action,
          template_id,
          result,
          details_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          actor?.id || null,
          action,
          templateId,
          result,
          JSON.stringify(details),
          timestamp(),
        ],
      );
    },
    list(limit = 100) {
      return all(
        `SELECT *
         FROM bp4_m4_template_audit
         ORDER BY created_at DESC
         LIMIT ?`,
        [limit],
      ).map((row) => ({
        id: row.id,
        actorUserId: row.actor_user_id,
        action: row.action,
        templateId: row.template_id,
        result: row.result,
        details: parseJson(row.details_json),
        createdAt: row.created_at,
      }));
    },
  };

  return Object.freeze({
    audit,
    templates,
  });
};
