import { Bp4ValidationError } from '../../../m1/backend/src/errors.js';
import { Bp4M3NotFoundError } from './errors.js';

const requireText = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Bp4ValidationError(`${field} must be a non-empty string`);
  }

  return value.trim();
};

export const createWorldService = ({ repositories, rbac }) => {
  const list = (user) => {
    rbac.requireRole(user, ['viewer', 'operator', 'admin']);
    return repositories.worlds.list();
  };

  const get = (user, worldId) => {
    rbac.requireRole(user, ['viewer', 'operator', 'admin']);
    const world = repositories.worlds.get(worldId);

    if (!world) {
      throw new Bp4M3NotFoundError('World instance not found');
    }

    return world;
  };

  const create = ({ user, id, name, region, capacity }) => {
    rbac.requireRole(user, ['operator', 'admin']);
    const world = repositories.worlds.create({
      id: requireText(id, 'id'),
      name: requireText(name, 'name'),
      region: requireText(region, 'region'),
      capacity: Number(capacity) || 100,
      createdBy: user.id,
    });

    repositories.audit.record({
      actor: user,
      action: 'm3.world.created',
      resourceType: 'world',
      resourceId: world.id,
      result: 'success',
    });

    return world;
  };

  const update = ({ user, worldId, fields }) => {
    rbac.requireRole(user, ['operator', 'admin']);
    const world = repositories.worlds.update(worldId, fields);

    if (!world) {
      throw new Bp4M3NotFoundError('World instance not found');
    }

    repositories.audit.record({
      actor: user,
      action: 'm3.world.updated',
      resourceType: 'world',
      resourceId: world.id,
      result: 'success',
      details: fields,
    });

    return world;
  };

  return Object.freeze({
    create,
    get,
    list,
    update,
  });
};
