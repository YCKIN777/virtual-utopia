import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuditStore } from '../auditStore.js';

test('stores and filters Phase6 audit events', () => {
  const store = createAuditStore(':memory:');

  try {
    const event = store.record({
      actorUserId: 2,
      actorUsername: 'editor',
      action: 'upload',
      result: 'success',
      resourceType: 'document',
      resourceId: '9',
      details: {
        chunkCount: 2,
      },
    });

    assert.equal(event.action, 'upload');
    assert.deepEqual(
      store.list({ action: 'upload' }).map((item) => item.id),
      [event.id],
    );
    assert.equal(store.list({ action: 'delete_document' }).length, 0);
  } finally {
    store.close();
  }
});
