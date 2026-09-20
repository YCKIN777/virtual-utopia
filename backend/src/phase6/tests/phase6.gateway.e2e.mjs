import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAuditStore } from '../auditStore.js';
import { createPhase6App } from '../app.js';

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify(payload));
};

const readJson = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const listen = (server) =>
  new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1');
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });

const close = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const users = {
  'admin-token': {
    id: 1,
    username: 'admin',
    role: 'admin',
    displayName: '管理员',
  },
  'editor-token': {
    id: 2,
    username: 'editor',
    role: 'editor',
    displayName: '编辑者',
  },
  'viewer-token': {
    id: 3,
    username: 'viewer',
    role: 'viewer',
    displayName: '只读用户',
  },
};

const credentials = {
  admin: 'admin-password',
  editor: 'editor-password',
  viewer: 'viewer-password',
};

const createPhase5Mock = () => {
  const documents = [
    {
      id: 1,
      documentKey: 'resource-wall-guide',
      title: '资源墙规则',
      sourcePath: 'resource-wall-guide.md',
      fileName: 'resource-wall-guide.md',
      mimeType: 'text/markdown',
      contentHash: 'hash-1',
      chunkCount: 4,
      collectionName: 'virtual_utopia_rag',
      status: 'indexed',
      metadata: {},
      createdBy: 1,
      createdAt: '2026-09-16T10:00:00.000Z',
      updatedAt: '2026-09-16T10:00:00.000Z',
    },
  ];
  const sessions = [
    {
      id: 'pub_yard',
      userId: 1,
      sceneId: 'yard',
      sessionType: 'public',
      ownerAgentId: 'ahe',
      title: '大院会话',
      messages: [{ role: 'user', content: '你好' }],
      status: 'active',
      createdAt: '2026-09-16T10:00:00.000Z',
      updatedAt: '2026-09-16T10:00:00.000Z',
      expiresAt: '2026-09-16T12:00:00.000Z',
    },
    {
      id: 'pub_library',
      userId: 1,
      sceneId: 'library',
      sessionType: 'public',
      ownerAgentId: 'suian',
      title: '书屋会话',
      messages: [],
      status: 'active',
      createdAt: '2026-09-17T10:00:00.000Z',
      updatedAt: '2026-09-17T10:00:00.000Z',
      expiresAt: '2026-09-17T12:00:00.000Z',
    },
    {
      id: 'prv_cabin',
      userId: 2,
      sceneId: 'cabin',
      sessionType: 'private',
      ownerAgentId: 'fenghe',
      title: '小屋会话',
      messages: [],
      status: 'active',
      createdAt: '2026-09-18T10:00:00.000Z',
      updatedAt: '2026-09-18T10:00:00.000Z',
      expiresAt: '2026-09-18T12:00:00.000Z',
    },
  ];
  const requests = [];

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const authorization = request.headers.authorization || '';
    const token = authorization.replace(/^Bearer\s+/, '');
    const user =
      request.headers['x-phase5-service-token'] === 'phase6-service-token'
        ? {
            id: null,
            username: 'phase6-service',
            role: 'service',
            isService: true,
          }
        : users[token];
    requests.push({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      authorization,
      serviceToken: request.headers['x-phase5-service-token'] || null,
    });

    if (url.pathname === '/api/phase5/auth/login') {
      const body = await readJson(request);

      if (
        credentials[body.username] !== body.password ||
        !users[`${body.username}-token`]
      ) {
        sendJson(response, 401, {
          error: 'Phase5UnauthorizedError',
          code: 'PHASE5_UNAUTHORIZED',
          message: 'invalid username or password',
        });
        return;
      }

      const loggedInUser = users[`${body.username}-token`];

      sendJson(response, 200, {
        token: `${body.username}-token`,
        expiresAt: '2026-09-17T00:00:00.000Z',
        user: loggedInUser,
      });
      return;
    }

    if (!user) {
      sendJson(response, 401, {
        error: 'Phase5UnauthorizedError',
        code: 'PHASE5_UNAUTHORIZED',
        message: 'authentication required',
      });
      return;
    }

    if (url.pathname === '/api/phase5/auth/me' && request.method === 'GET') {
      sendJson(response, 200, user);
      return;
    }

    if (
      url.pathname === '/api/phase5/auth/logout' &&
      request.method === 'POST'
    ) {
      sendJson(response, 200, {
        status: 'logged_out',
      });
      return;
    }

    if (url.pathname === '/api/phase5/documents' && request.method === 'GET') {
      sendJson(response, 200, {
        documents,
      });
      return;
    }

    if (url.pathname === '/api/phase5/documents' && request.method === 'POST') {
      const body = await readJson(request);
      const document = {
        id: documents.length + 1,
        ...body,
        createdBy: user.id,
        createdAt: '2026-09-20T10:00:00.000Z',
        updatedAt: '2026-09-20T10:00:00.000Z',
      };

      documents.push(document);
      sendJson(response, 201, document);
      return;
    }

    const documentMatch = url.pathname.match(
      /^\/api\/phase5\/documents\/(\d+)$/,
    );

    if (documentMatch) {
      const document = documents.find(
        (item) => item.id === Number(documentMatch[1]),
      );

      if (!document || document.status === 'deleted') {
        sendJson(response, 404, {
          error: 'Phase5NotFoundError',
          code: 'PHASE5_NOT_FOUND',
          message: 'document not found',
        });
        return;
      }

      if (request.method === 'GET') {
        sendJson(response, 200, document);
        return;
      }

      if (request.method === 'DELETE') {
        if (
          request.headers['x-phase5-service-token'] !== 'phase6-service-token'
        ) {
          sendJson(response, 403, {
            error: 'Phase5ForbiddenError',
            code: 'PHASE5_FORBIDDEN',
            message: 'permission denied',
          });
          return;
        }

        document.status = 'deleted';
        document.updatedAt = '2026-09-20T11:00:00.000Z';
        sendJson(response, 200, document);
        return;
      }
    }

    if (url.pathname === '/api/phase5/sessions' && request.method === 'GET') {
      const all =
        url.searchParams.get('all') === 'true' && user.role === 'admin';
      const visible = all
        ? sessions
        : sessions.filter((session) => session.userId === user.id);

      sendJson(response, 200, {
        sessions: visible,
      });
      return;
    }

    if (url.pathname === '/api/phase5/sessions' && request.method === 'POST') {
      if (
        request.headers['x-phase5-service-token'] !== 'phase6-service-token'
      ) {
        sendJson(response, 403, {
          error: 'Phase5ForbiddenError',
          code: 'PHASE5_FORBIDDEN',
          message: 'permission denied',
        });
        return;
      }

      const body = await readJson(request);
      const session = {
        ...body,
        status: body.status || 'active',
        createdAt: '2026-09-21T10:00:00.000Z',
        updatedAt: '2026-09-21T10:00:00.000Z',
      };
      sessions.push(session);
      sendJson(response, 201, session);
      return;
    }

    const sessionMatch = url.pathname.match(
      /^\/api\/phase5\/sessions\/([^/]+)$/,
    );

    if (sessionMatch) {
      const session = sessions.find((item) => item.id === sessionMatch[1]);

      if (!session) {
        sendJson(response, 404, {
          error: 'Phase5NotFoundError',
          code: 'PHASE5_NOT_FOUND',
          message: 'session not found',
        });
        return;
      }

      if (
        !user.isService &&
        user.role !== 'admin' &&
        session.userId !== user.id
      ) {
        sendJson(response, 403, {
          error: 'Phase5ForbiddenError',
          code: 'PHASE5_FORBIDDEN',
          message: 'permission denied',
        });
        return;
      }

      if (request.method === 'PUT') {
        if (
          request.headers['x-phase5-service-token'] !== 'phase6-service-token'
        ) {
          sendJson(response, 403, {
            error: 'Phase5ForbiddenError',
            code: 'PHASE5_FORBIDDEN',
            message: 'permission denied',
          });
          return;
        }

        const body = await readJson(request);
        Object.assign(session, body, {
          updatedAt: '2026-09-21T11:00:00.000Z',
        });
        sendJson(response, 200, session);
        return;
      }

      if (request.method !== 'GET') {
        sendJson(response, 404, {
          error: 'NotFound',
          code: 'PHASE5_NOT_FOUND',
          message: 'route not found',
        });
        return;
      }

      sendJson(response, 200, session);
      return;
    }

    sendJson(response, 404, {
      error: 'NotFound',
      code: 'PHASE5_NOT_FOUND',
      message: 'route not found',
    });
  });

  return {
    server,
    documents,
    requests,
  };
};

const createRagMock = () => {
  const server = http.createServer(async (request, response) => {
    if (request.url === '/api/rag/ingest' && request.method === 'POST') {
      await readJson(request);
      sendJson(response, 200, {
        documents: 1,
        chunks: 3,
        ids: ['chunk-1', 'chunk-2', 'chunk-3'],
      });
      return;
    }

    sendJson(response, 404, {
      code: 'RAG_NOT_FOUND',
      message: 'route not found',
    });
  });

  return server;
};

const rootDirectory = await mkdtemp(
  path.join(os.tmpdir(), 'phase6-gateway-e2e-'),
);
const phase5Mock = createPhase5Mock();
const ragServer = createRagMock();
const auditStore = createAuditStore(':memory:');
let phase6Server;

try {
  await listen(phase5Mock.server);
  await listen(ragServer);

  const config = {
    phase5BaseUrl: `http://127.0.0.1:${phase5Mock.server.address().port}`,
    ragBaseUrl: `http://127.0.0.1:${ragServer.address().port}`,
    serviceToken: 'phase6-service-token',
    ragDocsDirectory: path.join(rootDirectory, 'rag-docs'),
    docsDirectory: path.join(rootDirectory, 'rag-docs', 'phase6'),
    maxUploadBytes: 10 * 1024 * 1024,
    requestTimeoutMs: 5000,
    allowedOrigins: ['http://localhost:5174'],
  };
  const app = createPhase6App({
    config,
    auditStore,
  });

  phase6Server = await listen(http.createServer(app));
  const baseUrl = `http://127.0.0.1:${phase6Server.address().port}`;

  const login = async (username, password) => {
    const response = await fetch(`${baseUrl}/api/phase6/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
      }),
    });

    return {
      response,
      payload: await response.json(),
    };
  };

  const failedLogin = await login('admin', 'wrong');
  assert.equal(failedLogin.response.status, 401);
  assert.equal(failedLogin.payload.code, 'PHASE5_UNAUTHORIZED');

  const adminLogin = await login('admin', 'admin-password');
  const editorLogin = await login('editor', 'editor-password');
  const viewerLogin = await login('viewer', 'viewer-password');

  assert.equal(adminLogin.response.status, 200);
  assert.equal(editorLogin.response.status, 200);
  assert.equal(viewerLogin.response.status, 200);

  const uploadForm = new FormData();
  uploadForm.set(
    'file',
    new Blob(['# 上传指南'], {
      type: 'text/markdown',
    }),
    '上传指南.md',
  );
  uploadForm.set('collectionName', 'virtual_utopia_rag');
  uploadForm.set('title', '上传指南');

  const uploadResponse = await fetch(`${baseUrl}/api/phase6/documents/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminLogin.payload.token}`,
    },
    body: uploadForm,
  });
  const uploadPayload = await uploadResponse.json();

  assert.equal(uploadResponse.status, 201);
  assert.equal(uploadPayload.ingest.chunks, 3);
  assert.equal(uploadPayload.document.title, '上传指南');
  assert.match(uploadPayload.document.sourcePath, /^phase6\/.+\.md$/);

  const keywordResponse = await fetch(
    `${baseUrl}/api/phase6/documents?keyword=${encodeURIComponent('资源墙')}`,
    {
      headers: {
        Authorization: `Bearer ${adminLogin.payload.token}`,
      },
    },
  );
  const keywordPayload = await keywordResponse.json();

  assert.equal(keywordResponse.status, 200);
  assert.equal(keywordPayload.documents.length, 1);
  assert.equal(keywordPayload.documents[0].title, '资源墙规则');

  const deleteResponse = await fetch(
    `${baseUrl}/api/phase6/documents/${uploadPayload.document.id}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${editorLogin.payload.token}`,
      },
    },
  );
  const deletePayload = await deleteResponse.json();

  assert.equal(deleteResponse.status, 200);
  assert.equal(deletePayload.metadataDeleted, true);
  assert.equal(deletePayload.vectorCleanup, false);
  assert.equal(
    phase5Mock.requests
      .filter(
        (request) =>
          request.method === 'DELETE' && request.path.includes('/documents/'),
      )
      .at(-1).serviceToken,
    'phase6-service-token',
  );

  const viewerForm = new FormData();
  viewerForm.set(
    'file',
    new Blob(['# viewer'], {
      type: 'text/markdown',
    }),
    'viewer.md',
  );
  viewerForm.set('collectionName', 'virtual_utopia_rag');
  const viewerUpload = await fetch(`${baseUrl}/api/phase6/documents/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${viewerLogin.payload.token}`,
    },
    body: viewerForm,
  });
  const viewerPayload = await viewerUpload.json();

  assert.equal(viewerUpload.status, 403);
  assert.equal(viewerPayload.code, 'PHASE6_FORBIDDEN');

  const sessionResponse = await fetch(
    `${baseUrl}/api/phase6/sessions?sceneId=library&sessionType=public&from=2026-09-17&to=2026-09-17&all=true`,
    {
      headers: {
        Authorization: `Bearer ${adminLogin.payload.token}`,
      },
    },
  );
  const sessionPayload = await sessionResponse.json();

  assert.equal(sessionResponse.status, 200);
  assert.equal(sessionPayload.sessions.length, 1);
  assert.equal(sessionPayload.sessions[0].id, 'pub_library');

  const initialWorldStateResponse = await fetch(
    `${baseUrl}/api/phase6/world-state`,
    {
      headers: {
        Authorization: `Bearer ${viewerLogin.payload.token}`,
      },
    },
  );
  const initialWorldState = await initialWorldStateResponse.json();

  assert.equal(initialWorldStateResponse.status, 200);
  assert.equal(initialWorldState.snapshot, null);

  const worldSnapshot = {
    version: 1,
    plotId: 'plot-28',
    permissions: {
      role: 'editor',
      canManageHome: true,
    },
  };
  const saveWorldStateResponse = await fetch(
    `${baseUrl}/api/phase6/world-state`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${editorLogin.payload.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        snapshot: worldSnapshot,
      }),
    },
  );
  const savedWorldState = await saveWorldStateResponse.json();

  assert.equal(saveWorldStateResponse.status, 200);
  assert.equal(savedWorldState.sessionId, 'world-2');
  assert.equal(savedWorldState.snapshot.version, 1);

  const viewerSaveResponse = await fetch(`${baseUrl}/api/phase6/world-state`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${viewerLogin.payload.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      snapshot: worldSnapshot,
    }),
  });
  const viewerSavePayload = await viewerSaveResponse.json();

  assert.equal(viewerSaveResponse.status, 403);
  assert.equal(viewerSavePayload.code, 'PHASE6_FORBIDDEN');

  const loadedWorldStateResponse = await fetch(
    `${baseUrl}/api/phase6/world-state`,
    {
      headers: {
        Authorization: `Bearer ${editorLogin.payload.token}`,
      },
    },
  );
  const loadedWorldState = await loadedWorldStateResponse.json();

  assert.equal(loadedWorldStateResponse.status, 200);
  assert.deepEqual(loadedWorldState.snapshot, worldSnapshot);
  assert.equal(
    phase5Mock.requests
      .filter((request) => request.path === '/api/phase5/sessions/world-2')
      .at(-1).serviceToken,
    'phase6-service-token',
  );

  const editorPresenceResponse = await fetch(`${baseUrl}/api/phase6/presence`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${editorLogin.payload.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      x: 10,
      y: 1,
      z: 20,
      rotation: 0.5,
      animationState: 'walk',
    }),
  });
  const editorPresence = await editorPresenceResponse.json();

  assert.equal(editorPresenceResponse.status, 200);
  assert.equal(editorPresence.users.length, 1);
  assert.equal(editorPresence.users[0].username, 'editor');
  assert.equal(editorPresence.users[0].animationState, 'walk');

  const viewerPresenceResponse = await fetch(`${baseUrl}/api/phase6/presence`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${viewerLogin.payload.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      x: -8,
      y: 1,
      z: 14,
      rotation: -0.4,
      animationState: 'idle',
    }),
  });
  const viewerPresence = await viewerPresenceResponse.json();

  assert.equal(viewerPresenceResponse.status, 200);
  assert.equal(viewerPresence.users.length, 2);

  const disconnectViewerResponse = await fetch(
    `${baseUrl}/api/phase6/presence`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${viewerLogin.payload.token}`,
      },
    },
  );
  const disconnectedPresence = await disconnectViewerResponse.json();

  assert.equal(disconnectViewerResponse.status, 200);
  assert.equal(disconnectedPresence.users.length, 1);
  assert.equal(disconnectedPresence.users[0].username, 'editor');

  const firstChatResponse = await fetch(`${baseUrl}/api/phase6/chat/world`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${editorLogin.payload.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: '大家晚上好',
    }),
  });
  const firstChat = await firstChatResponse.json();

  assert.equal(firstChatResponse.status, 201);
  assert.equal(firstChat.message.displayName, '编辑者');

  const secondChatResponse = await fetch(`${baseUrl}/api/phase6/chat/world`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${viewerLogin.payload.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: '晚上好，我来看庄园',
    }),
  });
  const secondChat = await secondChatResponse.json();

  assert.equal(secondChatResponse.status, 201);
  assert.equal(secondChat.message.username, 'viewer');

  const chatHistoryResponse = await fetch(
    `${baseUrl}/api/phase6/chat/world?limit=20`,
    {
      headers: {
        Authorization: `Bearer ${viewerLogin.payload.token}`,
      },
    },
  );
  const chatHistory = await chatHistoryResponse.json();

  assert.equal(chatHistoryResponse.status, 200);
  assert.equal(chatHistory.messages.length, 2);
  assert.equal(chatHistory.messages[0].content, '大家晚上好');
  assert.equal(chatHistory.messages[1].content, '晚上好，我来看庄园');

  const auditResponse = await fetch(
    `${baseUrl}/api/phase6/audit/events?action=upload`,
    {
      headers: {
        Authorization: `Bearer ${adminLogin.payload.token}`,
      },
    },
  );
  const auditPayload = await auditResponse.json();

  assert.equal(auditResponse.status, 200);
  assert.equal(
    auditPayload.events.some(
      (event) => event.action === 'upload' && event.result === 'success',
    ),
    true,
  );
  assert.equal(
    auditPayload.events.some(
      (event) => event.action === 'upload' && event.result === 'failure',
    ),
    true,
  );

  console.log(
    JSON.stringify(
      {
        login: 'passed',
        upload: 'passed',
        keywordFilter: 'passed',
        editorDelete: 'passed',
        viewerForbidden: 'passed',
        sessionFilters: 'passed',
        worldStatePersistence: 'passed',
        presenceSync: 'passed',
        worldChat: 'passed',
        audit: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  await auditStore.close();

  if (phase6Server?.listening) {
    await close(phase6Server);
  }

  if (ragServer.listening) {
    await close(ragServer);
  }

  if (phase5Mock.server.listening) {
    await close(phase5Mock.server);
  }

  await rm(rootDirectory, {
    recursive: true,
    force: true,
  });
}
