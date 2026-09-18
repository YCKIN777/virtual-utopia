import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Bp4ForbiddenError } from '../../../m1/backend/src/errors.js';

export const createOwnershipResolver = ({ bp3DatabasePath }) => {
  let database = null;

  if (existsSync(bp3DatabasePath)) {
    database = new DatabaseSync(bp3DatabasePath, {
      readOnly: true,
    });
  }

  const getOwnerUserId = (plotId) => {
    if (!database) {
      return null;
    }

    const row = database
      .prepare(
        `SELECT user_id
         FROM bp3_plot_owners
         WHERE plot_id = ?`,
      )
      .get(plotId);

    return row ? Number(row.user_id) : null;
  };

  const requireOwner = (user, plotId) => {
    const ownerUserId = getOwnerUserId(plotId);

    if (user.role === 'viewer') {
      throw new Bp4ForbiddenError('Viewer accounts cannot modify home layouts');
    }

    if (user.role !== 'admin' && (!ownerUserId || ownerUserId !== user.id)) {
      throw new Bp4ForbiddenError('Only the plot owner can modify this home');
    }

    return ownerUserId || user.id;
  };

  return Object.freeze({
    getOwnerUserId,
    requireOwner,
    close() {
      database?.close();
    },
  });
};
