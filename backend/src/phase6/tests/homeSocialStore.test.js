import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHomeSocialStore } from '../homeSocialStore.js';

test('串门留言簿：留言线程 + 来访记录', () => {
  const store = createHomeSocialStore({ databasePath: ':memory:' });

  // 留言 + 回复线程
  const top = store.createMessage({
    plotId: 'plot-4',
    authorUserId: 1,
    authorName: 'alice',
    content: '来串门了',
    parentId: null,
  });
  const reply = store.createMessage({
    plotId: 'plot-4',
    authorUserId: 2,
    authorName: 'bob',
    content: '欢迎',
    parentId: top.id,
  });

  const messages = store.listMessages('plot-4');
  assert.equal(messages.length, 2);
  assert.equal(messages[0].parentId, null);
  assert.equal(messages[1].parentId, top.id);

  // 来访记录
  const visit = store.recordVisit({
    plotId: 'plot-4',
    visitorUserId: 1,
    visitorName: 'alice',
  });

  const visits = store.listVisits('plot-4');
  assert.equal(visits.length, 1);
  assert.equal(visits[0].visitorName, 'alice');

  store.close();
});
