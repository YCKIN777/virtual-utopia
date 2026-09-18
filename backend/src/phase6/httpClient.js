import { Phase6Error, Phase6UpstreamError } from './errors.js';

const parsePayload = async (response) => {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      error: 'InvalidUpstreamResponse',
      code: 'PHASE6_INVALID_UPSTREAM_RESPONSE',
      message: text,
    };
  }
};

export const createHttpClient = ({
  fetchImpl = globalThis.fetch,
  timeoutMs = 10000,
} = {}) => {
  const requestJson = async (
    url,
    { method = 'GET', headers = {}, body } = {},
  ) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    let payload;

    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      payload = await parsePayload(response);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Phase6Error('upstream request timed out', {
          code: 'REQUEST_TIMEOUT',
          statusCode: 504,
          cause: error,
        });
      }

      throw new Phase6UpstreamError(
        error.message || 'upstream request failed',
        {
          code: 'PHASE6_UPSTREAM_UNAVAILABLE',
          statusCode: 503,
          cause: error,
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Phase6UpstreamError(
        payload?.message || 'upstream request failed',
        {
          code: payload?.code || 'PHASE6_UPSTREAM_ERROR',
          statusCode: response.status >= 500 ? 502 : response.status,
          upstreamStatus: response.status,
          upstreamError: payload?.error,
        },
      );
    }

    return payload;
  };

  return Object.freeze({
    requestJson,
  });
};
