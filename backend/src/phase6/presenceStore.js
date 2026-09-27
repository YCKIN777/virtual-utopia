const STALE_AFTER_MS = 12000;
const CLEANUP_INTERVAL_MS = 4000;
const avatarColors = [
  '#d76d5e',
  '#4f8f7b',
  '#d09a45',
  '#6478b8',
  '#9b6cbb',
  '#5aa0b5',
];

const getAvatarColor = (userId) => {
  const numericId = Number(userId) || 0;
  return avatarColors[Math.abs(numericId) % avatarColors.length];
};

export const createPresenceStore = ({ now = Date.now } = {}) => {
  const users = new Map();

  const removeStale = () => {
    const currentTime = now();

    for (const [userId, user] of users) {
      if (currentTime - user.lastSeen > STALE_AFTER_MS) {
        users.delete(userId);
      }
    }
  };

  const cleanupTimer = setInterval(removeStale, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref?.();

  const list = () => {
    removeStale();

    return [...users.values()]
      .map(({ lastSeen, ...user }) => user)
      .sort((left, right) =>
        left.displayName.localeCompare(right.displayName, 'zh-CN'),
      );
  };

  const update = ({ user, position }) => {
    const currentTime = now();
    const record = {
      id: `phase5-${user.id}`,
      userId: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      role: user.role,
      color: getAvatarColor(user.id),
      appearance: position.appearance || null,
      x: position.x,
      y: position.y,
      z: position.z,
      rotation: position.rotation,
      animationState: position.animationState,
      // P5.4-13：一次性协作动作透传（如 wave 打招呼），下次心跳无 action 自动清空。
      action: position.action || null,
      updatedAt: new Date(currentTime).toISOString(),
      lastSeen: currentTime,
    };

    users.set(record.id, record);
    return record;
  };

  const remove = (userId) => {
    users.delete(`phase5-${userId}`);
  };

  const dispose = () => {
    clearInterval(cleanupTimer);
    users.clear();
  };

  return Object.freeze({
    dispose,
    list,
    remove,
    update,
  });
};
