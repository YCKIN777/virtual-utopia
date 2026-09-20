import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAuditStore } from '../auditStore.js';
import { createPhase6App } from '../app.js';
import { startPhase5Server } from '../../phase5/server.js';
import { createPersistenceClient } from '../../../../frontend/src/virtual-utopia/services/gatewayClient.js';
import { createWorldStore } from '../../../../frontend/src/virtual-utopia/stores/worldStore.js';

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

const directory = await mkdtemp(path.join(os.tmpdir(), 'world-state-phase5-'));
const createStorage = () => {
  const values = new Map();

  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
};
const auditStore = createAuditStore(':memory:');
let phase5;
let phase6Server;

try {
  phase5 = await startPhase5Server({
    config: {
      enabled: true,
      port: 0,
      databasePath: path.join(directory, 'phase5.sqlite'),
      busyTimeoutMs: 5000,
      authSecret: 'world-state-auth-secret',
      serviceToken: 'world-state-service-token',
      tokenTtlSeconds: 3600,
      logRetentionDays: 90,
      requestTimeoutMs: 5000,
      bootstrapAdminUsername: 'admin',
      bootstrapAdminPassword: 'admin-password',
      sessionStorageMode: 'sqlite',
      phase4BaseUrl: '',
      phase4TimeoutMs: 3000,
      phase5LogEnabled: false,
      phase4Port: 0,
    },
  });
  const phase5BaseUrl = `http://localhost:${phase5.server.address().port}`;
  const app = createPhase6App({
    config: {
      phase5BaseUrl,
      ragBaseUrl: 'http://127.0.0.1:1',
      serviceToken: 'world-state-service-token',
      ragDocsDirectory: directory,
      docsDirectory: path.join(directory, 'docs'),
      maxUploadBytes: 1024 * 1024,
      requestTimeoutMs: 5000,
      allowedOrigins: ['http://localhost:5175'],
    },
    auditStore,
  });
  phase6Server = await listen(http.createServer(app));
  const baseUrl = `http://127.0.0.1:${phase6Server.address().port}`;
  const loginResponse = await fetch(`${baseUrl}/api/phase6/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: 'admin',
      password: 'admin-password',
    }),
  });
  const login = await loginResponse.json();

  assert.equal(loginResponse.status, 200);

  const createAccount = async (username, role) => {
    const response = await fetch(`${baseUrl}/api/phase6/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${login.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password: `${username}-password`,
        role,
        displayName: username,
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.role, role);
    return payload;
  };

  await createAccount('editor-account', 'editor');
  await createAccount('viewer-account', 'viewer');

  const loginAccount = async (username) => {
    const response = await fetch(`${baseUrl}/api/phase6/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password: `${username}-password`,
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    return payload;
  };
  const editorLogin = await loginAccount('editor-account');
  const viewerLogin = await loginAccount('viewer-account');
  const snapshot = {
    version: 1,
    plotId: 'plot-28',
    permissions: {
      role: 'editor',
      canManageHome: true,
    },
  };
  const saveResponse = await fetch(`${baseUrl}/api/phase6/world-state`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${editorLogin.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ snapshot }),
  });
  const saved = await saveResponse.json();

  assert.equal(saveResponse.status, 200);
  assert.equal(saved.sessionId, `world-${editorLogin.user.id}`);

  const viewerSaveResponse = await fetch(`${baseUrl}/api/phase6/world-state`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${viewerLogin.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ snapshot }),
  });

  assert.equal(viewerSaveResponse.status, 403);

  const loadResponse = await fetch(`${baseUrl}/api/phase6/world-state`, {
    headers: {
      Authorization: `Bearer ${editorLogin.token}`,
    },
  });
  const loaded = await loadResponse.json();

  assert.equal(loadResponse.status, 200);
  assert.deepEqual(loaded.snapshot, snapshot);

  const persistence = createPersistenceClient({
    baseUrl,
  });
  const storage = createStorage();
  const editorStore = createWorldStore({
    persistence,
    storage,
    wait: async () => {},
    autoDismissMs: 0,
    saveDelayMs: 0,
  });

  await editorStore.login({
    username: 'editor-account',
    password: 'editor-account-password',
  });
  assert.equal(editorStore.setVisitPermission('plot-28', true), true);
  assert.equal(await editorStore.persistNow(), true);

  const reloadedStore = createWorldStore({
    persistence,
    storage,
    wait: async () => {},
    autoDismissMs: 0,
    saveDelayMs: 0,
  });

  assert.equal(await reloadedStore.restoreSession(), true);
  assert.equal(reloadedStore.getHomePlot('plot-28').visibility, 'public');

  const viewerStore = createWorldStore({
    persistence,
    storage: createStorage(),
    wait: async () => {},
    autoDismissMs: 0,
    saveDelayMs: 0,
  });

  await viewerStore.login({
    username: 'viewer-account',
    password: 'viewer-account-password',
  });
  assert.equal(viewerStore.canEditHome('plot-28'), false);

  const chatResponse = await fetch(`${baseUrl}/api/phase6/chat/world`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${editorLogin.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: '山林庄园的世界频道测试',
    }),
  });

  assert.equal(chatResponse.status, 201);

  const chatHistoryResponse = await fetch(
    `${baseUrl}/api/phase6/chat/world?limit=20`,
    {
      headers: {
        Authorization: `Bearer ${viewerLogin.token}`,
      },
    },
  );
  const chatHistory = await chatHistoryResponse.json();

  assert.equal(chatHistoryResponse.status, 200);
  assert.equal(
    chatHistory.messages.some(
      (message) => message.content === '山林庄园的世界频道测试',
    ),
    true,
  );

  console.log(
    JSON.stringify(
      {
        phase5WorldStateWrite: 'passed',
        phase5WorldStateRead: 'passed',
        viewerWriteForbidden: 'passed',
        roleAccounts: ['admin', 'editor', 'viewer'],
        refreshRestore: 'passed',
        worldChatPersistence: 'passed',
        sessionId: saved.sessionId,
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

  await phase5?.close();
  await rm(directory, {
    recursive: true,
    force: true,
  });
}
