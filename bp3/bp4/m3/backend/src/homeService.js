import { Bp4ValidationError } from '../../../m1/backend/src/errors.js';
import { Bp4M3NotFoundError } from './errors.js';

export const createHomeService = ({ repositories, rbac }) => {
  const list = ({ user, worldId = null }) => {
    rbac.requireRole(user, ['viewer', 'operator', 'admin']);
    return repositories.homes.list({ worldId });
  };

  const create = ({
    user,
    plotId,
    worldId,
    ownerUserId,
    ownerUsername,
    visitMode = 'public',
  }) => {
    rbac.requireRole(user, ['operator', 'admin']);

    if (!plotId || !worldId || !ownerUserId) {
      throw new Bp4ValidationError(
        'plotId, worldId and ownerUserId are required',
      );
    }

    const home = repositories.homes.create({
      plotId,
      worldId,
      ownerUserId: Number(ownerUserId),
      ownerUsername: ownerUsername || `user-${ownerUserId}`,
      visitMode,
    });

    repositories.audit.record({
      actor: user,
      action: 'm3.home.created',
      resourceType: 'home',
      resourceId: home.plotId,
      result: 'success',
    });

    return home;
  };

  const update = ({ user, plotId, fields }) => {
    rbac.requireRole(user, ['operator', 'admin']);
    const home = repositories.homes.update(plotId, fields);

    if (!home) {
      throw new Bp4M3NotFoundError('Home instance not found');
    }

    repositories.audit.record({
      actor: user,
      action: 'm3.home.updated',
      resourceType: 'home',
      resourceId: home.plotId,
      result: 'success',
      details: fields,
    });

    return home;
  };

  return Object.freeze({
    create,
    list,
    update,
  });
};
