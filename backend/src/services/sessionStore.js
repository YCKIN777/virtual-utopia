import { randomUUID } from 'node:crypto';

const SESSION_ID_PATTERN = /^(pub|prv)_[0-9a-f-]{36}$/i;

export class SessionError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'SessionError';
    this.code = options.code || 'SESSION_ERROR';
    this.statusCode = options.statusCode || 400;
  }
}

export const createSessionStore = ({
  ttlMs = 30 * 60 * 1000,
  maxCount = 1000,
  now = Date.now,
  createId = randomUUID,
} = {}) => {
  const sessions = new Map();

  const getExpiresAt = () => now() + ttlMs;

  const cleanup = () => {
    const currentTime = now();
    let removed = 0;

    for (const [sessionId, session] of sessions) {
      if (session.expiresAt <= currentTime) {
        sessions.delete(sessionId);
        removed += 1;
      }
    }

    return removed;
  };

  const ensureCapacity = () => {
    cleanup();

    if (sessions.size < maxCount) {
      return;
    }

    const oldestSession = [...sessions.values()].sort(
      (left, right) => left.updatedAt - right.updatedAt,
    )[0];

    if (oldestSession) {
      sessions.delete(oldestSession.id);
    }
  };

  const createSession = ({ sceneId, type, ownerAgentId }) => {
    ensureCapacity();

    const prefix = type === 'private' ? 'prv' : 'pub';
    const id = `${prefix}_${createId()}`;
    const timestamp = now();
    const session = {
      id,
      sceneId,
      type,
      ownerAgentId,
      messages: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: getExpiresAt(),
    };

    sessions.set(id, session);

    return session;
  };

  const getSession = (sessionId) => {
    if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
      throw new SessionError('会话 ID 无效', {
        code: 'INVALID_SESSION_ID',
      });
    }

    cleanup();

    const session = sessions.get(sessionId);

    if (!session) {
      throw new SessionError('会话不存在或已过期', {
        code: 'SESSION_NOT_FOUND',
        statusCode: 404,
      });
    }

    return session;
  };

  const appendMessages = (sessionId, messages) => {
    const session = getSession(sessionId);
    session.messages.push(...messages);
    session.updatedAt = now();
    session.expiresAt = getExpiresAt();

    return session;
  };

  const startCleanup = (intervalMs = 5 * 60 * 1000) => {
    const timer = setInterval(cleanup, intervalMs);
    timer.unref?.();

    return () => clearInterval(timer);
  };

  return {
    createSession,
    getSession,
    appendMessages,
    cleanup,
    startCleanup,
    get size() {
      return sessions.size;
    },
  };
};
