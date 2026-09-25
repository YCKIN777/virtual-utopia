import {
  Phase6ForbiddenError,
  Phase6UnauthorizedError,
  Phase6ValidationError,
} from './errors.js';

const PAGE_SIZE = 500;
const MAX_RECORDS = 10000;
const WORLD_SESSION_SCENE_ID = 'virtual-utopia-world';
const WORLD_SESSION_AGENT_ID = 'world-store';
const WORLD_SESSION_EXPIRES_AT = '2099-12-31T23:59:59.999Z';
const WORLD_SNAPSHOT_KIND = 'virtual-utopia-world-state';
const WORLD_SNAPSHOT_VERSION = 1;
const WORLD_CHAT_SESSION_ID = 'world-chat-global';
const WORLD_CHAT_SCENE_ID = 'virtual-utopia-world-chat';
const WORLD_CHAT_AGENT_ID = 'world-chat';
const MAX_WORLD_CHAT_MESSAGES = 50;
const WORLD_SNAPSHOT_KEYS = new Set([
  'version',
  'plotId',
  'permissions',
  'visitEnabled',
  'residents',
  'residentChats',
]);

const validateWorldSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Phase6ValidationError('snapshot must be an object');
  }

  if (Object.keys(snapshot).some((key) => !WORLD_SNAPSHOT_KEYS.has(key))) {
    throw new Phase6ValidationError('snapshot contains unsupported fields');
  }

  if (snapshot.plotId !== null && typeof snapshot.plotId !== 'string') {
    throw new Phase6ValidationError('snapshot.plotId must be a string or null');
  }

  if (
    !snapshot.permissions ||
    typeof snapshot.permissions !== 'object' ||
    Array.isArray(snapshot.permissions)
  ) {
    throw new Phase6ValidationError('snapshot permissions are required');
  }

  if (
    snapshot.visitEnabled !== undefined &&
    (typeof snapshot.visitEnabled !== 'object' ||
      Array.isArray(snapshot.visitEnabled))
  ) {
    throw new Phase6ValidationError('snapshot.visitEnabled must be an object');
  }

  return snapshot;
};

const getWorldSessionId = (userId) => `world-${userId}`;

const encodeWorldSnapshot = (snapshot) => {
  const serialized = JSON.stringify(snapshot);

  if (serialized.length > 1_500_000) {
    throw new Phase6ValidationError('world snapshot is too large');
  }

  const savedAt = new Date().toISOString();

  return {
    savedAt,
    messages: [
      {
        role: 'system',
        content: JSON.stringify({
          kind: WORLD_SNAPSHOT_KIND,
          version: WORLD_SNAPSHOT_VERSION,
          savedAt,
          snapshot,
        }),
      },
    ],
  };
};

const decodeWorldSnapshot = (session) => {
  const latest = [...(session?.messages || [])].reverse().find((message) => {
    if (message?.role !== 'system' || typeof message.content !== 'string') {
      return false;
    }

    try {
      return JSON.parse(message.content)?.kind === WORLD_SNAPSHOT_KIND;
    } catch {
      return false;
    }
  });

  if (!latest) {
    return {
      sessionId: session?.id || null,
      snapshot: null,
      savedAt: session?.updatedAt || null,
    };
  }

  const payload = JSON.parse(latest.content);

  return {
    sessionId: session.id,
    snapshot: payload.snapshot || null,
    savedAt: payload.savedAt || session.updatedAt || null,
  };
};

const normalizeLimit = (value) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 100;
  }

  return Math.min(parsed, PAGE_SIZE);
};

const normalizeOffset = (value) => {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const validateIsoDate = (value, field) => {
  if (!value) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const normalized = `${value}T${
      field === 'to' ? '23:59:59.999' : '00:00:00.000'
    }Z`;

    if (!Number.isFinite(Date.parse(normalized))) {
      throw new Phase6ValidationError(`${field} must be an ISO-8601 date`);
    }

    return normalized;
  }

  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Phase6ValidationError(`${field} must be an ISO-8601 date`);
  }

  return new Date(value).toISOString();
};

const matchesKeyword = (document, keyword) => {
  const normalized = keyword.trim().toLocaleLowerCase();

  if (!normalized) {
    return true;
  }

  return [document.title, document.sourcePath, document.fileName].some(
    (value) =>
      String(value || '')
        .toLocaleLowerCase()
        .includes(normalized),
  );
};

const createQueryString = (parameters) => {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }

  const encoded = query.toString();

  return encoded ? `?${encoded}` : '';
};

export const createGatewayService = ({ config, httpClient, uploadService }) => {
  const phase5 = config.phase5BaseUrl;
  let worldChatQueue = Promise.resolve();

  const serviceHeaders = {
    'x-phase5-service-token': config.serviceToken,
  };

  const getMe = (authorization) =>
    httpClient.requestJson(`${phase5}/api/phase5/auth/me`, {
      headers: {
        Authorization: authorization,
      },
    });

  const authenticate = async (authorization) => {
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new Phase6UnauthorizedError();
    }

    const user = await getMe(authorization);

    if (!user || !['admin', 'editor', 'viewer'].includes(user.role)) {
      throw new Phase6ForbiddenError();
    }

    return user;
  };

  const requireRole = (user, roles) => {
    if (!roles.includes(user.role)) {
      throw new Phase6ForbiddenError();
    }
  };

  const fetchPages = async ({ pathName, query = {}, authorization, key }) => {
    const records = [];
    let offset = 0;

    while (records.length < MAX_RECORDS) {
      const payload = await httpClient.requestJson(
        `${phase5}${pathName}${createQueryString({
          ...query,
          limit: PAGE_SIZE,
          offset,
        })}`,
        {
          headers: {
            Authorization: authorization,
          },
        },
      );
      const items = Array.isArray(payload?.[key]) ? payload[key] : [];

      records.push(...items);

      if (items.length < PAGE_SIZE) {
        break;
      }

      offset += PAGE_SIZE;
    }

    return records.slice(0, MAX_RECORDS);
  };

  const listDocuments = async ({ authorization, query }) => {
    await authenticate(authorization);
    const records = await fetchPages({
      pathName: '/api/phase5/documents',
      authorization,
      key: 'documents',
    });
    const status = query.status?.trim();
    const collectionName = query.collectionName?.trim();
    const keyword = query.keyword?.trim() || '';
    const limit = normalizeLimit(query.limit);
    const offset = normalizeOffset(query.offset);
    const filtered = records.filter(
      (document) =>
        (!status || document.status === status) &&
        (!collectionName || document.collectionName === collectionName) &&
        matchesKeyword(document, keyword),
    );

    return {
      documents: filtered.slice(offset, offset + limit),
    };
  };

  const getDocument = async ({ authorization, id }) => {
    await authenticate(authorization);

    return httpClient.requestJson(
      `${phase5}/api/phase5/documents/${encodeURIComponent(id)}`,
      {
        headers: {
          Authorization: authorization,
        },
      },
    );
  };

  const deleteDocument = async ({ authorization, id }) => {
    const user = await authenticate(authorization);
    requireRole(user, ['admin', 'editor']);
    await httpClient.requestJson(
      `${phase5}/api/phase5/documents/${encodeURIComponent(id)}`,
      {
        headers: {
          Authorization: authorization,
        },
      },
    );
    const result = await httpClient.requestJson(
      `${phase5}/api/phase5/documents/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: serviceHeaders,
      },
    );

    return {
      documentId: Number(result?.id) || Number(id),
      metadataDeleted: true,
      vectorCleanup: false,
    };
  };

  const listSessions = async ({ authorization, query }) => {
    const user = await authenticate(authorization);
    const all = query.all === 'true' && user.role === 'admin';
    const records = await fetchPages({
      pathName: '/api/phase5/sessions',
      authorization,
      key: 'sessions',
      query: {
        all: all ? 'true' : undefined,
      },
    });
    const sceneId = query.sceneId?.trim();
    const sessionType = query.sessionType?.trim();
    const from = validateIsoDate(query.from, 'from');
    const to = validateIsoDate(query.to, 'to');
    const limit = normalizeLimit(query.limit);
    const offset = normalizeOffset(query.offset);
    const filtered = records.filter((session) => {
      const updatedAt = Date.parse(session.updatedAt);

      return (
        (!sceneId || session.sceneId === sceneId) &&
        (!sessionType || session.sessionType === sessionType) &&
        (!from || updatedAt >= Date.parse(from)) &&
        (!to || updatedAt <= Date.parse(to))
      );
    });

    return {
      sessions: filtered.slice(offset, offset + limit),
    };
  };

  const getSession = async ({ authorization, id }) => {
    await authenticate(authorization);

    return httpClient.requestJson(
      `${phase5}/api/phase5/sessions/${encodeURIComponent(id)}`,
      {
        headers: {
          Authorization: authorization,
        },
      },
    );
  };

  const readWorldStateSession = async (userId) => {
    try {
      return await httpClient.requestJson(
        `${phase5}/api/phase5/sessions/${encodeURIComponent(
          getWorldSessionId(userId),
        )}`,
        {
          headers: serviceHeaders,
        },
      );
    } catch (error) {
      if (error?.details?.upstreamStatus === 404) {
        return null;
      }

      throw error;
    }
  };

  const getWorldState = async ({ authorization }) => {
    const user = await authenticate(authorization);
    const session = await readWorldStateSession(user.id);

    if (!session) {
      return {
        sessionId: getWorldSessionId(user.id),
        snapshot: null,
        savedAt: null,
      };
    }

    return decodeWorldSnapshot(session);
  };

  const saveWorldState = async ({ authorization, snapshot }) => {
    const user = await authenticate(authorization);
    requireRole(user, ['admin', 'editor']);
    validateWorldSnapshot(snapshot);
    const sessionId = getWorldSessionId(user.id);
    const encoded = encodeWorldSnapshot(snapshot);
    const existing = await readWorldStateSession(user.id);
    const payload = {
      title: '五十户山林庄园城镇世界快照',
      messages: encoded.messages,
      status: 'active',
      expiresAt: WORLD_SESSION_EXPIRES_AT,
    };

    if (existing) {
      await httpClient.requestJson(
        `${phase5}/api/phase5/sessions/${encodeURIComponent(sessionId)}`,
        {
          method: 'PUT',
          headers: {
            ...serviceHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );
    } else {
      await httpClient.requestJson(`${phase5}/api/phase5/sessions`, {
        method: 'POST',
        headers: {
          ...serviceHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: sessionId,
          userId: user.id,
          sceneId: WORLD_SESSION_SCENE_ID,
          sessionType: 'private',
          ownerAgentId: WORLD_SESSION_AGENT_ID,
          ...payload,
        }),
      });
    }

    return {
      sessionId,
      savedAt: encoded.savedAt,
      snapshot,
    };
  };

  const readWorldChatSession = async () => {
    try {
      return await httpClient.requestJson(
        `${phase5}/api/phase5/sessions/${WORLD_CHAT_SESSION_ID}`,
        {
          headers: serviceHeaders,
        },
      );
    } catch (error) {
      if (error?.details?.upstreamStatus === 404) {
        return null;
      }

      throw error;
    }
  };

  const getWorldChat = async ({ authorization, limit = 60, channel = 'plaza' }) => {
    await authenticate(authorization);
    await worldChatQueue;
    const session = await readWorldChatSession();
    const messages = Array.isArray(session?.messages) ? session.messages : [];
    const normalizedLimit = Math.max(1, Math.min(Number(limit) || 60, 100));
    const normalizedChannel = String(channel || 'plaza');

    return {
      sessionId: WORLD_CHAT_SESSION_ID,
      channel: normalizedChannel,
      messages: messages
        .filter((message) => (message?.channel || 'plaza') === normalizedChannel)
        .slice(-normalizedLimit),
    };
  };

  const sendWorldChatMessage = async ({ authorization, content, channel = 'plaza' }) => {
    const user = await authenticate(authorization);
    const normalizedContent = String(content || '').trim();
    const normalizedChannel = String(channel || 'plaza');

    if (normalizedContent.length === 0 || normalizedContent.length > 200) {
      throw new Phase6ValidationError(
        'chat content must be between 1 and 200 characters',
      );
    }

    const task = worldChatQueue.then(async () => {
      const session = await readWorldChatSession();
      const messages = Array.isArray(session?.messages) ? session.messages : [];
      const message = {
        id: `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        userId: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        content: normalizedContent,
        channel: normalizedChannel,
        createdAt: new Date().toISOString(),
      };
      const nextMessages = [...messages, message].slice(
        -MAX_WORLD_CHAT_MESSAGES,
      );
      const payload = {
        title: '虚拟乌托邦世界频道',
        messages: nextMessages,
        status: 'active',
        expiresAt: WORLD_SESSION_EXPIRES_AT,
      };

      if (session) {
        await httpClient.requestJson(
          `${phase5}/api/phase5/sessions/${WORLD_CHAT_SESSION_ID}`,
          {
            method: 'PUT',
            headers: {
              ...serviceHeaders,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          },
        );
      } else {
        await httpClient.requestJson(`${phase5}/api/phase5/sessions`, {
          method: 'POST',
          headers: {
            ...serviceHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: WORLD_CHAT_SESSION_ID,
            userId: null,
            sceneId: WORLD_CHAT_SCENE_ID,
            sessionType: 'public',
            ownerAgentId: WORLD_CHAT_AGENT_ID,
            ...payload,
          }),
        });
      }

      return {
        sessionId: WORLD_CHAT_SESSION_ID,
        message,
      };
    });

    worldChatQueue = task.catch(() => {});
    return task;
  };

  const login = async ({ username, password }) => {
    if (
      typeof username !== 'string' ||
      username.trim() === '' ||
      typeof password !== 'string' ||
      password === ''
    ) {
      throw new Phase6ValidationError('username and password are required');
    }

    return httpClient.requestJson(`${phase5}/api/phase5/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: username.trim(),
        password,
      }),
    });
  };

  const logout = async (authorization) => {
    await authenticate(authorization);

    return httpClient.requestJson(`${phase5}/api/phase5/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
      },
    });
  };

  const createUser = async ({ authorization, input }) => {
    const user = await authenticate(authorization);
    requireRole(user, ['admin']);

    return httpClient.requestJson(`${phase5}/api/phase5/users`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
  };

  const registerResidentApplication = async ({
    username,
    password,
    displayName,
    hobbies,
    occupation,
    selfIntro,
    contact,
    address,
  }) => {
    if (
      typeof username !== 'string' ||
      username.trim() === '' ||
      typeof password !== 'string' ||
      password === ''
    ) {
      throw new Phase6ValidationError('username and password are required');
    }

    return httpClient.requestJson(`${phase5}/api/phase5/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: username.trim(),
        password,
        displayName,
        hobbies,
        occupation,
        selfIntro,
        contact,
        address,
      }),
    });
  };

  const listPendingApplications = async ({ authorization }) => {
    const user = await authenticate(authorization);
    requireRole(user, ['admin']);

    const payload = await httpClient.requestJson(
      `${phase5}/api/phase5/users?status=pending`,
      {
        headers: {
          Authorization: authorization,
        },
      },
    );

    return {
      applications: Array.isArray(payload?.users) ? payload.users : [],
    };
  };

  const setUserStatus = async ({ authorization, userId, status }) => {
    const user = await authenticate(authorization);
    requireRole(user, ['admin']);

    return httpClient.requestJson(
      `${phase5}/api/phase5/users/${encodeURIComponent(userId)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      },
    );
  };

  const rejectApplication = async ({ authorization, userId, reason }) => {
    const user = await authenticate(authorization);
    requireRole(user, ['admin']);

    return httpClient.requestJson(
      `${phase5}/api/phase5/users/${encodeURIComponent(userId)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'disabled',
          rejectReason: String(reason || '').trim() || null,
        }),
      },
    );
  };

  const queryResidentApplication = async ({ username }) => {
    if (typeof username !== 'string' || username.trim() === '') {
      throw new Phase6ValidationError('username is required');
    }

    return httpClient.requestJson(
      `${phase5}/api/phase5/resident-applications/query${createQueryString({
        username: username.trim(),
      })}`,
      {
        headers: {},
      },
    );
  };

  const changePassword = async ({
    authorization,
    currentPassword,
    newPassword,
  }) => {
    await authenticate(authorization);

    return httpClient.requestJson(`${phase5}/api/phase5/auth/password`, {
      method: 'PUT',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  };

  const resetPassword = async ({ authorization, userId, newPassword }) => {
    const user = await authenticate(authorization);
    requireRole(user, ['admin']);

    return httpClient.requestJson(
      `${phase5}/api/phase5/users/${encodeURIComponent(userId)}/password`,
      {
        method: 'PUT',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPassword }),
      },
    );
  };

  const uploadDocument = async ({ file, fields, authorization }) => {
    const user = await authenticate(authorization);
    requireRole(user, ['admin', 'editor']);

    return uploadService.upload({
      file,
      fields,
      authorization,
    });
  };

  return Object.freeze({
    authenticate,
    changePassword,
    createUser,
    deleteDocument,
    getDocument,
    getSession,
    getWorldChat,
    getWorldState,
    listDocuments,
    listPendingApplications,
    listSessions,
    login,
    logout,
    registerResidentApplication,
    rejectApplication,
    resetPassword,
    saveWorldState,
    sendWorldChatMessage,
    setUserStatus,
    queryResidentApplication,
    uploadDocument,
  });
};
