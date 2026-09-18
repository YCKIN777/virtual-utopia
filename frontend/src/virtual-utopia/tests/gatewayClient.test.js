import assert from 'node:assert/strict';
import test from 'node:test';
import { checkGateway } from '../services/gatewayClient.js';

test('reports the Phase6 gateway as online', async () => {
  const result = await checkGateway({
    baseUrl: 'http://phase6.test',
    fetchImpl: async (url) => {
      assert.equal(url, 'http://phase6.test/api/phase6/health');

      return new Response(
        JSON.stringify({
          service: 'virtual-utopia-phase6',
          status: 'ok',
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

  assert.deepEqual(result, {
    online: true,
    service: 'virtual-utopia-phase6',
    status: 'ok',
  });
});

test('falls back to offline mode when the gateway is unavailable', async () => {
  const result = await checkGateway({
    baseUrl: 'http://phase6.test',
    fetchImpl: async () => {
      throw new Error('network unavailable');
    },
  });

  assert.deepEqual(result, {
    online: false,
    service: null,
    status: 'unavailable',
  });
});
