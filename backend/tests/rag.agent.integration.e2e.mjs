import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../src/app.js';
import {
  createRagEnhancedModelClient,
  createRagClient,
} from '../src/phase4/index.js';
import { deleteCollection, ragConfig } from '../src/rag/index.js';

const realRagBaseUrl = process.env.RAG_BASE_URL || 'http://localhost:3100';
const collectionName = [
  'virtual_utopia_phase4_e2e',
  process.pid,
  Date.now(),
].join('_');
const fileName = `phase4-rag-integration-${process.pid}.md`;
const filePath = path.join(ragConfig.docsDirectory, fileName);
const fixture = [
  '# RAG与主Agent集成测试',
  '',
  '资源墙由知予负责，知识库规则要求资源分类时必须保留来源标签。',
].join('\n');

let ragCollectionCreated = false;
let forwardedRagRequests = 0;
let proxyServer;
let enabledServer;
let disabledServer;

const closeServer = (server) =>
  new Promise((resolve, reject) => {
    if (!server?.listening) {
      resolve();
      return;
    }

    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const listen = (server) =>
  new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
    server.listen(0, 'localhost');
  });

const readRequestBody = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
};

const startRagProxy = async () => {
  proxyServer = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/api/rag/query') {
      response.writeHead(404);
      response.end();
      return;
    }

    forwardedRagRequests += 1;
    const body = await readRequestBody(request);
    const upstreamResponse = await fetch(`${realRagBaseUrl}/api/rag/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    });
    const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());

    response.writeHead(upstreamResponse.status, {
      'Content-Type':
        upstreamResponse.headers.get('content-type') || 'application/json',
    });
    response.end(responseBody);
  });

  await listen(proxyServer);

  const address = proxyServer.address();

  return `http://localhost:${address.port}`;
};

const createTestAgent = ({ enabled, ragBaseUrl }) => {
  const modelRequests = [];
  const baseModelClient = {
    async createStructuredResponse({ messages }) {
      modelRequests.push({ messages });
      const systemMessage = messages[0]?.content || '';
      const userMessage = messages.at(-1)?.content || '';
      const sceneId = systemMessage.match(/当前场景：.+?（([^）]+)）/)?.[1];
      const referenceMatch = /\[参考资料 1\][\s\S]*?content:\s*([^\n]+)/.exec(
        systemMessage,
      );

      assert.ok(sceneId, 'system prompt must include scene id');

      return {
        data: {
          reply: referenceMatch
            ? `参考资料：${referenceMatch[1]}`
            : `基础回答：${userMessage}`,
          risk: 'low',
          sceneId,
          actions: [],
        },
        model: 'phase4-e2e-model',
        attempts: 1,
        latencyMs: 1,
        usage: null,
      };
    },
  };
  const ragClient = createRagClient({
    baseUrl: ragBaseUrl,
    collectionName,
    similarityThreshold: 0.2,
    topK: 3,
  });
  const modelClient = createRagEnhancedModelClient({
    modelClient: baseModelClient,
    ragClient,
    enabled,
  });
  const app = createApp({ modelClient });

  return {
    app,
    modelRequests,
  };
};

const postSceneMessage = async (baseUrl, content) => {
  const response = await fetch(`${baseUrl}/api/scene/route`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sceneId: 'resource-wall',
      input: {
        content,
      },
    }),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
};

try {
  await writeFile(filePath, fixture, 'utf8');

  const ingestResponse = await fetch(`${realRagBaseUrl}/api/rag/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      paths: [fileName],
      collectionName,
      chunkSize: 160,
      chunkOverlap: 30,
      reset: true,
    }),
  });

  assert.equal(ingestResponse.status, 200);
  ragCollectionCreated = true;

  const proxyUrl = await startRagProxy();
  const enabledAgent = createTestAgent({
    enabled: true,
    ragBaseUrl: proxyUrl,
  });
  const disabledAgent = createTestAgent({
    enabled: false,
    ragBaseUrl: proxyUrl,
  });

  enabledServer = enabledAgent.app.listen(0, 'localhost');
  disabledServer = disabledAgent.app.listen(0, 'localhost');
  await Promise.all([
    new Promise((resolve) => enabledServer.once('listening', resolve)),
    new Promise((resolve) => disabledServer.once('listening', resolve)),
  ]);

  const enabledUrl = `http://localhost:${enabledServer.address().port}`;
  const disabledUrl = `http://localhost:${disabledServer.address().port}`;
  const enabledResult = await postSceneMessage(
    enabledUrl,
    '资源如何分类并保留来源标签',
  );

  assert.equal(enabledResult.status, 200);
  assert.match(enabledResult.body.result.reply, /^参考资料：/);
  assert.equal(forwardedRagRequests, 1);
  assert.match(
    enabledAgent.modelRequests[0].messages[0].content,
    /以下是RAG知识库检索到的参考资料/,
  );
  assert.match(
    enabledAgent.modelRequests[0].messages[0].content,
    /资源墙由知予负责/,
  );

  const requestsBeforeDisabled = forwardedRagRequests;
  const disabledResult = await postSceneMessage(
    disabledUrl,
    '资源如何分类并保留来源标签',
  );

  assert.equal(disabledResult.status, 200);
  assert.match(disabledResult.body.result.reply, /^基础回答：/);
  assert.equal(forwardedRagRequests, requestsBeforeDisabled);
  assert.doesNotMatch(
    disabledAgent.modelRequests[0].messages[0].content,
    /以下是RAG知识库检索到的参考资料/,
  );

  console.log(
    JSON.stringify(
      {
        collectionName,
        enabled: {
          status: enabledResult.status,
          reply: enabledResult.body.result.reply,
          ragRequests: 1,
          referenceInjected: true,
        },
        disabled: {
          status: disabledResult.status,
          reply: disabledResult.body.result.reply,
          ragRequests: 0,
          referenceInjected: false,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await Promise.all([
    closeServer(enabledServer),
    closeServer(disabledServer),
    closeServer(proxyServer),
  ]);

  if (ragCollectionCreated) {
    await deleteCollection(collectionName);
  }

  await rm(filePath, { force: true });
}
