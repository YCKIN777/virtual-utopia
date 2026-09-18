import assert from 'node:assert/strict';
import test from 'node:test';
import { buildQuery, createPhase6Api } from '../services/phase6Api.js';

test('serializes Phase6 query parameters', () => {
  assert.equal(
    buildQuery({
      status: 'indexed',
      keyword: '资源墙',
      limit: 20,
      offset: 0,
      empty: '',
    }),
    '?status=indexed&keyword=%E8%B5%84%E6%BA%90%E5%A2%99&limit=20&offset=0',
  );
});

test('authenticates requests and calls the login endpoint', async () => {
  const requests = [];
  const api = createPhase6Api({
    baseUrl: 'http://phase6.test',
    getToken: () => 'token-1',
    fetchImpl: async (url, options) => {
      requests.push({
        url,
        options,
      });

      return new Response(
        JSON.stringify({
          token: 'token-1',
          user: {
            id: 1,
            role: 'admin',
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    },
  });

  await api.login({
    username: 'admin',
    password: 'secret',
  });

  assert.equal(requests[0].url, 'http://phase6.test/api/phase6/auth/login');
  assert.equal(requests[0].options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    username: 'admin',
    password: 'secret',
  });

  await api.listDocuments({
    keyword: 'guide',
  });

  assert.equal(
    requests[1].url,
    'http://phase6.test/api/phase6/documents?keyword=guide',
  );
  assert.equal(requests[1].options.headers.Authorization, 'Bearer token-1');
});

test('uploads multipart data and clears authentication on 401', async () => {
  let unauthorizedCount = 0;
  const requests = [];
  const api = createPhase6Api({
    baseUrl: 'http://phase6.test',
    getToken: () => 'expired-token',
    onUnauthorized: () => {
      unauthorizedCount += 1;
    },
    fetchImpl: async (url, options) => {
      requests.push({
        url,
        options,
      });

      return new Response(
        JSON.stringify({
          code: 'PHASE6_UNAUTHORIZED',
          message: 'expired',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    },
  });
  const formData = new FormData();

  formData.set(
    'file',
    new Blob(['# guide'], {
      type: 'text/markdown',
    }),
    'guide.md',
  );
  formData.set('collectionName', 'virtual_utopia_rag');

  await assert.rejects(
    api.uploadDocument({
      file: formData.get('file'),
      collectionName: 'virtual_utopia_rag',
    }),
    {
      code: 'PHASE6_UNAUTHORIZED',
      statusCode: 401,
    },
  );

  assert.equal(unauthorizedCount, 1);
  assert.equal(requests[0].options.headers['Content-Type'], undefined);
});
