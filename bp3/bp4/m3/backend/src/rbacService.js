import {
  Bp4ForbiddenError,
  Bp4ValidationError,
} from '../../../m1/backend/src/errors.js';

const PHASE5_ROLE_MAP = {
  admin: 'admin',
  editor: 'operator',
  viewer: 'viewer',
};

export const createRbacService = ({ repositories }) => {
  const effectiveRole = (user) =>
    repositories.roleGrants.get(user.id)?.opsRole ||
    PHASE5_ROLE_MAP[user.role] ||
    'viewer';

  const requireRole = (user, roles) => {
    const role = effectiveRole(user);

    if (!roles.includes(role)) {
      throw new Bp4ForbiddenError('Operation role is not allowed');
    }

    return role;
  };

  const listAccounts = (user) => {
    requireRole(user, ['admin']);
    const grants = repositories.roleGrants.list();

    return [
      {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        phase5Role: user.role,
        opsRole: effectiveRole(user),
        source: 'session',
      },
      ...grants.map((grant) => ({
        ...grant,
        source: 'grant',
      })),
    ];
  };

  const setRole = ({ user, userId, opsRole }) => {
    requireRole(user, ['admin']);

    if (!['viewer', 'operator', 'admin'].includes(opsRole)) {
      throw new Bp4ValidationError('opsRole must be viewer, operator or admin');
    }

    const grant = repositories.roleGrants.set({
      userId,
      opsRole,
      grantedBy: user.id,
    });

    repositories.audit.record({
      actor: user,
      action: 'm3.account.role_updated',
      resourceType: 'account',
      resourceId: String(userId),
      result: 'success',
      details: { opsRole },
    });

    return grant;
  };

  return Object.freeze({
    effectiveRole,
    listAccounts,
    requireRole,
    setRole,
  });
};
