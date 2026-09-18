import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createConfiguredSessionStore, startPhase5Server } from '../index.js';

const temporaryDirectory = await mkdtemp(
  path.join(os.tmpdir(), 'virtual-utopia-phase5-e2e-'),
);
const databasePath = path.join(temporaryDirectory, 'phase5-e2e.sqlite');
const serviceToken = 'phase5-e2e-service-token';
const adminPassword = 'phase5-e2e-admin-password';
const editorPassword = 'phase5-e2e-editor-password';
let phase5Service;
let phase5BaseUrl;
let memoryModeProxy;
let memoryModeProxyCalls = 0;
let sqliteModeStore;
let restartedSqliteStore;

const createConfig = () => ({
  enabled: true,
  port: 0,
  databasePath,
  busyTimeoutMs: 5000,
  authSecret: 'phase5-e2e-auth-secret',
  serviceToken,
  tokenTtlSeconds: 3600,
  logRetentionDays: 90,
  requestTimeoutMs: 5000,
  bootstrapAdminUsername: 'admin',
  bootstrapAdminPassword: adminPassword,
  sessionStorageMode: 'memory',
  phase4BaseUrl: 'http://localhost:3300',
  phase4TimeoutMs: 3000,
  phase5LogEnabled: false,
  phase4Port: 3200,
});

const startService = async () => {
  phase5Service = await startPhase5Server({
    config: createConfig(),
  });
  phase5BaseUrl = `http://localhost:${phase5Service.server.address().port}`;
};

const stopService = async () => {
  if (phase5Service) {
    await phase5Service.close();
    phase5Service = undefined;
  }
};

const requestJson = async ({
  path: requestPath,
  method = 'GET',
  token,
  service = false,
  body,
}) => {
  const response = await fetch(`${phase5BaseUrl}${requestPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(service ? { 'X-Phase5-Service-Token': serviceToken } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();

  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
};

const login = async (username, password) => {
  const response = await requestJson({
    path: '/api/phase5/auth/login',
    method: 'POST',
    body: {
      username,
      password,
    },
  });

  assert.equal(response.status, 200);
  assert.ok(response.body.token);

  return response.body;
};

try {
  await startService();

  const health = await requestJson({
    path: '/api/phase5/health',
  });

  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');

  const adminLogin = await login('admin', adminPassword);
  const createdUser = await requestJson({
    path: '/api/phase5/users',
    method: 'POST',
    token: adminLogin.token,
    body: {
      username: 'editor',
      password: editorPassword,
      role: 'editor',
      displayName: 'Phase5 Editor',
    },
  });

  assert.equal(createdUser.status, 201);

  const editorLogin = await login('editor', editorPassword);
  const sessionId = `pub_${randomUUID()}`;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const createdSession = await requestJson({
    path: '/api/phase5/sessions',
    method: 'POST',
    token: editorLogin.token,
    body: {
      id: sessionId,
      sceneId: 'yard',
      sessionType: 'public',
      ownerAgentId: 'ahe',
      title: '重启持久化测试会话',
      messages: [],
      expiresAt,
    },
  });

  assert.equal(createdSession.status, 201);

  const updatedSession = await requestJson({
    path: `/api/phase5/sessions/${sessionId}`,
    method: 'PUT',
    token: editorLogin.token,
    body: {
      messages: [
        {
          role: 'user',
          content: 'Phase5会保存这条消息吗？',
        },
        {
          role: 'assistant',
          content: '会，服务重启后仍可读取。',
        },
      ],
    },
  });

  assert.equal(updatedSession.status, 200);

  const createdDocument = await requestJson({
    path: '/api/phase5/documents',
    method: 'POST',
    token: editorLogin.token,
    body: {
      documentKey: 'phase5-e2e-document',
      title: 'Phase5持久化文档',
      sourcePath: 'phase5-e2e.md',
      fileName: 'phase5-e2e.md',
      mimeType: 'text/markdown',
      contentHash: 'phase5-e2e-content-hash',
      chunkCount: 3,
      collectionName: 'virtual_utopia_rag',
      status: 'pending',
      metadata: {
        category: 'e2e',
      },
    },
  });

  assert.equal(createdDocument.status, 201);

  const updatedDocument = await requestJson({
    path: `/api/phase5/documents/${createdDocument.body.id}`,
    method: 'PUT',
    token: editorLogin.token,
    body: {
      chunkCount: 7,
      status: 'indexed',
    },
  });

  assert.equal(updatedDocument.status, 200);
  assert.equal(updatedDocument.body.chunkCount, 7);

  const createdLog = await requestJson({
    path: '/api/phase5/logs',
    method: 'POST',
    token: editorLogin.token,
    body: {
      sessionId,
      operationType: 'query',
      queryText: 'Phase5持久化测试',
      collectionName: 'virtual_utopia_rag',
      topK: 5,
      similarityThreshold: 0.2,
      matchedCount: 2,
      matchedChunks: [
        {
          source: 'phase5-e2e.md',
          chunkIndex: 0,
        },
      ],
      latencyMs: 12,
      status: 'success',
    },
  });

  assert.equal(createdLog.status, 201);

  await stopService();
  await startService();

  const editorLoginAfterRestart = await login('editor', editorPassword);
  const restoredSession = await requestJson({
    path: `/api/phase5/sessions/${sessionId}`,
    token: editorLoginAfterRestart.token,
  });
  const restoredDocument = await requestJson({
    path: `/api/phase5/documents/${createdDocument.body.id}`,
    token: editorLoginAfterRestart.token,
  });
  const restoredLogs = await requestJson({
    path: `/api/phase5/logs?sessionId=${sessionId}`,
    token: editorLoginAfterRestart.token,
  });

  assert.equal(restoredSession.status, 200);
  assert.equal(restoredSession.body.messages.length, 2);
  assert.equal(
    restoredSession.body.messages[0].content,
    'Phase5会保存这条消息吗？',
  );
  assert.equal(restoredDocument.status, 200);
  assert.equal(restoredDocument.body.chunkCount, 7);
  assert.equal(restoredDocument.body.status, 'indexed');
  assert.equal(restoredLogs.status, 200);
  assert.equal(restoredLogs.body.logs.length, 1);

  memoryModeProxy = createServer((_request, response) => {
    memoryModeProxyCalls += 1;
    response.writeHead(500);
    response.end('phase5 must not be called');
  });
  await new Promise((resolve, reject) => {
    memoryModeProxy.once('listening', resolve);
    memoryModeProxy.once('error', reject);
    memoryModeProxy.listen(0, 'localhost');
  });

  const memoryModeStore = await createConfiguredSessionStore({
    mode: 'memory',
    baseUrl: `http://localhost:${memoryModeProxy.address().port}`,
    serviceToken,
  });
  const memorySession = memoryModeStore.createSession({
    sceneId: 'yard',
    type: 'public',
    ownerAgentId: 'ahe',
  });

  memoryModeStore.appendMessages(memorySession.id, [
    {
      role: 'user',
      content: 'memory mode',
    },
  ]);
  memoryModeStore.getSession(memorySession.id);
  await memoryModeStore.flush();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(memoryModeProxyCalls, 0);

  sqliteModeStore = await createConfiguredSessionStore({
    mode: 'sqlite',
    baseUrl: phase5BaseUrl,
    serviceToken,
  });
  const sqliteSession = sqliteModeStore.createSession({
    sceneId: 'library',
    type: 'public',
    ownerAgentId: 'suian',
  });

  sqliteModeStore.appendMessages(sqliteSession.id, [
    {
      role: 'user',
      content: 'sqlite mode',
    },
    {
      role: 'assistant',
      content: 'persisted',
    },
  ]);
  await sqliteModeStore.flush();

  await stopService();
  await startService();

  restartedSqliteStore = await createConfiguredSessionStore({
    mode: 'sqlite',
    baseUrl: phase5BaseUrl,
    serviceToken,
  });
  const restoredAdapterSession = restartedSqliteStore.getSession(
    sqliteSession.id,
  );

  assert.equal(restoredAdapterSession.type, 'public');
  assert.equal(restoredAdapterSession.messages.length, 2);
  assert.equal(restoredAdapterSession.messages[1].content, 'persisted');

  console.log(
    JSON.stringify(
      {
        databasePath,
        sessionPersistenceAfterRestart: {
          sessionId,
          messages: restoredSession.body.messages.length,
        },
        documentPersistenceAfterRestart: {
          documentId: createdDocument.body.id,
          chunkCount: restoredDocument.body.chunkCount,
          status: restoredDocument.body.status,
        },
        logPersistenceAfterRestart: {
          count: restoredLogs.body.logs.length,
        },
        memoryMode: {
          phase5Calls: memoryModeProxyCalls,
        },
        sqliteMode: {
          sessionId: sqliteSession.id,
          restoredMessages: restoredAdapterSession.messages.length,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await sqliteModeStore?.dispose().catch(() => {});
  await restartedSqliteStore?.dispose().catch(() => {});
  await stopService();

  if (memoryModeProxy?.listening) {
    await new Promise((resolve) => memoryModeProxy.close(resolve));
  }

  await rm(temporaryDirectory, {
    recursive: true,
    force: true,
  });
}
