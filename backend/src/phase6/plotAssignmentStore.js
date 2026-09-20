import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const now = () => new Date().toISOString();

const mapPlot = (row) => ({
  id: row.id,
  plotNumber: row.plot_number,
  residentUserId: row.resident_user_id,
  residentUsername: row.resident_username,
  residentDisplayName: row.resident_display_name,
  customName: row.custom_name,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * 宅院绑定分配存储：1~50 固定编号，一户一宅，支持居民自定义宅院名。
 * 与访客名额模块分离，独立 SQLite 表。
 */
export const createPlotAssignmentStore = ({ databasePath = ':memory:' } = {}) => {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), {
      recursive: true,
    });
  }

  const database = new DatabaseSync(databasePath);

  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS utopia_plot_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plot_number INTEGER NOT NULL UNIQUE,
      resident_user_id INTEGER,
      resident_username TEXT,
      resident_display_name TEXT,
      custom_name TEXT,
      status TEXT NOT NULL DEFAULT 'vacant'
        CHECK (status IN ('assigned', 'vacant')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_plot_assignments_status
      ON utopia_plot_assignments(status);
  `);

  const getByPlotNumber = (plotNumber) => {
    const row = database
      .prepare('SELECT * FROM utopia_plot_assignments WHERE plot_number = ?')
      .get(plotNumber);

    return row ? mapPlot(row) : null;
  };

  const getByResidentUserId = (residentUserId) => {
    const row = database
      .prepare(
        `SELECT * FROM utopia_plot_assignments
         WHERE resident_user_id = ? AND status = 'assigned'`,
      )
      .get(residentUserId);

    return row ? mapPlot(row) : null;
  };

  const list = () =>
    database
      .prepare('SELECT * FROM utopia_plot_assignments ORDER BY plot_number ASC')
      .all()
      .map(mapPlot);

  const ensurePlots = () => {
    const insert = database.prepare(
      `INSERT INTO utopia_plot_assignments (
        plot_number, status, created_at, updated_at
      ) VALUES (?, 'vacant', ?, ?)`,
    );
    const timestamp = now();

    for (let number = 1; number <= 50; number += 1) {
      if (!getByPlotNumber(number)) {
        insert.run(number, timestamp, timestamp);
      }
    }
  };

  ensurePlots();

  const assignPlot = ({
    plotNumber,
    residentUserId,
    residentUsername,
    residentDisplayName,
    customName,
  }) => {
    const current = getByPlotNumber(plotNumber);

    if (!current) {
      const error = new Error('宅院编号必须为 1~50');
      error.code = 'PLOT_NOT_FOUND';
      throw error;
    }

    const existingOwner = getByResidentUserId(residentUserId);
    if (existingOwner && existingOwner.plotNumber !== plotNumber) {
      const error = new Error('该居民已绑定其他宅院，一户只能对应一套宅院');
      error.code = 'RESIDENT_ALREADY_BOUND';
      throw error;
    }

    if (
      current.status === 'assigned' &&
      current.residentUserId !== residentUserId
    ) {
      const error = new Error('该宅院已分配给其他居民');
      error.code = 'PLOT_ALREADY_ASSIGNED';
      throw error;
    }

    database
      .prepare(
        `UPDATE utopia_plot_assignments
         SET resident_user_id = ?,
             resident_username = ?,
             resident_display_name = ?,
             custom_name = ?,
             status = 'assigned',
             updated_at = ?
         WHERE plot_number = ?`,
      )
      .run(
        residentUserId,
        residentUsername,
        residentDisplayName ?? null,
        customName ?? null,
        now(),
        plotNumber,
      );

    return getByPlotNumber(plotNumber);
  };

  const revokePlot = (plotNumber) => {
    const current = getByPlotNumber(plotNumber);

    if (!current) {
      return null;
    }

    database
      .prepare(
        `UPDATE utopia_plot_assignments
         SET resident_user_id = NULL,
             resident_username = NULL,
             resident_display_name = NULL,
             custom_name = NULL,
             status = 'vacant',
             updated_at = ?
         WHERE plot_number = ?`,
      )
      .run(now(), plotNumber);

    return getByPlotNumber(plotNumber);
  };

  const renamePlot = (plotNumber, customName) => {
    const current = getByPlotNumber(plotNumber);

    if (!current) {
      return null;
    }

    database
      .prepare(
        `UPDATE utopia_plot_assignments
         SET custom_name = ?, updated_at = ?
         WHERE plot_number = ?`,
      )
      .run(customName ?? null, now(), plotNumber);

    return getByPlotNumber(plotNumber);
  };

  const getStats = () => {
    const rows = list();
    return {
      total: rows.length,
      assigned: rows.filter((row) => row.status === 'assigned').length,
      vacant: rows.filter((row) => row.status === 'vacant').length,
    };
  };

  return Object.freeze({
    assignPlot,
    revokePlot,
    renamePlot,
    list,
    getStats,
    close() {
      database.close();
    },
  });
};
