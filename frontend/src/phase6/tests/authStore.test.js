import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthStore } from '../stores/authStore.js';

const createStorage = () => {
  const values = new Map();

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
};

test('persists login state and exposes role checks', async () => {
  const storage = createStorage();
  const api = {
    async login() {
      return {
        token: 'editor-token',
        expiresAt: '2026-09-17T00:00:00.000Z',
        user: {
          id: 2,
          username: 'editor',
          role: 'editor',
        },
      };
    },
    async me() {
      throw new Error('me should not be called');
    },
    async logout() {
      return {
        status: 'logged_out',
      };
    },
  };
  const store = createAuthStore({
    storage,
    api,
  });

  await store.login({
    username: 'editor',
    password: 'secret',
  });

  assert.equal(store.state.token, 'editor-token');
  assert.equal(store.state.user.role, 'editor');
  assert.equal(store.hasRole('editor'), true);
  assert.equal(store.hasRole('viewer'), false);

  const restored = createAuthStore({
    storage,
    api,
  });

  assert.equal(await restored.ensureSession(), true);
  assert.equal(restored.state.user.username, 'editor');

  await restored.logout();
  assert.equal(restored.state.token, null);
  assert.equal(restored.state.user, null);
});

test('clears an invalid stored session when me fails', async () => {
  const storage = createStorage();

  storage.setItem(
    'virtual-utopia-phase6-auth',
    JSON.stringify({
      token: 'expired-token',
      expiresAt: '2026-09-16T00:00:00.000Z',
      user: null,
    }),
  );

  const store = createAuthStore({
    storage,
    api: {
      async me() {
        throw new Error('expired');
      },
      async login() {
        throw new Error('not used');
      },
      async logout() {
        throw new Error('not used');
      },
    },
  });

  assert.equal(await store.ensureSession(), false);
  assert.equal(store.state.token, null);
  assert.equal(storage.getItem('virtual-utopia-phase6-auth'), null);
});
