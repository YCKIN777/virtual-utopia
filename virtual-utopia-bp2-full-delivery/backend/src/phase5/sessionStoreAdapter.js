import { randomUUID } from 'node:crypto';
import { createSessionStore as createMemorySessionStore } from '../services/sessionStore.js';
import { Phase5Error, Phase5NotFoundError } from './errors.js';

const SESSION_ID_PATTERN = /^(pub|prv)_[0-9a-f-]{36}$/i;

const requestJson = async ({
  baseUrl,
  path,
  method,
  serviceToken,
  body,
  fetchImpl,
}) => {
  const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Phase5-Service-Token': serviceToken,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Phase5Error(
      `Phase5 request failed with status ${response.status}: ${errorBody}`,
      {
        code: 'PHASE5_HTTP_ERROR',
        statusCode: response.status,
      },
    );
  }

  return response.json();
};

export const createPersistentSessionStore = async ({
  baseUrl,
  serviceToken,
  ttlMs = 30 * 60 * 1000,
  maxCount = 1000,
  fetchImpl = globalThis.fetch,
  now = Date.now,
}) => {
  const sessions = new Map();
  let cleanupTimer;
  let persistenceError;
  let writeQueue = Promise.resolve();

  const enqueue = (operation) => {
    writeQueue = writeQueue.then(operation).catch((error) => {
      persistenceError = error;
    });
  };

  const assertHealthy = () => {
    if (persistenceError) {
      throw persistenceError;
    }
  };

  const persistSession = (session) =>
    requestJson({
      baseUrl,
      path: `/api/phase5/sessions/${encodeURIComponent(session.id)}`,
      method: 'PUT',
      serviceToken,
      fetchImpl,
      body: {
        sessionType: session.type,
        title: session.title,
        messages: session.messages,
        status: session.status,
        expiresAt: session.expiresAt,
      },
    });

  const initial = await requestJson({
    baseUrl,
    path: '/api/phase5/sessions?all=true&limit=500',
    method: 'GET',
    serviceToken,
    fetchImpl,
  });

  for (const session of initial.sessions || []) {
    sessions.set(session.id, {
      ...session,
      type: session.sessionType,
    });
  }

  const getExpiresAt = () => now() + ttlMs;

  const cleanup = () => {
    const currentTime = now();

    for (const [sessionId, session] of sessions) {
      if (Date.parse(session.expiresAt) <= currentTime) {
        sessions.delete(sessionId);
      }
    }
  };

  const ensureCapacity = () => {
    cleanup();

    if (sessions.size < maxCount) {
      return;
    }

    const oldest = [...sessions.values()].sort(
      (left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt),
    )[0];

    if (oldest) {
      sessions.delete(oldest.id);
    }
  };

  const store = {
    createSession({ sceneId, type, ownerAgentId }) {
      assertHealthy();
      ensureCapacity();

      const timestamp = new Date(now()).toISOString();
      const id = `${type === 'private' ? 'prv' : 'pub'}_${randomUUID()}`;
      const session = {
        id,
        userId: null,
        sceneId,
        type,
        ownerAgentId,
        title: null,
        messages: [],
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
        expiresAt: new Date(getExpiresAt()).toISOString(),
      };

      sessions.set(id, session);
      enqueue(() =>
        requestJson({
          baseUrl,
          path: '/api/phase5/sessions',
          method: 'POST',
          serviceToken,
          fetchImpl,
          body: {
            ...session,
            sessionType: session.type,
          },
        }),
      );

      return session;
    },
    getSession(sessionId) {
      assertHealthy();

      if (
        typeof sessionId !== 'string' ||
        !SESSION_ID_PATTERN.test(sessionId)
      ) {
        throw new Phase5Error('invalid session id', {
          code: 'INVALID_SESSION_ID',
          statusCode: 400,
        });
      }

      cleanup();
      const session = sessions.get(sessionId);

      if (!session) {
        throw new Phase5NotFoundError('session does not exist or has expired');
      }

      return session;
    },
    appendMessages(sessionId, messages) {
      assertHealthy();
      const session = store.getSession(sessionId);

      session.messages.push(...messages);
      session.updatedAt = new Date(now()).toISOString();
      session.expiresAt = new Date(getExpiresAt()).toISOString();
      enqueue(() => persistSession(session));

      return session;
    },
    startCleanup(intervalMs = 5 * 60 * 1000) {
      cleanupTimer = setInterval(cleanup, intervalMs);
      cleanupTimer.unref?.();

      return () => clearInterval(cleanupTimer);
    },
    cleanup,
    async flush() {
      await writeQueue;

      if (persistenceError) {
        throw persistenceError;
      }
    },
    async dispose() {
      if (cleanupTimer) {
        clearInterval(cleanupTimer);
      }

      await store.flush();
    },
    get size() {
      return sessions.size;
    },
  };

  return store;
};

export const createConfiguredSessionStore = async ({
  mode,
  baseUrl,
  serviceToken,
  fetchImpl,
}) => {
  if (mode === 'memory') {
    const store = createMemorySessionStore();

    store.flush = async () => {};
    store.dispose = async () => {};

    return store;
  }

  if (mode === 'sqlite') {
    return createPersistentSessionStore({
      baseUrl,
      serviceToken,
      fetchImpl,
    });
  }

  throw new Error('SESSION_STORAGE_MODE must be memory or sqlite');
};
