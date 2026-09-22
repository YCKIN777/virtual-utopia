import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createContentStore, HOME_ACCESS_MODES } from '../contentStore.js';
import { createSearchIndex, tokenize } from '../searchIndex.js';
import { createSearchService } from '../searchService.js';
import { PHASE7_LIMITS } from '../config.js';

const createSandbox = () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'vu-phase7-'));
  const searchIndex = createSearchIndex({ dataDirectory: directory });
  const store = createContentStore({ dataDirectory: directory, searchIndex });
  store.ensureLayout();
  return { directory, searchIndex, store, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
};

test('tokenize 切出中文单字与相邻双字', () => {
  const tokens = tokenize('工作计划 plan-2026');
  assert.ok(tokens.includes('工'));
  assert.ok(tokens.includes('工作'));
  assert.ok(tokens.includes('计划'));
  assert.ok(tokens.includes('plan'));
  assert.ok(tokens.includes('2026'));
});

test('广场公共频道写入并可读回，且按最新优先截取', () => {
  const sandbox = createSandbox();
  try {
    for (let index = 1; index <= 5; index += 1) {
      sandbox.store.appendPublicMessage({
        fromUserId: 'u1',
        fromUsername: '阿岚',
        text: `广场发言 ${index}`,
        scene: { x: 1.234, y: 1, z: -2.345, zone: 'plaza' },
      });
    }
    const messages = sandbox.store.listPublicMessages({ limit: 2 });
    assert.equal(messages.length, 2);
    assert.equal(messages[1].text, '广场发言 5');
    assert.equal(messages[0].scene.x, 1.23);
    assert.equal(messages[0].scene.zone, 'plaza');
    assert.equal(messages[0].target, 'public');
    // 消息字段完整性：ID / 发送人 / 接收对象 / 文本 / 时间戳 / 场景位置
    ['id', 'fromUserId', 'target', 'text', 'createdAt', 'scene'].forEach((field) => {
      assert.ok(field in messages[0], `缺少字段 ${field}`);
    });
  } finally {
    sandbox.cleanup();
  }
});

test('公共频道超过分片阈值自动归档历史片段', () => {
  const sandbox = createSandbox();
  try {
    const file = sandbox.store.paths.publicChat;
    mkdirSync(path.dirname(file), { recursive: true });
    const seeded = {
      version: 1,
      channel: 'public',
      archives: [],
      messages: Array.from({ length: PHASE7_LIMITS.shardSize }, (_, index) => ({
        id: `seed_${index}`,
        fromUserId: 'u1',
        fromUsername: '阿岚',
        target: 'public',
        text: `历史 ${index}`,
        createdAt: new Date().toISOString(),
        scene: null,
      })),
    };
    writeFileSync(file, JSON.stringify(seeded), 'utf8');

    sandbox.store.appendPublicMessage({
      fromUserId: 'u1',
      fromUsername: '阿岚',
      text: '触发归档',
    });

    const after = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(after.messages.length, PHASE7_LIMITS.shardSize);
    assert.equal(after.archives.length, 1);
    const archived = JSON.parse(
      readFileSync(path.join(path.dirname(file), after.archives[0]), 'utf8'),
    );
    assert.equal(archived.messages.length, 1);
  } finally {
    sandbox.cleanup();
  }
});

test('双人私聊双方各存一份镜像，且消息含场景位置', () => {
  const sandbox = createSandbox();
  try {
    const message = sandbox.store.appendDirectMessage({
      fromUserId: 'u1',
      fromUsername: '阿岚',
      toUserId: 'u2',
      toUsername: '苏禾',
      text: '河边见',
      scene: { x: -3, y: 0.4, z: 12, zone: 'river' },
      channel: 'encounter',
    });
    const left = sandbox.store.listConversation({ viewerId: 'u1', peerId: 'u2' });
    const right = sandbox.store.listConversation({ viewerId: 'u2', peerId: 'u1' });
    assert.equal(left.length, 1);
    assert.equal(right.length, 1);
    assert.equal(left[0].id, message.id);
    assert.equal(right[0].channel, 'encounter');
    assert.equal(right[0].scene.zone, 'river');
    assert.deepEqual(sandbox.store.listConversationPeers('u1'), ['u2']);
  } finally {
    sandbox.cleanup();
  }
});

test('主页权限裁剪：私密条目仅作者本人可读，公开条目原住民可读', () => {
  const sandbox = createSandbox();
  try {
    const publicEntry = sandbox.store.upsertProfileEntry({
      ownerId: 'u1',
      ownerName: '阿岚',
      board: 'work_plan',
      title: '公开计划',
      body: '本周种竹',
      visibility: 'public',
    });
    const privateEntry = sandbox.store.upsertProfileEntry({
      ownerId: 'u1',
      ownerName: '阿岚',
      board: 'life_note',
      title: '私密随记',
      body: '只想自己看',
      visibility: 'private',
    });

    const ownerView = sandbox.store.readVisibleProfile({
      ownerId: 'u1',
      viewerId: 'u1',
      isResident: true,
    });
    assert.equal(ownerView.entries.length, 2);
    assert.equal(ownerView.isOwner, true);

    const otherView = sandbox.store.readVisibleProfile({
      ownerId: 'u1',
      viewerId: 'u2',
      isResident: true,
    });
    assert.deepEqual(otherView.entries.map((entry) => entry.id), [publicEntry.id]);
    assert.ok(!otherView.entries.some((entry) => entry.id === privateEntry.id));

    const visitorView = sandbox.store.readVisibleProfile({
      ownerId: 'u1',
      viewerId: 'guest',
      isResident: false,
    });
    assert.equal(visitorView.entries.length, 0);
  } finally {
    sandbox.cleanup();
  }
});

test('主页留言：写入后可读，删除后索引同步移除', () => {
  const sandbox = createSandbox();
  try {
    const entry = sandbox.store.upsertProfileEntry({
      ownerId: 'u1',
      ownerName: '阿岚',
      board: 'board',
      title: '展示板',
      body: '山居生活',
      visibility: 'public',
    });
    const comment = sandbox.store.addProfileComment({
      ownerId: 'u1',
      ownerName: '阿岚',
      entryId: entry.id,
      fromUserId: 'u2',
      fromUsername: '苏禾',
      text: '想去串门',
    });
    const profile = sandbox.store.readProfile('u1');
    assert.equal(profile.comments[entry.id].length, 1);
    assert.equal(profile.comments[entry.id][0].text, '想去串门');

    sandbox.store.deleteProfileComment({
      ownerId: 'u1',
      entryId: entry.id,
      commentId: comment.id,
    });
    assert.equal(sandbox.store.readProfile('u1').comments[entry.id].length, 0);
  } finally {
    sandbox.cleanup();
  }
});

test('宅院交流权限三档写入与读取', () => {
  const sandbox = createSandbox();
  try {
    assert.equal(sandbox.store.readHomeAccess('plot-7').mode, 'open');
    HOME_ACCESS_MODES.forEach((mode) => {
      const record = sandbox.store.writeHomeAccess({
        plotId: 'plot-7',
        ownerId: 'u1',
        mode,
        updatedBy: 'u1',
      });
      assert.equal(record.mode, mode);
      assert.equal(sandbox.store.readHomeAccess('plot-7').mode, mode);
    });
    assert.equal(sandbox.store.listHomeAccess().length, 1);
  } finally {
    sandbox.cleanup();
  }
});

test('关键词检索严格执行权限隔离', () => {
  const sandbox = createSandbox();
  try {
    // 公开主页条目（所有原住民可检索）
    sandbox.store.upsertProfileEntry({
      ownerId: 'u1',
      ownerName: '阿岚',
      board: 'work_plan',
      title: '竹林修整',
      body: '本周修剪矮竹并补植',
      visibility: 'public',
    });
    // 私密条目（仅作者可检索）
    sandbox.store.upsertProfileEntry({
      ownerId: 'u1',
      ownerName: '阿岚',
      board: 'life_note',
      title: '私密心事',
      body: '矮竹下的秘密',
      visibility: 'private',
    });
    // 双人私聊（仅双方可检索）
    sandbox.store.appendDirectMessage({
      fromUserId: 'u2',
      fromUsername: '苏禾',
      toUserId: 'u3',
      toUsername: '林涧',
      text: '矮竹小径碰头',
    });

    const search = createSearchService({ searchIndex: sandbox.searchIndex });

    const owner = search.search({ viewerId: 'u1', isResident: true, query: '矮竹' });
    assert.ok(owner.results.length >= 2, '作者应能检索到自己的公开与私密条目');

    const other = search.search({ viewerId: 'u9', isResident: true, query: '矮竹' });
    assert.ok(other.results.length >= 1);
    assert.ok(
      other.results.every((item) => item.visibility === 'public' || item.type === 'public_chat'),
      '其他原住民不应检索到私密条目或他人私聊',
    );

    const participant = search.search({ viewerId: 'u2', isResident: true, query: '碰头' });
    assert.equal(participant.results.length, 1);

    const outsider = search.search({ viewerId: 'u9', isResident: true, query: '碰头' });
    assert.equal(outsider.results.length, 0, '非参与者不得检索到私聊');

    const visitor = search.search({ viewerId: 'guest', isResident: false, query: '矮竹' });
    const visitorReadable = visitor.results.filter(
      (item) => item.type !== 'direct_chat' && item.visibility !== 'private',
    );
    assert.equal(
      visitor.results.length,
      visitorReadable.length,
      '非原住民不应获得任何私密/私聊结果',
    );
  } finally {
    sandbox.cleanup();
  }
});

test('导出个人数据包含主页、会话与公屏发言', () => {
  const sandbox = createSandbox();
  try {
    sandbox.store.upsertProfileEntry({
      ownerId: 'u1',
      ownerName: '阿岚',
      board: 'travel_log',
      title: '出游',
      body: '去河岸',
      visibility: 'public',
    });
    sandbox.store.appendDirectMessage({
      fromUserId: 'u1',
      fromUsername: '阿岚',
      toUserId: 'u2',
      toUsername: '苏禾',
      text: '一起走',
    });
    sandbox.store.appendPublicMessage({
      fromUserId: 'u1',
      fromUsername: '阿岚',
      text: '广场集合',
    });

    const { file, payload } = sandbox.store.exportUser({ userId: 'u1', username: '阿岚' });
    assert.ok(file.endsWith('.json'));
    assert.equal(payload.profile.entries.length, 1);
    assert.equal(payload.conversations.length, 1);
    assert.equal(payload.conversations[0].messages.length, 1);
    assert.equal(payload.publicMessages.length, 1);
    const onDisk = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(onDisk.userId, 'u1');
  } finally {
    sandbox.cleanup();
  }
});
