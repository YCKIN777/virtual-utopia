import {
  Bp4ForbiddenError,
  Bp4ValidationError,
} from '../../../m1/backend/src/errors.js';
import { ModuleBDependencyError } from './errors.js';

const parsePositiveInteger = (value, fieldName) => {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    throw new Bp4ValidationError(`${fieldName} must be a positive integer`);
  }

  return number;
};

const directChannelId = (firstUserId, secondUserId) => {
  const [lower, upper] = [
    parsePositiveInteger(firstUserId, 'userId'),
    parsePositiveInteger(secondUserId, 'targetUserId'),
  ].sort((left, right) => left - right);

  return `dm-${lower}-${upper}`;
};

const parseDirectChannelId = (channelId) => {
  const match = /^dm-(\d+)-(\d+)$/.exec(channelId);

  if (!match) {
    throw new Bp4ValidationError('Direct channel ID must use dm-userA-userB');
  }

  return [
    parsePositiveInteger(match[1], 'userId'),
    parsePositiveInteger(match[2], 'userId'),
  ];
};

export const createChannelAccessService = ({
  moduleABaseUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = 4000,
}) => {
  const normalize = ({ user, channel }) => {
    if (typeof channel === 'string') {
      if (channel === 'world' || channel === 'world-main') {
        return {
          type: 'world',
          id: 'world-main',
        };
      }

      if (channel.startsWith('home-')) {
        return {
          type: 'home',
          id: channel,
          plotId: channel.slice(5),
        };
      }

      if (channel.startsWith('dm-')) {
        return {
          type: 'direct',
          id: channel,
          participantIds: parseDirectChannelId(channel),
        };
      }

      throw new Bp4ValidationError('channel must be world, home-* or dm-*');
    }

    if (channel?.type === 'world') {
      return {
        type: 'world',
        id: 'world-main',
      };
    }

    if (channel?.type === 'home') {
      const plotId =
        channel.plotId ||
        (typeof channel.id === 'string' && channel.id.startsWith('home-')
          ? channel.id.slice(5)
          : channel.id);

      if (typeof plotId !== 'string' || !/^plot-\d+$/.test(plotId)) {
        throw new Bp4ValidationError('Home channel plotId is invalid');
      }

      return {
        type: 'home',
        id: `home-${plotId}`,
        plotId,
      };
    }

    if (channel?.type === 'direct') {
      if (channel.targetUserId) {
        return {
          type: 'direct',
          id: directChannelId(user.id, channel.targetUserId),
          participantIds: [
            user.id,
            parsePositiveInteger(channel.targetUserId, 'targetUserId'),
          ].sort((left, right) => left - right),
        };
      }

      const id = channel.id;

      return {
        type: 'direct',
        id,
        participantIds: parseDirectChannelId(id),
      };
    }

    throw new Bp4ValidationError('channel.type must be world, home or direct');
  };

  const authorizeHome = async ({ user, plotId, authorization }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(
        `${moduleABaseUrl}/api/bp4/module-a/homes/${encodeURIComponent(
          plotId,
        )}/my-access?action=view`,
        {
          headers: {
            Authorization: authorization,
          },
          signal: controller.signal,
        },
      );
      const payload = await response.json().catch(() => null);

      if (response.ok && payload?.allowed === true) {
        return;
      }

      if (
        response.status === 401 ||
        response.status === 403 ||
        response.status === 404
      ) {
        throw new Bp4ForbiddenError(
          'Home channel is not available for this user',
        );
      }

      throw new ModuleBDependencyError(
        'Home access service returned an invalid response',
      );
    } catch (error) {
      if (
        error instanceof Bp4ForbiddenError ||
        error instanceof ModuleBDependencyError
      ) {
        throw error;
      }

      throw new ModuleBDependencyError(
        controller.signal.aborted
          ? 'Home access service timeout'
          : 'Home access service unavailable',
      );
    } finally {
      clearTimeout(timeout);
    }
  };

  const authorize = async ({ user, authorization, channel }) => {
    const normalized = normalize({ user, channel });

    if (normalized.type === 'home' && !authorization) {
      throw new Bp4ForbiddenError('Home channel authorization is unavailable');
    }

    if (normalized.type === 'home') {
      await authorizeHome({
        user,
        plotId: normalized.plotId,
        authorization,
      });
    }

    if (
      normalized.type === 'direct' &&
      !normalized.participantIds.includes(user.id)
    ) {
      throw new Bp4ForbiddenError(
        'Direct channel is limited to its participants',
      );
    }

    return normalized;
  };

  return Object.freeze({
    authorize,
    normalize,
  });
};
