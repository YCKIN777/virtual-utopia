import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorldStore } from '../stores/worldStore.js';

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

const createPersistence = () => {
  let worldState = null;
  const savedSnapshots = [];
  let authUser = {
    id: 7,
    username: 'traveler',
    role: 'editor',
    displayName: '漫游者',
  };

  return {
    savedSnapshots,
    setUser: (user) => {
      authUser = user;
    },
    setWorldState: (value) => {
      worldState = value;
    },
    login: async () => ({
      token: 'phase5-token',
      expiresAt: '2099-12-31T23:59:59.999Z',
      user: authUser,
    }),
    me: async () => authUser,
    logout: async () => ({ status: 'logged_out' }),
    loadWorldState: async () => worldState,
    saveWorldState: async (_token, snapshot) => {
      savedSnapshots.push(snapshot);
      worldState = {
        sessionId: 'world-7',
        snapshot,
        savedAt: '2026-09-17T12:00:00.000Z',
      };
      return worldState;
    },
  };
};

test('logs in through Phase5 and restores the world snapshot', async () => {
  const storage = createStorage();
  const persistence = createPersistence();
  const store = createWorldStore({
    wait: async () => {},
    autoDismissMs: 0,
    persistence,
    storage,
    saveDelayMs: 0,
  });

  persistence.setWorldState({
    sessionId: 'world-7',
    savedAt: '2026-09-17T12:00:00.000Z',
    snapshot: {
      version: 1,
      plotId: 'plot-28',
      courtyardItems: [
        {
          id: 'persisted-item',
          materialId: 'house-cabin',
          x: 0.1,
          y: 0.2,
          rotation: 0,
        },
      ],
      interiorFurniture: [
        {
          id: 'persisted-furniture',
          materialId: 'lamp-path',
          x: 0.3,
          y: 0.2,
          rotation: 0,
        },
      ],
      permissions: {
        role: 'editor',
        canManageHome: true,
      },
    },
  });

  await store.login({
    username: 'traveler',
    password: 'utopia2026',
  });

  assert.equal(store.state.user.id, 'phase5-7');
  assert.equal(store.canEditHome('plot-28'), true);
  assert.equal(store.canEditHome('plot-1'), false);
  assert.equal(store.getHomePlot('plot-28').items[0].id, 'persisted-item');
  assert.equal(
    store.getHomePlot('plot-28').interiorItems[0].id,
    'persisted-furniture',
  );
  assert.equal(store.state.persistence.status, 'saved');
});

test('writes world changes back to the reserved Phase5 session', async () => {
  const storage = createStorage();
  const persistence = createPersistence();
  const store = createWorldStore({
    wait: async () => {},
    autoDismissMs: 0,
    persistence,
    storage,
    saveDelayMs: 0,
  });

  await store.login({
    username: 'traveler',
    password: 'utopia2026',
  });
  store.addHomeItem({
    plotId: 'plot-28',
    materialId: 'house-cabin',
    x: 0.25,
    y: 0.4,
  });
  store.addInteriorItem({
    plotId: 'plot-28',
    materialId: 'pot-ceramic',
    x: 0.6,
    y: 0.3,
  });
  await store.persistNow();

  const latest =
    persistence.savedSnapshots[persistence.savedSnapshots.length - 1];

  assert.equal(latest.plotId, 'plot-28');
  assert.equal(
    latest.courtyardItems.some((item) => item.materialId === 'house-cabin'),
    true,
  );
  assert.equal(
    latest.interiorFurniture.some((item) => item.materialId === 'pot-ceramic'),
    true,
  );
  assert.equal(latest.permissions.canManageHome, true);
});

test('restores a stored Phase5 token after page reload', async () => {
  const storage = createStorage();
  const persistence = createPersistence();
  storage.setItem('virtual-utopia.phase5.token', 'phase5-token');
  persistence.setWorldState({
    sessionId: 'world-7',
    savedAt: '2026-09-17T12:00:00.000Z',
    snapshot: {
      version: 1,
      plotId: 'plot-28',
      courtyardItems: [],
      interiorFurniture: [],
      permissions: {
        role: 'editor',
        canManageHome: true,
      },
    },
  });

  const store = createWorldStore({
    wait: async () => {},
    autoDismissMs: 0,
    persistence,
    storage,
    saveDelayMs: 0,
  });

  assert.equal(await store.restoreSession(), true);
  assert.equal(store.state.user.id, 'phase5-7');
  assert.equal(store.state.homes.length, 50);
  assert.equal(store.canEditHome('plot-28'), true);
});

test('falls back to temporary memory mode when Phase5 is unavailable', async () => {
  const unavailableError = new Error('phase5 unavailable');
  unavailableError.code = 'PERSISTENCE_UNAVAILABLE';
  const store = createWorldStore({
    wait: async () => {},
    autoDismissMs: 0,
    storage: createStorage(),
    saveDelayMs: 0,
    persistence: {
      login: async () => {
        throw unavailableError;
      },
      me: async () => null,
      logout: async () => null,
      loadWorldState: async () => null,
      saveWorldState: async () => null,
    },
  });

  await store.login({
    username: 'traveler',
    password: 'utopia2026',
  });

  assert.equal(store.state.user.displayName, '漫游者');
  assert.equal(store.state.persistence.status, 'offline');
});

test('keeps viewer role read-only', async () => {
  const persistence = createPersistence();
  persistence.setUser({
    id: 8,
    username: 'visitor',
    role: 'viewer',
    displayName: '访客',
  });
  persistence.setWorldState({
    sessionId: 'world-8',
    savedAt: '2026-09-17T12:00:00.000Z',
    snapshot: {
      version: 1,
      plotId: 'plot-28',
      courtyardItems: [],
      interiorFurniture: [],
      permissions: {
        role: 'viewer',
        canManageHome: false,
      },
    },
  });
  const store = createWorldStore({
    wait: async () => {},
    autoDismissMs: 0,
    persistence,
    storage: createStorage(),
    saveDelayMs: 0,
  });

  await store.login({
    username: 'visitor',
    password: 'visitor-password',
  });

  assert.equal(store.canEditHome('plot-28'), false);
  assert.equal(
    store.addHomeItem({
      plotId: 'plot-28',
      materialId: 'house-cabin',
      x: 0,
      y: 0,
    }),
    null,
  );
  assert.equal(persistence.savedSnapshots.length, 0);
});
