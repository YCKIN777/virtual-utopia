export const createPlayerStatusService = () => {
  const players = new Map();
  let lastM1EventAt = null;

  const upsert = ({
    userId,
    username = null,
    displayName = null,
    role = null,
    status = 'online',
    actionId = null,
    emoteId = null,
    muted = false,
    speaking = false,
    worldId = 'world-main',
    lastSeenAt = new Date().toISOString(),
  }) => {
    if (!Number.isInteger(Number(userId))) {
      return;
    }

    const id = Number(userId);
    const current = players.get(id) || {};
    const next = {
      ...current,
      userId: id,
      username: username ?? current.username ?? null,
      displayName: displayName ?? current.displayName ?? null,
      role: role ?? current.role ?? null,
      status,
      actionId: actionId ?? current.actionId ?? null,
      emoteId: emoteId ?? current.emoteId ?? null,
      muted: muted ?? current.muted ?? false,
      speaking: speaking ?? current.speaking ?? false,
      worldId: worldId ?? current.worldId ?? 'world-main',
      lastSeenAt,
    };

    players.set(id, next);
    return next;
  };

  const recordEvent = (event) => {
    lastM1EventAt = new Date().toISOString();
    const data = event.data || {};

    if (event.type === 'presence.updated' && Array.isArray(data.users)) {
      data.users.forEach((user) =>
        upsert({
          userId: user.userId || user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          status: 'online',
        }),
      );
      return;
    }

    const userId = data.userId || event.actorUserId;

    if (!userId) {
      return;
    }

    if (event.type === 'avatar.state.updated') {
      upsert({
        userId,
        actionId: data.actionId,
        emoteId: data.emoteId,
      });
      return;
    }

    if (event.type === 'voice.participant.updated') {
      upsert({
        userId,
        muted: data.muted,
        speaking: data.speaking,
      });
      return;
    }

    if (event.type === 'presence.left') {
      const current = players.get(Number(userId));

      if (current) {
        players.set(Number(userId), {
          ...current,
          status: 'offline',
          lastSeenAt: new Date().toISOString(),
        });
      }
    }
  };

  const list = () =>
    [...players.values()].sort((left, right) =>
      String(right.lastSeenAt).localeCompare(String(left.lastSeenAt)),
    );

  const summary = () => ({
    total: players.size,
    online: [...players.values()].filter((player) => player.status === 'online')
      .length,
    speaking: [...players.values()].filter((player) => player.speaking).length,
    lastM1EventAt,
  });

  return Object.freeze({
    list,
    recordEvent,
    summary,
    upsert,
  });
};
