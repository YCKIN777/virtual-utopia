import assert from 'node:assert/strict';
import test from 'node:test';
import { createEventService } from '../src/eventService.js';
import { createGameplayService } from '../src/gameplayService.js';
import { openP1Database } from '../src/database.js';
import { createP1Repositories } from '../src/repositories.js';

const admin = {
  id: 1,
  username: 'admin',
  role: 'admin',
  displayName: 'Admin',
};

const editor = {
  id: 2,
  username: 'editor',
  role: 'editor',
  displayName: 'Editor',
};

const createFixture = async () => {
  const databaseClient = await openP1Database({
    databasePath: ':memory:',
  });
  const repositories = createP1Repositories(databaseClient);
  const config = {
    defaultInventoryCapacity: 40,
  };

  return {
    databaseClient,
    eventService: createEventService({ repositories }),
    gameplayService: createGameplayService({
      config,
      repositories,
    }),
    repositories,
  };
};

test('event, task, collection and reward loop is transactional', async () => {
  const fixture = await createFixture();

  try {
    const event = fixture.eventService.create({
      user: admin,
      title: '山麓采集季',
      description: '收集木材完成活动任务',
      status: 'draft',
    });
    const activeEvent = fixture.eventService.activate({
      eventId: event.id,
      user: admin,
    });
    assert.equal(activeEvent.status, 'active');

    const task = fixture.gameplayService.createTask({
      user: admin,
      eventId: event.id,
      title: '整理木料',
      description: '收集三份木材',
      targetItemId: 'wood',
      targetQuantity: 3,
      rewardItems: [
        {
          itemId: 'stone',
          quantity: 1,
        },
      ],
      rewardShards: 2,
    });
    const accepted = fixture.gameplayService.acceptTask({
      taskId: task.id,
      user: editor,
    });
    assert.equal(accepted.status, 'accepted');

    const firstNode = fixture.gameplayService.createResourceNode({
      user: admin,
      name: '林地木料',
      itemId: 'wood',
      quantity: 2,
      x: 0,
      y: 0,
      z: 0,
      interactionRadius: 5,
      respawnSeconds: 60,
    });
    const secondNode = fixture.gameplayService.createResourceNode({
      user: admin,
      name: '河岸木料',
      itemId: 'wood',
      quantity: 2,
      x: 1,
      y: 0,
      z: 1,
      interactionRadius: 5,
      respawnSeconds: 60,
    });

    fixture.gameplayService.collectResource({
      nodeId: firstNode.id,
      user: editor,
      position: { x: 0, y: 0, z: 0 },
    });
    const secondCollection = fixture.gameplayService.collectResource({
      nodeId: secondNode.id,
      user: editor,
      position: { x: 1, y: 0, z: 1 },
    });
    assert.equal(secondCollection.progress[0].status, 'completed');

    const claimed = fixture.gameplayService.claimTask({
      taskId: task.id,
      user: editor,
    });
    assert.equal(claimed.granted, true);
    assert.equal(claimed.instance.status, 'claimed');

    const claimedAgain = fixture.gameplayService.claimTask({
      taskId: task.id,
      user: editor,
    });
    assert.equal(claimedAgain.granted, false);
    assert.equal(claimedAgain.alreadyClaimed, true);

    const inventory = fixture.gameplayService.getInventory(editor.id);
    const wood = inventory.items.find((item) => item.itemId === 'wood');
    const stone = inventory.items.find((item) => item.itemId === 'stone');
    assert.equal(wood.quantity, 4);
    assert.equal(stone.quantity, 1);
  } finally {
    fixture.databaseClient.close();
  }
});

test('inventory consumption, capacity and idempotent grants are enforced', async () => {
  const fixture = await createFixture();

  try {
    const firstGrant = fixture.gameplayService.grantItem({
      user: admin,
      targetUserId: editor.id,
      itemId: 'crystal',
      quantity: 2,
      idempotencyKey: 'grant-1',
    });
    assert.equal(firstGrant.item.quantity, 2);

    const duplicateGrant = fixture.gameplayService.grantItem({
      user: admin,
      targetUserId: editor.id,
      itemId: 'crystal',
      quantity: 2,
      idempotencyKey: 'grant-1',
    });
    assert.equal(duplicateGrant.idempotent, true);
    assert.equal(duplicateGrant.item.quantity, 2);

    fixture.gameplayService.consumeItem({
      user: editor,
      itemId: 'crystal',
      quantity: 1,
    });
    assert.throws(
      () =>
        fixture.gameplayService.consumeItem({
          user: editor,
          itemId: 'crystal',
          quantity: 2,
        }),
      {
        code: 'BP3_CONFLICT',
      },
    );

    const transactions = fixture.gameplayService.listInventoryTransactions({
      user: editor,
    });
    assert.equal(transactions.length, 2);
  } finally {
    fixture.databaseClient.close();
  }
});

test('non-admin users cannot configure events or gameplay', async () => {
  const fixture = await createFixture();

  try {
    assert.throws(
      () =>
        fixture.eventService.create({
          user: editor,
          title: '无权限事件',
          description: '不应创建',
        }),
      {
        code: 'BP3_FORBIDDEN',
      },
    );
    assert.throws(
      () =>
        fixture.gameplayService.createTask({
          user: editor,
          title: '无权限任务',
          description: '不应创建',
          targetItemId: 'wood',
          targetQuantity: 1,
        }),
      {
        code: 'BP3_FORBIDDEN',
      },
    );
  } finally {
    fixture.databaseClient.close();
  }
});
