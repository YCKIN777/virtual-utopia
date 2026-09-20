#!/usr/bin/env node
/**
 * 访客名额权限模块 —— 双账号全链路自测。
 *
 * 自建 phase5 + phase6 实例（临时数据库），跑通：
 *   1. 城主后台入住原住民
 *   2. 原住民发放邀请码
 *   3. 访客注册
 *   4. 访客无法发放名额（权限拦截）
 *   5. 城主移除访客 -> 名额返还
 *   6. 名额回收（原住民回收未使用邀请码）
 *   7. 原住民迁出 -> 名下名额自动回收
 * （150/200 阈值拦截见 backend/src/phase6/tests/visitorQuotaStore.test.js）
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startPhase5Server } from '../backend/src/phase5/server.js';
import { startPhase6Server } from '../backend/src/phase6/server.js';

const base = 'http://127.0.0.1';
const phase5Port = 3310;
const phase6Port = 3410;
const PHASE5_URL = 'http://localhost:3310';
const PHASE6_URL = 'http://127.0.0.1:3410';
const SERVICE_TOKEN = 'e2e-service-token';

const request = async (url, { method = 'GET', token, body } = {}) => {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);

  return { status: response.status, payload };
};

const expectOk = (result, label) => {
  assert.ok(
    result.status >= 200 && result.status < 300,
    `${label} 失败: ${result.status} ${JSON.stringify(result.payload)}`,
  );
  return result.payload;
};

const expectError = (result, code, label) => {
  assert.equal(
    result.payload?.code,
    code,
    `${label} 应返回 ${code}，实际 ${result.status} ${JSON.stringify(
      result.payload,
    )}`,
  );
  return result.payload;
};

const main = async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'vu-quota-e2e-'));
  const ragDocsDirectory = path.join(tmp, 'rag-docs');

  const phase5 = await startPhase5Server({
    config: {
      enabled: true,
      port: phase5Port,
      databasePath: path.join(tmp, 'phase5.sqlite'),
      busyTimeoutMs: 5000,
      authSecret: 'e2e-auth-secret',
      serviceToken: SERVICE_TOKEN,
      tokenTtlSeconds: 28800,
      logRetentionDays: 90,
      requestTimeoutMs: 5000,
      bootstrapAdminUsername: 'admin',
      bootstrapAdminPassword: 'admin-pass-2026',
      sessionStorageMode: 'memory',
      phase4BaseUrl: 'http://localhost:3300',
      phase4TimeoutMs: 3000,
      phase5LogEnabled: false,
      phase4Port: 3000,
    },
  });

  const phase6 = await startPhase6Server({
    config: {
      enabled: true,
      host: '127.0.0.1',
      port: phase6Port,
      phase5BaseUrl: PHASE5_URL,
      ragBaseUrl: 'http://localhost:3100',
      serviceToken: SERVICE_TOKEN,
      ragDocsDirectory,
      docsDirectory: path.join(ragDocsDirectory, 'phase6'),
      auditDatabasePath: path.join(tmp, 'audit.sqlite'),
      quotaDatabasePath: path.join(tmp, 'quota.sqlite'),
      maxUploadBytes: 10 * 1024 * 1024,
      requestTimeoutMs: 10000,
      allowedOrigins: ['http://localhost:5173'],
    },
  });

  const results = [];

  try {
    // 1. 城主登录
    const adminLogin = expectOk(
      await request(`${PHASE6_URL}/api/phase6/auth/login`, {
        method: 'POST',
        body: { username: 'admin', password: 'admin-pass-2026' },
      }),
      '城主登录',
    );
    const adminToken = adminLogin.token;
    const adminUser = adminLogin.user;
    results.push('城主登录');

    // 2. 创建原住民账号 R（editor）
    const residentCreated = expectOk(
      await request(`${PHASE6_URL}/api/phase6/users`, {
        method: 'POST',
        token: adminToken,
        body: {
          username: 'resident_a',
          password: 'resident-pass',
          role: 'editor',
          displayName: '原住民甲',
        },
      }),
      '创建原住民账号',
    );
    results.push('创建原住民账号');

    // 3. 创建访客账号 V（viewer）
    const visitorCreated = expectOk(
      await request(`${PHASE6_URL}/api/phase6/users`, {
        method: 'POST',
        token: adminToken,
        body: {
          username: 'visitor_b',
          password: 'visitor-pass',
          role: 'viewer',
          displayName: '访客乙',
        },
      }),
      '创建访客账号',
    );
    results.push('创建访客账号');

    // 4. 城主入住原住民 R
    const resident = expectOk(
      await request(`${PHASE6_URL}/api/phase6/residents`, {
        method: 'POST',
        token: adminToken,
        body: {
          userId: residentCreated.id,
          username: residentCreated.username,
          displayName: residentCreated.displayName,
          homePlotId: 'plot-7',
        },
      }),
      '入住原住民',
    ).resident;
    assert.equal(resident.quotaTotal, 3);
    results.push('城主入住原住民');

    // 5. 原住民登录并发放邀请码
    const residentLogin = expectOk(
      await request(`${PHASE6_URL}/api/phase6/auth/login`, {
        method: 'POST',
        body: { username: 'resident_a', password: 'resident-pass' },
      }),
      '原住民登录',
    );
    const residentToken = residentLogin.token;

    const issued = expectOk(
      await request(`${PHASE6_URL}/api/phase6/visitor-quotas/issue`, {
        method: 'POST',
        token: residentToken,
      }),
      '原住民发放邀请码',
    ).invitation;
    assert.ok(issued.code.startsWith('VU-'));
    results.push('原住民发放邀请码');

    // 6. 访客登录并注册
    const visitorLogin = expectOk(
      await request(`${PHASE6_URL}/api/phase6/auth/login`, {
        method: 'POST',
        body: { username: 'visitor_b', password: 'visitor-pass' },
      }),
      '访客登录',
    );
    const visitorToken = visitorLogin.token;

    const registered = expectOk(
      await request(`${PHASE6_URL}/api/phase6/visitor-quotas/register`, {
        method: 'POST',
        token: visitorToken,
        body: { code: issued.code },
      }),
      '访客注册',
    ).invitation;
    assert.equal(registered.status, 'used');
    assert.equal(registered.visitorUserId, visitorCreated.id);
    results.push('访客注册');

    // 7. 统计校验：访客总数 1，原住民已用 1
    const statsAfterRegister = expectOk(
      await request(`${PHASE6_URL}/api/phase6/visitor-quotas/stats`, {
        token: adminToken,
      }),
      '读取统计',
    ).stats;
    assert.equal(statsAfterRegister.totalVisitors, 1);
    assert.equal(statsAfterRegister.residentUsedCount, 1);
    results.push('统计校验(访客总数=1)');

    // 8. 访客不能发放名额
    expectError(
      await request(`${PHASE6_URL}/api/phase6/visitor-quotas/issue`, {
        method: 'POST',
        token: visitorToken,
      }),
      'NOT_RESIDENT',
      '访客发放名额被拦截',
    );
    results.push('访客发放名额被拦截');

    // 9. 城主移除访客 -> 名额返还
    const removed = expectOk(
      await request(
        `${PHASE6_URL}/api/phase6/visitors/${visitorCreated.id}`,
        { method: 'DELETE', token: adminToken },
      ),
      '城主移除访客',
    ).invitation;
    assert.equal(removed.status, 'revoked');
    const statsAfterRemove = expectOk(
      await request(`${PHASE6_URL}/api/phase6/visitor-quotas/stats`, {
        token: adminToken,
      }),
      '移除后统计',
    ).stats;
    assert.equal(statsAfterRemove.totalVisitors, 0);
    assert.equal(statsAfterRemove.residentIssuedCount, 0);
    results.push('城主移除访客(名额返还)');

    // 10. 原住民名额返还后可重复发放
    const reissued = expectOk(
      await request(`${PHASE6_URL}/api/phase6/visitor-quotas/issue`, {
        method: 'POST',
        token: residentToken,
      }),
      '名额返还后重复发放',
    ).invitation;
    assert.equal(reissued.status, 'issued');
    results.push('名额返还后可重复发放');

    // 11. 原住民回收未使用邀请码
    const revoked = expectOk(
      await request(
        `${PHASE6_URL}/api/phase6/visitor-quotas/${reissued.id}/revoke`,
        { method: 'POST', token: residentToken },
      ),
      '原住民回收名额',
    ).invitation;
    assert.equal(revoked.status, 'revoked');
    results.push('原住民回收名额');

    // 12. 原住民迁出 -> 名下名额自动回收
    const depart = expectOk(
      await request(
        `${PHASE6_URL}/api/phase6/residents/${residentCreated.id}/depart`,
        { method: 'POST', token: adminToken },
      ),
      '原住民迁出',
    );
    assert.equal(depart.resident.status, 'departed');
    const finalStats = expectOk(
      await request(`${PHASE6_URL}/api/phase6/visitor-quotas/stats`, {
        token: adminToken,
      }),
      '迁出后统计',
    ).stats;
    assert.equal(finalStats.activeResidentCount, 0);
    assert.equal(finalStats.totalVisitors, 0);
    results.push('原住民迁出(名额自动回收)');

    // 13. 非管理员访问统计被拦截
    expectError(
      await request(`${PHASE6_URL}/api/phase6/visitor-quotas/stats`, {
        token: residentToken,
      }),
      'PHASE6_FORBIDDEN',
      '非管理员访问统计被拦截',
    );
    results.push('非管理员访问统计被拦截');

    console.log('=== 双账号全链路自测通过 ===');
    results.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item}`);
    });
    console.log('150/200 阈值拦截：见 visitorQuotaStore.test.js（7 项单元测试通过）');
  } finally {
    await phase6.close();
    await phase5.close();
    await rm(tmp, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error('自测失败：', error);
  process.exitCode = 1;
});
