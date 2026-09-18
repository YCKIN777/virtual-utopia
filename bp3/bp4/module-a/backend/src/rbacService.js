import { Bp4ForbiddenError } from '../../../m1/backend/src/errors.js';

const PHASE5_ROLE_MAP = {
  admin: 'admin',
  editor: 'operator',
  viewer: 'viewer',
};

export const createModuleARbacService = () => {
  const effectiveRole = (user) => PHASE5_ROLE_MAP[user.role] || 'viewer';

  const requireRole = (user, roles) => {
    const role = effectiveRole(user);

    if (!roles.includes(role)) {
      throw new Bp4ForbiddenError('Operation role is not allowed');
    }

    return role;
  };

  return Object.freeze({
    effectiveRole,
    requireRole,
  });
};
