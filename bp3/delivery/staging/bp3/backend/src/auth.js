import { createHash } from 'node:crypto';
import {
  Bp3ForbiddenError,
  Bp3UnauthorizedError,
  Bp3UnavailableError,
  Bp3ValidationError,
} from './errors.js';

const parseWorldSnapshot = (session) => {
  const messages = Array.isArray(session?.messages) ? session.messages : [];
  const latest = [...messages].reverse().find((message) => {
    if (message?.role !== 'system' || typeof message.content !== 'string') {
      return false;
    }

    try {
      return JSON.parse(message.content)?.kind === 'virtual-utopia-world-state';
    } catch {
      return false;
    }
  });

  if (!latest) {
    return null;
  }

  try {
    return JSON.parse(latest.content)?.snapshot || null;
  } catch {
    return null;
  }
};

const normalizeUser = (payload) => {
  const id = Number(payload?.id);

  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    typeof payload?.username !== 'string' ||
    !['admin', 'editor', 'viewer'].includes(payload?.role)
  ) {
    throw new Bp3UnauthorizedError('Phase5 returned an invalid identity');
  }

  return {
    id,
    username: payload.username,
    role: payload.role,
    displayName: payload.displayName || payload.username,
  };
};

const fallbackPlotId = (userId) => `plot-${((userId - 1) % 50) + 1}`;

export const createAuthService = ({
  config,
  repositories,
  fetchImpl = globalThis.fetch,
  cacheTtlMs = 20_000,
}) => {
  const identityCache = new Map();

  const requestJson = async (
    url,
    { authorization, timeoutMs = config.requestTimeoutMs },
  ) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        headers: authorization ? { Authorization: authorization } : {},
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);

      if (response.status === 401) {
        throw new Bp3UnauthorizedError('Phase5 login is no longer valid');
      }

      if (!response.ok) {
        throw new Bp3UnavailableError(
          `Phase5 request failed with status ${response.status}`,
        );
      }

      return payload;
    } catch (error) {
      if (
        error instanceof Bp3UnauthorizedError ||
        error instanceof Bp3UnavailableError
      ) {
        throw error;
      }

      throw new Bp3UnavailableError(
        controller.signal.aborted
          ? 'Phase5 identity request timed out'
          : 'Phase5 identity service is unavailable',
        error,
      );
    } finally {
      clearTimeout(timeout);
    }
  };

  const authenticate = async (authorization) => {
    if (
      typeof authorization !== 'string' ||
      !authorization.startsWith('Bearer ')
    ) {
      throw new Bp3UnauthorizedError();
    }

    const cacheKey = createHash('sha256').update(authorization).digest('hex');
    const cached = identityCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.user;
    }

    const payload = await requestJson(
      `${config.phase5BaseUrl}/api/phase5/auth/me`,
      { authorization },
    );
    const user = normalizeUser(payload);

    identityCache.set(cacheKey, {
      user,
      expiresAt: Date.now() + cacheTtlMs,
    });

    return user;
  };

  const readWorldPlotId = async ({ authorization, userId }) => {
    if (!config.ownerResolutionEnabled) {
      return fallbackPlotId(userId);
    }

    try {
      const payload = await requestJson(
        `${config.phase5BaseUrl}/api/phase5/sessions/${encodeURIComponent(
          `world-${userId}`,
        )}`,
        { authorization },
      );
      const snapshot = parseWorldSnapshot(payload);

      if (
        typeof snapshot?.plotId === 'string' &&
        /^plot-\d+$/.test(snapshot.plotId)
      ) {
        return snapshot.plotId;
      }
    } catch (error) {
      if (error instanceof Bp3UnauthorizedError) {
        throw error;
      }
    }

    return fallbackPlotId(userId);
  };

  const resolveOwnedPlot = async ({ authorization, user }) => {
    const existing = repositories.plotOwners.getByUser(user.id);

    if (existing) {
      return existing.plotId;
    }

    const plotId = await readWorldPlotId({
      authorization,
      userId: user.id,
    });
    const conflictingOwner = repositories.plotOwners.getByPlot(plotId);

    if (conflictingOwner && conflictingOwner.userId !== user.id) {
      const fallback = fallbackPlotId(user.id);
      repositories.plotOwners.upsert({
        plotId: fallback,
        userId: user.id,
        source: 'bp3-fallback',
      });
      return fallback;
    }

    repositories.plotOwners.upsert({
      plotId,
      userId: user.id,
      source: config.ownerResolutionEnabled
        ? 'phase5-world-state'
        : 'bp3-fallback',
    });

    return plotId;
  };

  const requireRole = (user, roles) => {
    if (!roles.includes(user?.role)) {
      throw new Bp3ForbiddenError();
    }
  };

  const requireAuthorization = (authorization) => {
    if (!authorization) {
      throw new Bp3UnauthorizedError();
    }

    return authorization;
  };

  const validatePlotId = (plotId) => {
    if (typeof plotId !== 'string' || !/^plot-\d+$/.test(plotId)) {
      throw new Bp3ValidationError('plotId must use the plot-<number> format');
    }

    return plotId;
  };

  return Object.freeze({
    authenticate,
    requireAuthorization,
    requireRole,
    resolveOwnedPlot,
    validatePlotId,
  });
};
