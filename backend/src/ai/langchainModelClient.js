// backend/src/ai/langchainModelClient.js
// P1: LangChain 适配器 —— 实现与 deepSeekClient 完全一致的 createStructuredResponse 接口，
// 内部使用 @langchain/deepseek（ChatDeepSeek），结构化校验复用现有 parseStructuredOutput。
// 错误码保持兼容（DEEPSEEK_* / STRUCTURED_OUTPUT_ERROR），供 orchestrator 的 fallback 逻辑判断。
import { ChatDeepSeek } from '@langchain/deepseek';
import { env } from '../config/env.js';
import {
  parseStructuredOutput,
  StructuredOutputError,
} from '../services/structuredOutput.js';
import {
  DeepSeekError,
  DeepSeekConfigurationError,
} from '../services/deepSeekClient.js';

const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_MESSAGE_MARKERS = [
  'timeout',
  'Timeout',
  'ECONNRESET',
  'EAI_AGAIN',
  'fetch failed',
  'socket hang up',
  'Network',
  'network',
];

const isAbortLike = (error) =>
  error?.name === 'AbortError' || error?.code === 'ABORT_ERR';

const mapError = (error) => {
  if (error instanceof DeepSeekError || error instanceof StructuredOutputError) {
    return error;
  }

  if (isAbortLike(error)) {
    return new DeepSeekError('DeepSeek request timed out', {
      name: 'DeepSeekTimeoutError',
      code: 'DEEPSEEK_TIMEOUT',
      statusCode: 504,
      retryable: true,
      cause: error,
    });
  }

  const message = String(error?.message ?? error?.name ?? error ?? '');
  const statusCode =
    Number.isInteger(error?.status) && error.status > 0 ? error.status : 502;
  const isTimeout = message.includes('timeout') || message.includes('Timeout');
  const isNetwork = RETRYABLE_MESSAGE_MARKERS.some((marker) =>
    message.includes(marker),
  );
  const retryable =
    RETRYABLE_STATUS_CODES.has(statusCode) || isNetwork || isTimeout;

  return new DeepSeekError(`DeepSeek request failed: ${message.slice(0, 300)}`, {
    name: isTimeout ? 'DeepSeekTimeoutError' : 'DeepSeekApiError',
    code: isTimeout
      ? 'DEEPSEEK_TIMEOUT'
      : isNetwork
        ? 'DEEPSEEK_NETWORK_ERROR'
        : 'DEEPSEEK_API_ERROR',
    statusCode,
    retryable,
    cause: error,
  });
};

export const createLangChainModelClient = (options = {}) => {
  const config = {
    apiKey: options.apiKey ?? env.deepSeek.apiKey,
    baseUrl: (options.baseUrl ?? env.deepSeek.baseUrl).replace(/\/+$/, ''),
    model: options.model ?? env.deepSeek.model,
    timeoutMs: options.timeoutMs ?? env.deepSeek.timeoutMs,
    maxRetries: options.maxRetries ?? env.deepSeek.maxRetries,
  };

  let modelInstance = null;
  const getModel = () => {
    if (!modelInstance) {
      modelInstance = new ChatDeepSeek({
        apiKey: config.apiKey,
        model: config.model,
        temperature: 0.2,
        maxRetries: config.maxRetries,
        timeout: config.timeoutMs,
        ...(config.baseUrl
          ? { configuration: { baseURL: config.baseUrl } }
          : {}),
      });
    }

    return modelInstance;
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

    const startedAt = Date.now();

    try {
      const response = await getModel().invoke(messages, {
        response_format: { type: 'json_object' },
      });
      const content =
        typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);
      const data = parseStructuredOutput(content, responseSchema);
      const metadata = response.response_metadata ?? {};
      const usageMeta = response.usage_metadata;

      return {
        data,
        model: metadata.model ?? config.model,
        usage: usageMeta
          ? {
              prompt_tokens: usageMeta.input_tokens,
              completion_tokens: usageMeta.output_tokens,
              total_tokens: usageMeta.total_tokens,
            }
          : (metadata.usage ?? null),
        attempts: 1,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      throw mapError(error);
    }
  };

  // P4: 流式结构化输出 —— ChatDeepSeek .stream + response_format json_object，
  // onToken 推送原始文本片段（调用方负责增量提取 reply 或透传前端）；
  // 返回与 createStructuredResponse 同构的 { data, model, usage, attempts, latencyMs }。
  // 流式不可用（API 拒绝/解析失败）时调用方应回退 createStructuredResponse。
  const createStructuredResponseStream = async ({
    messages,
    responseSchema,
    onToken,
    signal,
  }) => {
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

    const startedAt = Date.now();

    try {
      const stream = await getModel().stream(
        messages,
        {
          response_format: { type: 'json_object' },
          ...(signal ? { signal } : {}),
        },
      );
      let buffer = '';
      let usageMetadata = null;

      for await (const chunk of stream) {
        const text = chunk?.content;

        if (typeof text === 'string' && text.length > 0) {
          buffer += text;

          if (typeof onToken === 'function') {
            onToken(text);
          }
        }

        if (chunk?.usage_metadata) {
          usageMetadata = chunk.usage_metadata;
        }
      }

      const data = parseStructuredOutput(buffer, responseSchema);

      return {
        data,
        model: config.model,
        usage: usageMetadata
          ? {
              prompt_tokens: usageMetadata.input_tokens,
              completion_tokens: usageMetadata.output_tokens,
              total_tokens: usageMetadata.total_tokens,
            }
          : null,
        attempts: 1,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      throw mapError(error);
    }
  };

  const createToolCallResponse = async ({ messages, tools }) => {    if (!config.apiKey) {
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

    const startedAt = Date.now();

    try {
      const modelWithTools = getModel().bindTools(tools);
      const response = await modelWithTools.invoke(messages);
      const metadata = response.response_metadata ?? {};
      const usageMeta = response.usage_metadata;
      const rawCalls = response.tool_calls ?? [];

      return {
        content:
          typeof response.content === 'string' ? response.content : '',
        toolCalls: rawCalls.map((call) => ({
          id: call.id,
          name: call.name,
          args: call.args ?? {},
        })),
        model: metadata.model ?? config.model,
        usage: usageMeta
          ? {
              prompt_tokens: usageMeta.input_tokens,
              completion_tokens: usageMeta.output_tokens,
              total_tokens: usageMeta.total_tokens,
            }
          : (metadata.usage ?? null),
        attempts: 1,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      throw mapError(error);
    }
  };

  return Object.freeze({
    createStructuredResponse,
    createStructuredResponseStream,
    createToolCallResponse,
    model: config.model,
    backend: 'langchain',
  });
};
