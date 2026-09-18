import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DeepSeekCircuitOpenError,
  DeepSeekOverloadedError,
  createDeepSeekClient,
} from '../src/services/deepSeekClient.js';

const responseSchema = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    sceneId: { type: 'string' },
  },
  required: ['reply', 'sceneId'],
  additionalProperties: false,
};

const messages = [
  {
    role: 'user',
    content: '测试消息',
  },
];

const createModelResponse = (data, status = 200) =>
  new Response(
    JSON.stringify({
      model: 'deepseek-chat',
      choices: [
        {
          message: {
            content: JSON.stringify(data),
          },
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
      },
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );

test('returns validated structured output', async () => {
  let requestCount = 0;
  const expected = {
    reply: '收到',
    sceneId: 'yard',
  };
  const client = createDeepSeekClient({
    apiKey: 'test-key',
    baseUrl: 'https://example.test',
    maxRetries: 0,
    fetchImpl: async (_url, options) => {
      requestCount += 1;
      const body = JSON.parse(options.body);

      assert.equal(body.response_format.type, 'json_object');
      assert.equal(body.messages[0].content, '测试消息');

      return createModelResponse(expected);
    },
  });

  const result = await client.createStructuredResponse({
    messages,
    responseSchema,
  });

  assert.equal(requestCount, 1);
  assert.deepEqual(result.data, expected);
  assert.equal(result.attempts, 1);
  assert.equal(result.model, 'deepseek-chat');
});

test('retries retryable API failures', async () => {
  let requestCount = 0;
  const client = createDeepSeekClient({
    apiKey: 'test-key',
    baseUrl: 'https://example.test',
    maxRetries: 1,
    sleep: async () => {},
    fetchImpl: async () => {
      requestCount += 1;

      if (requestCount === 1) {
        return new Response('rate limited', {
          status: 429,
        });
      }

      return createModelResponse({
        reply: '重试成功',
        sceneId: 'yard',
      });
    },
  });

  const result = await client.createStructuredResponse({
    messages,
    responseSchema,
  });

  assert.equal(requestCount, 2);
  assert.equal(result.attempts, 2);
});

test('maps aborted requests to timeout errors', async () => {
  const client = createDeepSeekClient({
    apiKey: 'test-key',
    baseUrl: 'https://example.test',
    timeoutMs: 5,
    maxRetries: 0,
    fetchImpl: async (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
  });

  await assert.rejects(
    client.createStructuredResponse({
      messages,
      responseSchema,
    }),
    {
      code: 'DEEPSEEK_TIMEOUT',
      statusCode: 504,
    },
  );
});

test('opens the circuit after repeated final failures', async () => {
  let requestCount = 0;
  const client = createDeepSeekClient({
    apiKey: 'test-key',
    baseUrl: 'https://example.test',
    maxRetries: 0,
    circuitFailureThreshold: 1,
    circuitResetMs: 60000,
    fetchImpl: async () => {
      requestCount += 1;
      return new Response('service unavailable', {
        status: 503,
      });
    },
  });

  await assert.rejects(
    client.createStructuredResponse({
      messages,
      responseSchema,
    }),
    {
      code: 'DEEPSEEK_API_ERROR',
    },
  );

  await assert.rejects(
    client.createStructuredResponse({
      messages,
      responseSchema,
    }),
    DeepSeekCircuitOpenError,
  );

  assert.equal(requestCount, 1);
  assert.equal(client.getCircuitState().state, 'open');
});

test('rejects requests when the concurrency queue is full', async () => {
  let releaseFirstRequest;
  let requestCount = 0;
  const client = createDeepSeekClient({
    apiKey: 'test-key',
    baseUrl: 'https://example.test',
    maxConcurrent: 1,
    maxQueue: 0,
    maxRetries: 0,
    fetchImpl: async () => {
      requestCount += 1;

      return new Promise((resolve) => {
        releaseFirstRequest = () =>
          resolve(
            createModelResponse({
              reply: '完成',
              sceneId: 'yard',
            }),
          );
      });
    },
  });

  const firstRequest = client.createStructuredResponse({
    messages,
    responseSchema,
  });

  await new Promise((resolve) => setImmediate(resolve));

  await assert.rejects(
    client.createStructuredResponse({
      messages,
      responseSchema,
    }),
    DeepSeekOverloadedError,
  );

  releaseFirstRequest();
  await firstRequest;

  assert.equal(requestCount, 1);
});

test('rejects output that does not match the schema', async () => {
  const client = createDeepSeekClient({
    apiKey: 'test-key',
    baseUrl: 'https://example.test',
    maxRetries: 0,
    fetchImpl: async () =>
      createModelResponse({
        reply: '字段缺失',
      }),
  });

  await assert.rejects(
    client.createStructuredResponse({
      messages,
      responseSchema,
    }),
    {
      code: 'STRUCTURED_OUTPUT_ERROR',
    },
  );
});
