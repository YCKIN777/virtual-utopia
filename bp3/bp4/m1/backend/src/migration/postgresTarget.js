import pg from 'pg';

const { Pool } = pg;

const quoteIdentifier = (value) => `"${String(value).replaceAll('"', '""')}"`;

const mapType = (type) => {
  const normalized = String(type || '').toUpperCase();

  if (normalized.includes('INT')) {
    return 'BIGINT';
  }

  if (
    normalized.includes('REAL') ||
    normalized.includes('FLOA') ||
    normalized.includes('DOUB')
  ) {
    return 'DOUBLE PRECISION';
  }

  if (normalized.includes('BLOB')) {
    return 'BYTEA';
  }

  if (normalized.includes('BOOL')) {
    return 'BOOLEAN';
  }

  return 'TEXT';
};

export const createPostgresTarget = ({ databaseUrl }) => {
  const pool = new Pool({
    connectionString: databaseUrl,
  });
  let client = null;

  const ensureClient = async () => {
    if (!client) {
      client = await pool.connect();
    }

    return client;
  };

  const query = async (text, parameters = []) => {
    const activeClient = await ensureClient();

    return activeClient.query(text, parameters);
  };

  return Object.freeze({
    async begin() {
      await query('BEGIN');
    },
    async clearTable(tableName) {
      await query(`DELETE FROM ${quoteIdentifier(tableName)}`);
    },
    async close() {
      if (client) {
        client.release();
        client = null;
      }

      await pool.end();
    },
    async commit() {
      await query('COMMIT');
    },
    async count(tableName) {
      const result = await query(
        `SELECT COUNT(*)::int AS count
         FROM ${quoteIdentifier(tableName)}`,
      );

      return Number(result.rows[0]?.count || 0);
    },
    async ensureTable({ tableName, columns, primaryKey }) {
      const definitions = columns.map((column) => {
        const isPrimary = primaryKey.includes(column.name);
        const nullable = column.notNull || isPrimary ? ' NOT NULL' : '';

        return `${quoteIdentifier(column.name)} ${mapType(
          column.type,
        )}${nullable}`;
      });

      await query(
        `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(
          tableName,
        )} (${definitions.join(', ')})`,
      );

      if (primaryKey.length) {
        await query(
          `CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdentifier(
            `${tableName}_pk`,
          )} ON ${quoteIdentifier(tableName)} (${primaryKey
            .map(quoteIdentifier)
            .join(', ')})`,
        );
      }
    },
    async insertRows({ tableName, columns, rows }) {
      if (!rows.length) {
        return 0;
      }

      const columnSql = columns.map(quoteIdentifier).join(', ');
      const valueSql = rows
        .map(
          (_row, rowIndex) =>
            `(${columns
              .map(
                (_column, columnIndex) =>
                  `$${rowIndex * columns.length + columnIndex + 1}`,
              )
              .join(', ')})`,
        )
        .join(', ');
      const parameters = rows.flatMap((row) =>
        columns.map((column) => row[column]),
      );

      await query(
        `INSERT INTO ${quoteIdentifier(
          tableName,
        )} (${columnSql}) VALUES ${valueSql}`,
        parameters,
      );

      return rows.length;
    },
    async recordMigration({ runId, status, details, startedAt, completedAt }) {
      await query(
        `CREATE TABLE IF NOT EXISTS bp4_migration_runs (
          run_id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          started_at TEXT NOT NULL,
          completed_at TEXT,
          details JSONB NOT NULL
        )`,
      );
      await query(
        `INSERT INTO bp4_migration_runs (
          run_id,
          status,
          started_at,
          completed_at,
          details
        ) VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (run_id) DO UPDATE SET
          status = EXCLUDED.status,
          completed_at = EXCLUDED.completed_at,
          details = EXCLUDED.details`,
        [runId, status, startedAt, completedAt, JSON.stringify(details)],
      );
    },
    async rollback() {
      await query('ROLLBACK');
    },
  });
};
