#!/usr/bin/env node
/**
 * 访客名额权限模块 —— Playwright 无头 UI 自测。
 *
 * 自建 phase5(3301) + phase6(3401) + 静态服务前端 dist，验证：
 *   1. 城主后台「访客名额」面板渲染 + 0 控制台报错
 *   2. 原住民侧边栏「访客邀请」子页面渲染 + 0 控制台报错
 * 截图留存在 H:/BP2/vu_screens/。
 *
 * 前端静态服务端口从环境变量读取（避免与运行中的 vite dev 冲突）：
 *   VU_WORLD_UI_PORT（默认 5199）、VU_ADMIN_UI_PORT（默认 5198）。
 * 前端 dist 产物构建时写死了网关地址 http://localhost:3400，本测试会在
 * 运行时把 JS 产物中的该地址重写到自建 phase6（127.0.0.1:3401），
 * 保证浏览器 UI 登录/请求落到本测试的后端实例，避免 waitForURL 超时。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { startPhase5Server } from '../backend/src/phase5/server.js';
import { startPhase6Server } from '../backend/src/phase6/server.js';

const PHASE5_URL = 'http://localhost:3301';
const PHASE6_URL = 'http://127.0.0.1:3401';
const SCREEN_DIR = path.resolve('vu_screens');

// 前端静态服务端口：从环境变量读取，避免与运行中的 vite dev(5199) 冲突。
const WORLD_UI_PORT = Number(process.env.VU_WORLD_UI_PORT) || 5199;
const ADMIN_UI_PORT = Number(process.env.VU_ADMIN_UI_PORT) || 5198;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.json': 'application/json',
};

const startStaticServer = (root, port) =>
  new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
      const filePath = path.join(root, relative);

      fs.readFile(filePath, (error, data) => {
        if (error) {
          fs.readFile(path.join(root, 'index.html'), (fallbackError, fallback) => {
            if (fallbackError) {
              res.writeHead(404);
              res.end();
              return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(fallback);
          });
          return;
        }
        const ext = path.extname(filePath);
        const contentType = MIME[ext] || 'application/octet-stream';

        // 前端 dist 构建时写死了网关地址 http://localhost:3400，
        // 而本测试自建 phase6 在 127.0.0.1:3401 —— 对 JS 产物运行时重写，
        // 让浏览器 UI 的请求落到本测试后端实例（修复登录 waitForURL 超时）。
        const body =
          ext === '.js'
            ? data
                .toString('utf8')
                .replaceAll('http://localhost:3400', PHASE6_URL)
            : data;

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(body);
      });
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });

const request = async (url, { method = 'GET', token, body } = {}) => {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, payload: await response.json().catch(() => null) };
};

const main = async () => {
  await mkdir(SCREEN_DIR, { recursive: true });
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'vu-quota-ui-'));
  const ragDocsDirectory = path.join(tmp, 'rag-docs');

  const phase5 = await startPhase5Server({
    config: {
      enabled: true,
      port: 3301,
      databasePath: path.join(tmp, 'phase5.sqlite'),
      busyTimeoutMs: 5000,
      authSecret: 'e2e-auth-secret',
      serviceToken: 'e2e-service-token',
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
      port: 3401,
      phase5BaseUrl: PHASE5_URL,
      ragBaseUrl: 'http://localhost:3100',
      serviceToken: 'e2e-service-token',
      ragDocsDirectory,
      docsDirectory: path.join(ragDocsDirectory, 'phase6'),
      auditDatabasePath: path.join(tmp, 'audit.sqlite'),
      quotaDatabasePath: path.join(tmp, 'quota.sqlite'),
      maxUploadBytes: 10 * 1024 * 1024,
      requestTimeoutMs: 10000,
      allowedOrigins: [
        'http://localhost:5173',
        `http://127.0.0.1:${ADMIN_UI_PORT}`,
        `http://127.0.0.1:${WORLD_UI_PORT}`,
      ],
    },
  });

  const worldServer = await startStaticServer(
    path.resolve('frontend/src/virtual-utopia/dist'),
    WORLD_UI_PORT,
  );
  const adminServer = await startStaticServer(
    path.resolve('frontend/src/phase6/dist'),
    ADMIN_UI_PORT,
  );
  const worldUrl = `http://127.0.0.1:${worldServer.address().port}`;
  const adminUrl = `http://127.0.0.1:${adminServer.address().port}`;

  let browser;

  try {
    // 种子数据：admin 登录 -> 创建并入住原住民 -> 原住民发放邀请码
    const adminLogin = await request(`${PHASE6_URL}/api/phase6/auth/login`, {
      method: 'POST',
      body: { username: 'admin', password: 'admin-pass-2026' },
    });
    const adminToken = adminLogin.payload.token;

    const residentCreated = await request(`${PHASE6_URL}/api/phase6/users`, {
      method: 'POST',
      token: adminToken,
      body: {
        username: 'resident_a',
        password: 'resident-pass',
        role: 'editor',
        displayName: '原住民甲',
      },
    });

    await request(`${PHASE6_URL}/api/phase6/residents`, {
      method: 'POST',
      token: adminToken,
      body: {
        userId: residentCreated.payload.id,
        username: 'resident_a',
        displayName: '原住民甲',
        homePlotId: 'plot-7',
      },
    });

    const residentLogin = await request(`${PHASE6_URL}/api/phase6/auth/login`, {
      method: 'POST',
      body: { username: 'resident_a', password: 'resident-pass' },
    });
    await request(`${PHASE6_URL}/api/phase6/visitor-quotas/issue`, {
      method: 'POST',
      token: residentLogin.payload.token,
    });

    // 创建访客账号（viewer）用于验证「访客注册」入口
    await request(`${PHASE6_URL}/api/phase6/users`, {
      method: 'POST',
      token: adminToken,
      body: {
        username: 'visitor_b',
        password: 'visitor-pass',
        role: 'viewer',
        displayName: '访客乙',
      },
    });

    browser = await chromium.launch({
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
    });

    // ===== 城主后台 =====
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const adminErrors = [];
    adminPage.on('console', (message) => {
      if (message.type() === 'error') adminErrors.push(message.text());
    });
    adminPage.on('pageerror', (error) => adminErrors.push(String(error)));

    await adminPage.goto(`${adminUrl}/#/login`, { waitUntil: 'networkidle' });
    await adminPage.fill('input[name="username"]', 'admin');
    await adminPage.fill('input[name="password"]', 'admin-pass-2026');
    await adminPage.click('button[type="submit"]');
    await adminPage.waitForURL(/#\/documents/, { timeout: 15000 });
    await adminPage.click('a:has-text("访客名额")');
    await adminPage.waitForSelector('text=访客名额统计', { timeout: 15000 });
    await adminPage.waitForSelector('.quota-stat-grid', { timeout: 15000 });
    await adminPage.screenshot({
      path: path.join(SCREEN_DIR, 'visitor_quota_admin.png'),
      fullPage: true,
    });
    assert.equal(adminErrors.length, 0, `管理台控制台报错: ${adminErrors.join(' | ')}`);
    await adminContext.close();

    // ===== 原住民侧边栏「访客邀请」 =====
    const worldContext = await browser.newContext();
    const worldPage = await worldContext.newPage();
    const worldErrors = [];
    worldPage.on('console', (message) => {
      if (message.type() === 'error') worldErrors.push(message.text());
    });
    worldPage.on('pageerror', (error) => worldErrors.push(String(error)));

    await worldPage.goto(`${worldUrl}/#/login`, { waitUntil: 'networkidle' });
    await worldPage.fill('input[placeholder="traveler"]', 'resident_a');
    await worldPage.fill('input[placeholder="utopia2026"]', 'resident-pass');
    await worldPage.click('button[type="submit"]');
    await worldPage.waitForURL(/#\/profile/, { timeout: 15000 });
    await worldPage.goto(`${worldUrl}/#/world`, { waitUntil: 'domcontentloaded' });

    await worldPage.waitForSelector('button:has-text("访客邀请")', {
      timeout: 60000,
    });
    await worldPage.addStyleTag({
      content: '.vu-world-loading { display: none !important; }',
    });
    await worldPage.click('button:has-text("访客邀请")', { force: true });
    await worldPage.waitForTimeout(800);
    await worldPage.screenshot({
      path: path.join(SCREEN_DIR, 'visitor_quota_world.png'),
      fullPage: true,
    });
    assert.equal(
      worldErrors.length,
      0,
      `原住民侧边栏控制台报错: ${worldErrors.join(' | ')}`,
    );
    await worldContext.close();

    // ===== 访客（非原住民）侧边栏「访客注册」入口 =====
    const visitorContext = await browser.newContext();
    const visitorPage = await visitorContext.newPage();
    const visitorErrors = [];
    visitorPage.on('console', (message) => {
      if (message.type() === 'error') visitorErrors.push(message.text());
    });
    visitorPage.on('pageerror', (error) => visitorErrors.push(String(error)));

    await visitorPage.goto(`${worldUrl}/#/login`, { waitUntil: 'networkidle' });
    await visitorPage.fill('input[placeholder="traveler"]', 'visitor_b');
    await visitorPage.fill('input[placeholder="utopia2026"]', 'visitor-pass');
    await visitorPage.click('button[type="submit"]');
    await visitorPage.waitForURL(/#\/profile/, { timeout: 15000 });
    await visitorPage.goto(`${worldUrl}/#/world`, { waitUntil: 'domcontentloaded' });

    await visitorPage.waitForSelector('button:has-text("访客注册")', {
      timeout: 60000,
    });
    await visitorPage.addStyleTag({
      content: '.vu-world-loading { display: none !important; }',
    });
    await visitorPage.screenshot({
      path: path.join(SCREEN_DIR, 'visitor_register_world.png'),
      fullPage: true,
    });
    assert.equal(
      visitorErrors.length,
      0,
      `访客侧边栏控制台报错: ${visitorErrors.join(' | ')}`,
    );
    await visitorContext.close();

    console.log('=== Playwright 无头 UI 自测通过 ===');
    console.log(`管理台 0 控制台报错，截图: ${SCREEN_DIR}/visitor_quota_admin.png`);
    console.log(`原住民侧边栏 0 控制台报错，截图: ${SCREEN_DIR}/visitor_quota_world.png`);
    console.log(`访客注册入口 0 控制台报错，截图: ${SCREEN_DIR}/visitor_register_world.png`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => worldServer.close(resolve));
    await new Promise((resolve) => adminServer.close(resolve));
    await phase6.close();
    await phase5.close();
    await rm(tmp, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error('UI 自测失败：', error);
  process.exitCode = 1;
});
