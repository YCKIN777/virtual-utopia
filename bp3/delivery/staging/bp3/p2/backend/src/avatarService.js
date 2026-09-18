import { Bp3ValidationError } from '../../../backend/src/errors.js';

const requireText = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Bp3ValidationError(`${field} must be a non-empty string`);
  }

  return value.trim();
};

export const createAvatarService = ({ repositories }) => {
  const listCatalog = () => {
    const entries = repositories.avatar.listCatalog();

    return {
      actions: entries.filter((entry) => entry.kind === 'action'),
      emotes: entries.filter((entry) => entry.kind === 'emote'),
    };
  };

  const getState = (userId) =>
    repositories.avatar.getState(userId) || {
      userId,
      actionId: 'idle',
      emoteId: null,
      sequence: 0,
      updatedAt: null,
    };

  const listStates = (userIds = null) => {
    const states = repositories.avatar.listStates(userIds);
    const byUser = new Map(states.map((state) => [state.userId, state]));

    if (!userIds?.length) {
      return states;
    }

    return userIds.map((userId) => byUser.get(userId) || getState(userId));
  };

  const updateState = ({ user, actionId = 'idle', emoteId = null }) => {
    const normalizedActionId = requireText(actionId, 'actionId');
    const action = repositories.avatar.getCatalogEntry(normalizedActionId);

    if (!action || action.kind !== 'action') {
      throw new Bp3ValidationError('actionId is not a valid avatar action');
    }

    let normalizedEmoteId = null;

    if (emoteId !== undefined && emoteId !== null && emoteId !== '') {
      normalizedEmoteId = requireText(emoteId, 'emoteId');
      const emote = repositories.avatar.getCatalogEntry(normalizedEmoteId);

      if (!emote || emote.kind !== 'emote') {
        throw new Bp3ValidationError('emoteId is not a valid avatar emote');
      }
    }

    const state = repositories.avatar.upsertState({
      userId: user.id,
      actionId: normalizedActionId,
      emoteId: normalizedEmoteId,
    });

    repositories.auditLogs.record({
      actorUserId: user.id,
      action: 'p2.avatar.state_updated',
      resourceType: 'avatar-state',
      resourceId: String(user.id),
      result: 'success',
      details: {
        actionId: state.actionId,
        emoteId: state.emoteId,
      },
    });

    return state;
  };

  return Object.freeze({
    getState,
    listCatalog,
    listStates,
    updateState,
  });
};
