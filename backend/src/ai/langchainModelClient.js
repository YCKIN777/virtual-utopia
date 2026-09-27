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

// P5.5-2: reply 增量提取器 —— 包装 onToken：从模型 JSON 流中增量提取
// reply 字段的文本（解码转义），仅推送干净的回复文本；非 JSON（自然语言）
// 流原样透传。避免前端打字机渲染 {"reply":... 等 JSON 壳字符。
const decodePartialJsonString = (raw) => {
  // 未闭合 JSON 字符串体的部分解码；尾部反斜杠可能是转义前缀 → 返回 null 等待。
  if (/\\$/.test(raw)) return null;
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return null;
  }
};

const createReplyExtractor = (onToken) => {
  let buffer = '';
  let pushedLen = 0;

  return (token) => {
    if (typeof onToken !== 'function') return;

    buffer += token;
    // 非贪婪匹配 reply 值：闭合引号可选（支持增量部分解码）
    const m = buffer.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"?/);
    const looksJsonish = buffer.includes('{') || /"reply"\s*:/.test(buffer);

    if (!m) {
      if (!looksJsonish && buffer.length > pushedLen) {
        // 自然语言流：原样推送增量
        const delta = buffer.slice(pushedLen);
        pushedLen = buffer.length;
        onToken(delta);
      }
      return;
    }

    const text = decodePartialJsonString(m[1]);
    if (text === null) return; // 尚未闭合或转义跨 chunk：等待下一 token

    if (text.length > pushedLen) {
      onToken(text.slice(pushedLen));
      pushedLen = text.length;
    }
  };
};

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

  // P4: 流式结构化输出 —— ChatDeepSeek .stream，onToken 推送原始文本片段
  // （调用方负责增量提取 reply 或透传前端）；返回与 createStructuredResponse 同构的
  // { data, model, usage, attempts, latencyMs }。
  // P5.5-2 修复：stream 不传 response_format（LangChain ChatDeepSeek 对
  // {type:'json_object'} 序列化抛 Cannot read properties of null (reading 'enum')），
  // 输出格式由系统提示词约束 + parseStructuredOutput 兜底；
  // 流式解析失败（模型输出非 JSON）时回退一次非流式 invoke（json_object 保证）。
  // 流式不可用（API 拒绝）时调用方应回退 createStructuredResponse。
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
        signal ? { signal } : {},
      );
      let buffer = '';
      let usageMetadata = null;
      const emit = createReplyExtractor(onToken);

      for await (const chunk of stream) {
        const text = chunk?.content;

        if (typeof text === 'string' && text.length > 0) {
          buffer += text;
          emit(text);
        }

        if (chunk?.usage_metadata) {
          usageMetadata = chunk.usage_metadata;
        }
      }

      try {
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
      } catch (parseError) {
        // 流式输出未按 JSON 结构返回（提示词约束失守）：回退一次非流式
        // invoke（带 response_format json_object），保证结构化回复。
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
          attempts: 2,
          latencyMs: Date.now() - startedAt,
        };
      }
    } catch (error) {
      throw mapError(error);
    }
  };

  // P5.5-2: 流式工具轮 —— bindTools + .stream：无工具调用时 content 即时推送给
  // onToken（打字机），有工具调用时合并增量 tool_calls 返回（走工具节点）。
  // 与 createToolCallResponse 同构返回 { content, toolCalls, model, usage, attempts, latencyMs }。
  const createToolCallResponseStream = async ({ messages, tools, onToken }) => {
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
      const modelWithTools = getModel().bindTools(tools);
      const stream = await modelWithTools.stream(messages);
      let buffer = '';
      let usageMetadata = null;
      const toolCallMap = new Map();
      const emit = createReplyExtractor(onToken);

      for await (const chunk of stream) {
        const text = chunk?.content;

        if (typeof text === 'string' && text.length > 0) {
          buffer += text;
          emit(text);
        }

        if (chunk?.usage_metadata) {
          usageMetadata = chunk.usage_metadata;
        }

        for (const call of chunk?.tool_calls ?? []) {
          toolCallMap.set(call.index ?? toolCallMap.size, {
            id: call.id,
            name: call.name ?? '',
            args: call.args ?? {},
          });
        }
      }

      const rawCalls = [...toolCallMap.values()];

      return {
        content: buffer,
        toolCalls: rawCalls.map((call) => ({
          id: call.id,
          name: call.name,
          args: call.args ?? {},
        })),
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
    createToolCallResponseStream,
    model: config.model,
    backend: 'langchain',
  });
};
