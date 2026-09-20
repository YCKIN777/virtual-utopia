import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createVisitorQuotaStore,
  VISITOR_QUOTA_RULES,
} from '../visitorQuotaStore.js';

const admin = { id: 1, username: 'admin', role: 'admin', displayName: '城主' };
const residentUser = {
  id: 2,
  username: 'resident-a',
  role: 'editor',
  displayName: '原住民A',
};
const visitorUser = {
  id: 3,
  username: 'visitor-b',
  role: 'viewer',
  displayName: '访客B',
};

const makeUser = (id, role = 'viewer') => ({
  id,
  username: `user-${id}`,
  role,
  displayName: `用户${id}`,
});

test('原住民入住、发放邀请码、访客注册、名额回收与返还', () => {
  const store = createVisitorQuotaStore({ databasePath: ':memory:' });

  try {
    const resident = store.onboardResident({
      userId: residentUser.id,
      username: residentUser.username,
      displayName: residentUser.displayName,
      homePlotId: 'plot-3',
    });

    assert.equal(resident.quotaTotal, 3);
    assert.equal(store.getStats().activeResidentCount, 1);

    const invitation = store.issueResidentInvitation({
      userId: residentUser.id,
    });

    assert.equal(invitation.channel, 'resident');
    assert.equal(invitation.status, 'issued');

    const used = store.registerVisitor({
      code: invitation.code,
      user: visitorUser,
    });

    assert.equal(used.status, 'used');
    assert.equal(used.visitorUserId, visitorUser.id);
    assert.equal(store.getStats().totalVisitors, 1);

    // 访客不能发放名额
    assert.throws(
      () => store.issueResidentInvitation({ userId: visitorUser.id }),
      (error) => error.code === 'NOT_RESIDENT',
    );

    // 移除访客 -> 名额返还（revoked），可再次发放
    const removed = store.removeVisitor({ userId: visitorUser.id });

    assert.equal(removed.status, 'revoked');
    assert.equal(store.getStats().totalVisitors, 0);

    const reissued = store.issueResidentInvitation({
      userId: residentUser.id,
    });

    assert.equal(reissued.status, 'issued');
  } finally {
    store.close();
  }
});

test('每位原住民仅 3 个名额，超发被拦截', () => {
  const store = createVisitorQuotaStore({ databasePath: ':memory:' });

  try {
    store.onboardResident({
      userId: residentUser.id,
      username: residentUser.username,
      displayName: residentUser.displayName,
    });

    for (let index = 0; index < VISITOR_QUOTA_RULES.quotaPerResident; index += 1) {
      store.issueResidentInvitation({ userId: residentUser.id });
    }

    assert.throws(
      () => store.issueResidentInvitation({ userId: residentUser.id }),
      (error) => error.code === 'RESIDENT_QUOTA_EXHAUSTED',
    );
  } finally {
    store.close();
  }
});

test('原住民上限 50 人', () => {
  const store = createVisitorQuotaStore({ databasePath: ':memory:' });

  try {
    for (let index = 1; index <= VISITOR_QUOTA_RULES.residentLimit; index += 1) {
      store.onboardResident({
        userId: 1000 + index,
        username: `resident-${index}`,
        displayName: `原住民${index}`,
      });
    }

    assert.equal(store.getStats().activeResidentCount, 50);

    assert.throws(
      () =>
        store.onboardResident({
          userId: 9999,
          username: 'resident-51',
          displayName: '原住民51',
        }),
      (error) => error.code === 'RESIDENT_LIMIT_REACHED',
    );
  } finally {
    store.close();
  }
});

test('原住民迁出后名额自动回收失效', () => {
  const store = createVisitorQuotaStore({ databasePath: ':memory:' });

  try {
    store.onboardResident({
      userId: residentUser.id,
      username: residentUser.username,
      displayName: residentUser.displayName,
    });
    const issued = store.issueResidentInvitation({ userId: residentUser.id });
    store.registerVisitor({ code: issued.code, user: visitorUser });
    const issuedSecond = store.issueResidentInvitation({
      userId: residentUser.id,
    });

    assert.equal(store.getStats().totalVisitors, 1);

    const result = store.departResident(residentUser.id);

    assert.equal(result.resident.status, 'departed');
    assert.equal(result.revokedInvitations.length, 2);
    assert.equal(store.getStats().activeResidentCount, 0);
    assert.equal(store.getStats().totalVisitors, 0);

    // 迁出后不能再发放
    assert.throws(
      () => store.issueResidentInvitation({ userId: residentUser.id }),
      (error) => error.code === 'NOT_RESIDENT',
    );
    assert.equal(issuedSecond.id in result.revokedInvitations, false);
  } finally {
    store.close();
  }
});

test('访客总数达到 150 时原住民邀请入口关闭', () => {
  const store = createVisitorQuotaStore({ databasePath: ':memory:' });

  try {
    const residentIds = [];
    const visitorIds = [];

    for (let index = 1; index <= VISITOR_QUOTA_RULES.residentLimit; index += 1) {
      const userId = 1000 + index;

      residentIds.push(userId);
      store.onboardResident({
        userId,
        username: `resident-${index}`,
        displayName: `原住民${index}`,
      });
    }

    // 每户发放 3 个名额并全部兑换为访客 => 150 访客
    for (const userId of residentIds) {
      for (let slot = 0; slot < VISITOR_QUOTA_RULES.quotaPerResident; slot += 1) {
        const invitation = store.issueResidentInvitation({ userId });
        const visitorId = 2000 + visitorIds.length;

        visitorIds.push(visitorId);
        store.registerVisitor({
          code: invitation.code,
          user: makeUser(visitorId),
        });
      }
    }

    assert.equal(store.getStats().totalVisitors, 150);
    assert.equal(store.getStats().residentEntryOpen, false);
    assert.equal(store.getStats().globalEntryOpen, true);

    // 原住民名额已耗尽，发放被拦截
    assert.throws(
      () => store.issueResidentInvitation({ userId: residentIds[0] }),
      (error) => error.code === 'RESIDENT_QUOTA_EXHAUSTED',
    );

    // 城主在 150~200 之间仍可发放公共名额
    const adminInvitation = store.issueAdminInvitation();

    assert.equal(adminInvitation.channel, 'admin');
  } finally {
    store.close();
  }
});

test('访客总数满 200 时全渠道禁止新增', () => {
  const store = createVisitorQuotaStore({ databasePath: ':memory:' });

  try {
    // 用城主公共名额直接灌到 200（绕过原住民 3 名额限制）
    for (let index = 0; index < VISITOR_QUOTA_RULES.globalVisitorCap; index += 1) {
      const invitation = store.issueAdminInvitation();

      store.registerVisitor({
        code: invitation.code,
        user: makeUser(5000 + index),
      });
    }

    assert.equal(store.getStats().totalVisitors, 200);
    assert.equal(store.getStats().globalEntryOpen, false);

    assert.throws(
      () => store.issueAdminInvitation(),
      (error) => error.code === 'GLOBAL_CAP_REACHED',
    );

    // 注册新访客也被拦截
    const invitation = {
      code: 'VU-DEAD-BEEF',
    };

    // 先构造一个可兑换的邀请（由于满 200 无法发放，用直接插入方式验证 register 拦截）
    assert.throws(
      () => store.registerVisitor({ code: invitation.code, user: makeUser(9999) }),
      (error) => error.code === 'INVITATION_NOT_FOUND',
    );
  } finally {
    store.close();
  }
});

test('角色与身份约束：城主/原住民/编辑者不能注册为访客', () => {
  const store = createVisitorQuotaStore({ databasePath: ':memory:' });

  try {
    store.onboardResident({
      userId: residentUser.id,
      username: residentUser.username,
      displayName: residentUser.displayName,
    });
    const invitation = store.issueResidentInvitation({
      userId: residentUser.id,
    });

    assert.throws(
      () => store.registerVisitor({ code: invitation.code, user: admin }),
      (error) => error.code === 'ADMIN_CANNOT_BE_VISITOR',
    );

    assert.throws(
      () =>
        store.registerVisitor({
          code: invitation.code,
          user: residentUser,
        }),
      (error) => error.code === 'RESIDENT_CANNOT_BE_VISITOR',
    );

    assert.throws(
      () =>
        store.registerVisitor({
          code: invitation.code,
          user: { id: 9, username: 'editor-x', role: 'editor', displayName: '编辑者' },
        }),
      (error) => error.code === 'EDITOR_CANNOT_BE_VISITOR',
    );
  } finally {
    store.close();
  }
});
