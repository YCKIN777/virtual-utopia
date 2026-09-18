import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openM4Database } from '../src/database.js';
import { createM4Repositories } from '../src/repositories.js';
import { createTemplateService } from '../src/templateService.js';

const admin = {
  id: 1,
  username: 'admin',
  role: 'admin',
};

const viewer = {
  id: 2,
  username: 'viewer',
  role: 'viewer',
};

test('template service creates, publishes and protects templates', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bp4-m4-template-'));
  const database = await openM4Database({
    databasePath: path.join(directory, 'm4.sqlite'),
  });
  const repositories = createM4Repositories(database);
  const service = createTemplateService({ repositories });

  try {
    const home = service.create({
      user: admin,
      id: 'home-basic',
      templateType: 'home',
      name: '基础家园',
      description: '家园模板',
      payload: { style: 'forest' },
    });
    const scene = service.create({
      user: admin,
      id: 'scene-plaza',
      templateType: 'scene',
      name: '广场场景',
      description: '场景模板',
      payload: { camera: 'overview' },
    });
    const published = service.publish({
      user: admin,
      id: home.id,
    });

    assert.equal(published.status, 'published');
    assert.equal(service.list().length, 2);
    assert.equal(scene.templateType, 'scene');
    assert.equal(service.stats().total, 2);
    assert.throws(
      () =>
        service.create({
          user: viewer,
          id: 'viewer-template',
          templateType: 'home',
          name: '禁止',
          description: '禁止',
        }),
      {
        code: 'BP4_FORBIDDEN',
      },
    );
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
