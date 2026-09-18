import { env } from '../config/env.js';
import {
  StructuredOutputError,
  parseStructuredOutput,
} from './structuredOutput.js';

const RETRYABLE_STATUS_CODES = new Set([
  408, 409, 425, 429, 500, 502, 503, 504,
]);

export class DeepSeekError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = options.name || 'DeepSeekError';
    this.code = options.code || 'DEEPSEEK_ERROR';
    this.statusCode = options.statusCode || 502;
    this.retryable = options.retryable || false;
    this.cause = options.cause;
  }
}

export class DeepSeekConfigurationError extends DeepSeekError {
  constructor(message) {
    super(message, {
      name: 'DeepSeekConfigurationError',
      code: 'DEEPSEEK_CONFIGURATION_ERROR',
      statusCode: 503,
    });
  }
}

export class DeepSeekOverloadedError extends DeepSeekError {
  constructor(message) {
    super(message, {
      name: 'DeepSeekOverloadedError',
      code: 'DEEPSEEK_OVERLOADED',
      statusCode: 503,
      retryable: true,
    });
  }
}

export class DeepSeekCircuitOpenError extends DeepSeekError {
  constructor(resetAt) {
    super('DeepSeek circuit breaker is open', {
      name: 'DeepSeekCircuitOpenError',
      code: 'DEEPSEEK_CIRCUIT_OPEN',
      statusCode: 503,
      retryable: true,
    });
    this.resetAt = resetAt;
  }
}

class ConcurrencyGate {
  constructor(maxConcurrent, maxQueue) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueue = maxQueue;
    this.active = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return;
    }

    if (this.queue.length >= this.maxQueue) {
      throw new DeepSeekOverloadedError('DeepSeek request queue is full');
    }

    await new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release() {
    const next = this.queue.shift();

    if (next) {
      next();
      return;
    }

    this.active = Math.max(0, this.active - 1);
  }

  async run(operation) {
    await this.acquire();

    try {
      return await operation();
    } finally {
      this.release();
    }
  }
}

class CircuitBreaker {
  constructor({ failureThreshold, resetTimeoutMs, now }) {
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.now = now;
    this.state = 'closed';
    this.failureCount = 0;
    this.nextAttemptAt = 0;
    this.probeInFlight = false;
  }

  tryAcquirePermission() {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open' && this.now() >= this.nextAttemptAt) {
      this.state = 'half-open';
      this.probeInFlight = true;
      return true;
    }

    if (this.state === 'half-open' && !this.probeInFlight) {
      this.probeInFlight = true;
      return true;
    }

    return false;
  }

  recordSuccess() {
    this.state = 'closed';
    this.failureCount = 0;
    this.nextAttemptAt = 0;
    this.probeInFlight = false;
  }

  recordFailure() {
    this.failureCount += 1;

    if (
      this.state === 'half-open' ||
      this.failureCount >= this.failureThreshold
    ) {
      this.state = 'open';
      this.nextAttemptAt = this.now() + this.resetTimeoutMs;
    }

    this.probeInFlight = false;
  }

  snapshot() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      nextAttemptAt: this.nextAttemptAt,
    };
  }
}

const defaultSleep = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const isAbortError = (error) =>
  error?.name === 'AbortError' || error?.code === 'ABORT_ERR';

const createDeepSeekError = (error) => {
  if (
    error instanceof DeepSeekError ||
    error instanceof StructuredOutputError
  ) {
    return error;
  }

  if (isAbortError(error)) {
    return new DeepSeekError('DeepSeek request timed out', {
      name: 'DeepSeekTimeoutError',
      code: 'DEEPSEEK_TIMEOUT',
      statusCode: 504,
      retryable: true,
      cause: error,
    });
  }

  return new DeepSeekError('DeepSeek network request failed', {
    name: 'DeepSeekNetworkError',
    code: 'DEEPSEEK_NETWORK_ERROR',
    statusCode: 502,
    retryable: true,
    cause: error,
  });
};

const createBackoffDelay = (attempt) =>
  Math.min(100 * 2 ** attempt, 2000) + Math.floor(Math.random() * 50);

export const createDeepSeekClient = (options = {}) => {
  const config = {
    apiKey: options.apiKey ?? env.deepSeek.apiKey,
    baseUrl: (options.baseUrl ?? env.deepSeek.baseUrl).replace(/\/+$/, ''),
    model: options.model ?? env.deepSeek.model,
    timeoutMs: options.timeoutMs ?? env.deepSeek.timeoutMs,
    maxRetries: options.maxRetries ?? env.deepSeek.maxRetries,
    maxConcurrent: options.maxConcurrent ?? env.deepSeek.maxConcurrent,
    maxQueue: options.maxQueue ?? env.deepSeek.maxQueue,
    circuitFailureThreshold:
      options.circuitFailureThreshold ?? env.deepSeek.circuitFailureThreshold,
    circuitResetMs: options.circuitResetMs ?? env.deepSeek.circuitResetMs,
  };
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const sleep = options.sleep || defaultSleep;
  const now = options.now || Date.now;
  const gate = new ConcurrencyGate(config.maxConcurrent, config.maxQueue);
  const circuitBreaker = new CircuitBreaker({
    failureThreshold: config.circuitFailureThreshold,
    resetTimeoutMs: config.circuitResetMs,
    now,
  });

  const requestOnce = async ({ messages, responseSchema }) => {
    const abortController = new AbortController();
    const timeoutId = setTimeout(
      () => abortController.abort(),
      config.timeoutMs,
    );

    try {
      const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          response_format: {
            type: 'json_object',
          },
          stream: false,
          temperature: 0.2,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();

        throw new DeepSeekError(
          `DeepSeek request failed with status ${response.status}: ${errorText}`,
          {
            name: 'DeepSeekApiError',
            code: 'DEEPSEEK_API_ERROR',
            statusCode: response.status,
            retryable: RETRYABLE_STATUS_CODES.has(response.status),
          },
        );
      }

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;

      return {
        data: parseStructuredOutput(content, responseSchema),
        model: payload.model || config.model,
        usage: payload.usage || null,
      };
    } catch (error) {
      throw createDeepSeekError(error);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const createStructuredResponse = async ({ messages, responseSchema }) => {
    if (!config.apiKey) {
      throw new DeepSeekConfigurationError(
        'DEEPSEEK_API_KEY is not configured',
      );
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new DeepSeekError('messages must be a non-empty array', {
        name: 'DeepSeekRequestError',
        code: 'DEEPSEEK_INVALID_REQUEST',
        statusCode: 400,
      });
    }

    return gate.run(async () => {
      if (!circuitBreaker.tryAcquirePermission()) {
        throw new DeepSeekCircuitOpenError(
          circuitBreaker.snapshot().nextAttemptAt,
        );
      }

      let lastError;
      const startedAt = now();

      for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
        try {
          const result = await requestOnce({ messages, responseSchema });
          circuitBreaker.recordSuccess();

          return {
            ...result,
            attempts: attempt + 1,
            latencyMs: now() - startedAt,
          };
        } catch (error) {
          lastError = createDeepSeekError(error);

          if (!lastError.retryable || attempt === config.maxRetries) {
            circuitBreaker.recordFailure();
            throw lastError;
          }

          await sleep(createBackoffDelay(attempt));
        }
      }

      circuitBreaker.recordFailure();
      throw lastError;
    });
  };

  return Object.freeze({
    createStructuredResponse,
    getCircuitState: () => circuitBreaker.snapshot(),
    model: config.model,
  });
};
