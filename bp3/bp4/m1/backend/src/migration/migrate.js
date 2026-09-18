import { randomUUID } from 'node:crypto';
import { Bp4ConflictError, Bp4ValidationError } from '../errors.js';
import { migrationTableSpecs } from './tableSpecs.js';

const now = () => new Date().toISOString();

export const createMigrationService = ({
  source,
  target,
  batchSize = 250,
  tableSpecs = migrationTableSpecs,
  logger = console,
}) => {
  if (!source || !target) {
    throw new Bp4ValidationError(
      'Migration requires SQLite source and PostgreSQL target',
    );
  }

  const run = async () => {
    const runId = `bp4-migrate-${Date.now()}-${randomUUID()}`;
    const startedAt = now();
    const results = [];

    await target.begin();

    try {
      await target.recordMigration({
        runId,
        status: 'running',
        startedAt,
        completedAt: null,
        details: {
          source: source.databasePath,
          tables: [],
        },
      });

      for (const spec of tableSpecs) {
        if (!source.tableExists(spec.source)) {
          if (spec.required) {
            throw new Bp4ConflictError(
              `Required source table is missing: ${spec.source}`,
            );
          }

          results.push({
            source: spec.source,
            target: spec.target,
            skipped: true,
            sourceCount: 0,
            targetCount: 0,
          });
          continue;
        }

        const sourceColumns = source.columns(spec.source);
        const columns = sourceColumns.map((column) => column.name);
        const rows = source.all(spec.source);

        await target.ensureTable({
          tableName: spec.target,
          columns: sourceColumns,
          primaryKey: spec.primaryKey,
        });
        await target.clearTable(spec.target);

        for (let offset = 0; offset < rows.length; offset += batchSize) {
          await target.insertRows({
            tableName: spec.target,
            columns,
            rows: rows.slice(offset, offset + batchSize),
          });
        }

        const sourceCount = source.count(spec.source);
        const targetCount = await target.count(spec.target);

        if (sourceCount !== targetCount) {
          throw new Bp4ConflictError(
            `Migration count mismatch for ${spec.source}: ${sourceCount} != ${targetCount}`,
          );
        }

        results.push({
          source: spec.source,
          target: spec.target,
          skipped: false,
          sourceCount,
          targetCount,
        });
      }

      const completedAt = now();
      const details = {
        source: source.databasePath,
        tables: results,
      };

      await target.recordMigration({
        runId,
        status: 'completed',
        startedAt,
        completedAt,
        details,
      });
      await target.commit();

      return {
        runId,
        status: 'completed',
        startedAt,
        completedAt,
        tables: results,
      };
    } catch (error) {
      await target.rollback().catch(() => null);
      logger.error(
        JSON.stringify({
          service: 'virtual-utopia-bp4-m1',
          event: 'migration_failed',
          runId,
          message: error.message,
        }),
      );
      throw error;
    }
  };

  const validate = async () => {
    const results = [];

    for (const spec of tableSpecs) {
      if (!source.tableExists(spec.source)) {
        if (spec.required) {
          throw new Bp4ConflictError(
            `Required source table is missing: ${spec.source}`,
          );
        }

        results.push({
          source: spec.source,
          target: spec.target,
          skipped: true,
          sourceCount: 0,
          targetCount: 0,
        });
        continue;
      }

      const sourceCount = source.count(spec.source);
      const targetCount = await target.count(spec.target);

      results.push({
        source: spec.source,
        target: spec.target,
        skipped: false,
        sourceCount,
        targetCount,
        valid: sourceCount === targetCount,
      });
    }

    return {
      valid: results.every((result) => result.skipped || result.valid),
      tables: results,
    };
  };

  return Object.freeze({
    run,
    tableSpecs,
    validate,
  });
};
