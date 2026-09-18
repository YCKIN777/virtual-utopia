import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const phase6Directory = path.resolve(rootDirectory, '..');
const viteConfigPath = path.join(phase6Directory, 'vite.config.js');
const browserCandidates = [
  process.env.PLAYWRIGHT_BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

const documents = [
  {
    id: 1,
    documentKey: 'resource-wall-guide',
    title: '资源墙规则',
    sourcePath: 'resource-wall-guide.md',
    fileName: 'resource-wall-guide.md',
    mimeType: 'text/markdown',
    contentHash: 'hash-1',
    chunkCount: 4,
    collectionName: 'virtual_utopia_rag',
    status: 'indexed',
    metadata: {
      category: 'resource',
    },
    createdBy: 1,
    createdAt: '2026-09-16T10:00:00.000Z',
    updatedAt: '2026-09-16T10:00:00.000Z',
  },
];
const sessions = [
  {
    id: 'pub_yard',
    userId: 1,
    sceneId: 'yard',
    sessionType: 'public',
    ownerAgentId: 'ahe',
    title: '大院会话',
    messages: [],
    status: 'active',
    createdAt: '2026-09-16T10:00:00.000Z',
    updatedAt: '2026-09-16T10:00:00.000Z',
    expiresAt: '2026-09-16T12:00:00.000Z',
  },
];
const requests = [];

const fulfillJson = (route, status, payload) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });

const launchBrowser = async () => {
  const executablePath = browserCandidates.find((candidate) =>
    existsSync(candidate),
  );

  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
};

const viteServer = await createViteServer({
  root: phase6Directory,
  configFile: viteConfigPath,
  logLevel: 'silent',
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
});
let browser;

try {
  await viteServer.listen();
  browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: {
      width: 1366,
      height: 900,
    },
  });
  const pageErrors = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  await page.route('http://localhost:3400/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    requests.push({
      method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
    });

    if (url.pathname === '/api/phase6/auth/login' && method === 'POST') {
      await fulfillJson(route, 200, {
        token: 'admin-token',
        expiresAt: '2026-09-17T00:00:00.000Z',
        user: {
          id: 1,
          username: 'admin',
          role: 'admin',
          displayName: '管理员',
        },
      });
      return;
    }

    if (url.pathname === '/api/phase6/auth/me' && method === 'GET') {
      await fulfillJson(route, 200, {
        id: 1,
        username: 'admin',
        role: 'admin',
        displayName: '管理员',
      });
      return;
    }

    if (url.pathname === '/api/phase6/documents' && method === 'GET') {
      await fulfillJson(route, 200, {
        documents,
      });
      return;
    }

    if (url.pathname === '/api/phase6/documents/1' && method === 'GET') {
      await fulfillJson(route, 200, documents[0]);
      return;
    }

    if (url.pathname === '/api/phase6/documents/upload' && method === 'POST') {
      await fulfillJson(route, 201, {
        document: {
          ...documents[0],
          id: 2,
          title: 'Phase6 E2E',
        },
        ingest: {
          documents: 1,
          chunks: 2,
          ids: ['a', 'b'],
        },
      });
      return;
    }

    if (url.pathname === '/api/phase6/documents/1' && method === 'DELETE') {
      await fulfillJson(route, 200, {
        documentId: 1,
        metadataDeleted: true,
        vectorCleanup: false,
      });
      return;
    }

    if (url.pathname === '/api/phase6/sessions' && method === 'GET') {
      await fulfillJson(route, 200, {
        sessions,
      });
      return;
    }

    if (url.pathname === '/api/phase6/sessions/pub_yard' && method === 'GET') {
      await fulfillJson(route, 200, {
        ...sessions[0],
        messages: [
          {
            role: 'user',
            content: '你好',
          },
          {
            role: 'assistant',
            content: '你好，我是阿禾。',
          },
        ],
      });
      return;
    }

    await fulfillJson(route, 404, {
      code: 'PHASE6_NOT_FOUND',
      message: 'route not found',
    });
  });

  const address = viteServer.httpServer.address();
  const frontendUrl = `http://127.0.0.1:${address.port}`;

  await page.goto(frontendUrl, {
    waitUntil: 'networkidle',
  });
  await page
    .getByRole('heading', {
      name: '管理台登录',
    })
    .waitFor();
  await page.getByPlaceholder('请输入用户名').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('secret');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/#/documents');
  await page
    .getByRole('heading', {
      name: '文档管理',
    })
    .waitFor();
  await page.getByText('资源墙规则').waitFor();

  await page.getByPlaceholder('标题、来源或文件名').fill('资源墙');
  const filterResponse = page.waitForResponse((response) =>
    response.url().includes('/api/phase6/documents?'),
  );
  await page.getByRole('button', { name: '查询' }).click();
  await filterResponse;
  assert.equal(
    requests
      .filter((request) => request.path === '/api/phase6/documents')
      .at(-1).query.keyword,
    '资源墙',
  );

  await page.getByRole('button', { name: '查看文档详情' }).click();
  await page
    .getByRole('heading', {
      name: '文档详情',
    })
    .waitFor();
  await page.getByRole('button', { name: '关闭' }).click();

  await page.getByRole('button', { name: '上传文档' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'phase6-e2e.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Phase6 E2E', 'utf8'),
  });
  await page.getByPlaceholder('文档标题').fill('Phase6 E2E');
  const uploadResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/documents/upload') &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', {
      name: '上传',
      exact: true,
    })
    .click();
  assert.equal((await uploadResponse).status(), 201);

  await page.getByRole('link', { name: '历史会话' }).click();
  await page.waitForURL('**/#/sessions');
  await page
    .getByRole('heading', {
      name: '历史会话',
    })
    .waitFor();
  await page.getByText('大院会话').waitFor();
  await page
    .getByRole('button', {
      name: '查看消息',
    })
    .click();
  await page.getByText('你好，我是阿禾。').waitFor();

  assert.deepEqual(pageErrors, []);

  console.log(
    JSON.stringify(
      {
        login: 'passed',
        documentFilter: 'passed',
        documentDetail: 'passed',
        upload: 'passed',
        sessionFilters: 'passed',
        sessionMessages: 'passed',
        pageErrors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close().catch(() => {});
  await viteServer.close();
}
