import { DatabaseSync } from 'node:sqlite';
import { Bp4ValidationError } from '../errors.js';

export const createSqliteSource = ({ databasePath }) => {
  const database = new DatabaseSync(databasePath);

  const tableExists = (tableName) =>
    Boolean(
      database
        .prepare(
          `SELECT 1 AS present
           FROM sqlite_master
           WHERE type = 'table' AND name = ?`,
        )
        .get(tableName),
    );

  const columns = (tableName) => {
    if (!tableExists(tableName)) {
      throw new Bp4ValidationError(
        `SQLite source table is missing: ${tableName}`,
      );
    }

    return database
      .prepare(`PRAGMA table_info(${tableName})`)
      .all()
      .map((column) => ({
        name: column.name,
        type: column.type || 'TEXT',
        notNull: column.notnull === 1,
        primaryKey: column.pk > 0,
      }));
  };

  const all = (tableName) => {
    if (!tableExists(tableName)) {
      throw new Bp4ValidationError(
        `SQLite source table is missing: ${tableName}`,
      );
    }

    return database.prepare(`SELECT * FROM ${tableName}`).all();
  };

  const count = (tableName) => {
    if (!tableExists(tableName)) {
      return 0;
    }

    return Number(
      database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get()
        .count,
    );
  };

  return Object.freeze({
    all,
    close() {
      database.close();
    },
    columns,
    count,
    databasePath,
    tableExists,
  });
};
