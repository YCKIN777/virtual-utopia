// backend/src/ai/graph/nodes.js
// P3: 图节点 —— intent（路由 dispatch + 历史注入）/ safety / branch×5 / finalize。
// P4: branch 支持工具调用（ReAct 首轮），新增 tools 节点执行工具调用并回填。
// 路由/校验逻辑与旧 orchestrator 等价：复用 intentPolicy 与 registry 纯函数；
// validateModelResult 语义保持一致（sceneId 匹配 + action 词表校验）。
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { interrupt } from '@langchain/langgraph';
import { env } from '../../config/env.js';
import { assessInputRisk, classifyIntent } from '../../agents/intentPolicy.js';
import { getBranchAgentForScene } from '../../agents/registry.js';
import { SceneRequestError } from '../../services/sceneRouter.js';
import { parseStructuredOutput } from '../../services/structuredOutput.js';
import { sceneModelResponseSchema } from '../schemas.js';
import { toolContextStorage } from '../tools/context.js';
import { streamingContextStorage } from '../tools/context.js';
import { buildMemoryPromptBlock } from '../memory/memoryGateway.js';

export class SceneGraphError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SceneResponseValidationError';
    this.code = 'SCENE_RESPONSE_INVALID';
    this.statusCode = 502;
  }
}

const FALLBACK_ELIGIBLE_CODES = new Set([
  'DEEPSEEK_API_ERROR',
  'DEEPSEEK_CIRCUIT_OPEN',
  'DEEPSEEK_NETWORK_ERROR',
  'DEEPSEEK_OVERLOADED',
  'DEEPSEEK_TIMEOUT',
  'SCENE_RESPONSE_INVALID',
  'STRUCTURED_OUTPUT_ERROR',
]);

const buildRequest = (state) => ({
  sceneId: state.sceneId,
  sceneName: state.sceneName,
  input: { content: state.inputContent },
  history: state.requestHistory,
});

const buildDispatch = (state, branchAgent) => ({
  intent: state.intent,
  inputRisk: { level: state.risk, signals: state.riskSignals },
  branchAgent,
});

const validateModelResult = (result, request, branchAgent) => {
  if (result.sceneId !== request.sceneId) {
    throw new SceneGraphError(
      'model response sceneId does not match the request',
    );
  }

  const invalidActions = result.actions.filter(
    (action) => !branchAgent.actionVocabulary.includes(action),
  );

  if (invalidActions.length > 0) {
    throw new SceneGraphError(
      'model response contains an action outside the branch scope',
    );
  }

  return {
    reply: result.reply,
    risk: result.risk,
    sceneId: result.sceneId,
    actions: result.actions,
  };
};

// intent 节点：注入当前消息（首次含历史），完成 dispatch（风险/意图/分支路由）。
// P4: 若装配了 memoryGateway，则按 userId 召回长期记忆注入 state.memoryContext。
export const createIntentNode = ({ memoryGateway } = {}) => async (state) => {
  const inputRisk = assessInputRisk(state.inputContent);
  const intent =
    inputRisk.level === 'high'
      ? 'safety_attempt'
      : classifyIntent(state.inputContent);
  const branchAgent = getBranchAgentForScene(state.sceneId);

  if (!branchAgent) {
    throw new SceneRequestError('no branch agent is registered for the scene');
  }

  // 首次执行（checkpoint 无历史）：注入 request.history + 当前输入；
  // 断点续跑（checkpoint 已有 messages）：仅追加当前输入，避免历史重复，
  // 并剪枝跨轮累积的工具消息（只留纯对话文本）。
  const initialHistory =
    state.messages.length === 0 ? state.requestHistory : [];

  const recoveredMessages =
    state.messages.length === 0 ? [] : pruneToolMessages(state.messages);

  let memoryContext = null;

  if (memoryGateway) {
    memoryContext = memoryGateway.before({
      userId: state.userContext?.userId,
      query: state.inputContent,
      // P5.7：按当前对话的居民角色召回「TA 对你的印象」
      residentId: branchAgent.id,
    });
  }

  return {
    messages: [
      ...initialHistory,
      ...recoveredMessages,
      { role: 'user', content: state.inputContent },
    ],
    intent,
    risk: inputRisk.level,
    riskSignals: inputRisk.signals,
    targetAgentId: branchAgent.id,
    branchName: branchAgent.name,
    branchAgent,
    mode: inputRisk.level === 'high' ? 'safety_refusal' : 'branch_response',
    memoryContext,
  };
};

// safety 节点：高风险输入直接拒绝（与 createSafetyResponse 语义一致）。
export const safetyNode = async (_state) => ({
  reply: '该请求涉及系统指令、敏感信息或跨场景越权，当前场景无法处理。',
  resultRisk: 'high',
  resultActions: ['request_rephrase'],
  fallback: false,
  fallbackReason: null,
  model: null,
  usage: null,
  attempts: 0,
  latencyMs: 0,
  messages: [
    {
      role: 'assistant',
      content: '该请求涉及系统指令、敏感信息或跨场景越权，当前场景无法处理。',
    },
  ],
});

// branch 节点工厂：5 个分支共用，注入对应分支 prompt。
// P4：注入 tools 时优先走工具调用轮（bindTools）；模型返回 tool_calls 则路由 tools 节点，
// 否则（无需工具）解析结构化回复。
// P4：工具结果已回填时（toolResults 非空）走纯结构化输出（不带工具），
// 避免模型在最终轮继续调用工具或输出非 JSON；首轮才绑定工具。
const hasToolContext = (state) =>
  Array.isArray(state.toolResults) && state.toolResults.length > 0;

// P4: 断点续跑时的消息剪枝 —— 过滤掉跨轮累积的工具调用消息对
// （AI tool_calls + ToolMessage），只保留纯对话文本，避免模型被旧工具上下文干扰。
const getMessageKind = (message) =>
  typeof message?._getType === 'function' ? message._getType() : message?.role;

export const pruneToolMessages = (messages) =>
  (messages ?? []).filter((message) => {
    const kind = getMessageKind(message);

    if (kind === 'tool') return false;
    if (kind === 'ai' && message?.tool_calls?.length > 0) return false;

    return true;
  });

export const createBranchNode = (branchAgent, modelClient) => async (state) => {
  const request = buildRequest(state);
  const dispatch = buildDispatch(state, branchAgent);
  const startedAt = Date.now();

  try {
    const messages = [
      {
        role: 'system',
        content:
          branchAgent.buildSystemPrompt({ request, dispatch }) +
          buildMemoryPromptBlock(state.memoryContext),
      },
      ...state.messages,
    ];

    if (
      Array.isArray(state.tools) &&
      state.tools.length > 0 &&
      !hasToolContext(state)
    ) {
      // P5.5-2：优先流式工具轮（打字机即时生效）——有流式上下文且客户端支持时
      // 走 createToolCallResponseStream（bindTools + .stream，无工具则 content 流式推送），
      // 否则回退原有非流式 invoke。
      const streamContext = streamingContextStorage.getStore();
      const useStream =
        streamContext?.onToken &&
        typeof modelClient.createToolCallResponseStream === 'function';
      const toolResponse = useStream
        ? await modelClient.createToolCallResponseStream({
            messages,
            tools: state.tools,
            onToken: streamContext.onToken,
          })
        : await modelClient.createToolCallResponse({
            messages,
            tools: state.tools,
          });
      if (env.ai.toolsDebug) {
        console.error(
          `[debug-branch] tool round: toolCalls=${toolResponse.toolCalls.length} contentLen=${toolResponse.content.length}`,
        );
      }

      if (toolResponse.toolCalls.length > 0) {
        streamingContextStorage
          .getStore()
          ?.onStatus?.({
            phase: 'tool_calling',
            toolNames: toolResponse.toolCalls.map((call) => call.name),
          });

        return {
          toolCalls: toolResponse.toolCalls,
          model: toolResponse.model,
          usage: toolResponse.usage,
          attempts: toolResponse.attempts,
          latencyMs: toolResponse.latencyMs,
          messages: [
            new AIMessage({
              content: toolResponse.content,
              tool_calls: toolResponse.toolCalls.map((call) => ({
                id: call.id,
                name: call.name,
                args: call.args,
              })),
            }),
          ],
        };
      }

      // 模型未调用工具：其返回文本可能是自然语言（非 JSON）。
      // 先尝试解析；失败则重调结构化输出（不带工具），保证 JSON 回复。
      try {
        const data = parseStructuredOutput(
          toolResponse.content,
          sceneModelResponseSchema,
        );
        const result = validateModelResult(data, request, branchAgent);
        if (env.ai.toolsDebug) {
          console.error('[debug-branch] no-tool path: parsed directly');
        }

        return {
          reply: result.reply,
          resultRisk: result.risk,
          resultActions: result.actions,
          toolCalls: [],
          fallback: false,
          fallbackReason: null,
          model: toolResponse.model,
          attempts: toolResponse.attempts,
          latencyMs: toolResponse.latencyMs,
          usage: toolResponse.usage,
          messages: [{ role: 'assistant', content: result.reply }],
        };
      } catch {
        const response = await modelClient.createStructuredResponse({
          messages,
          responseSchema: sceneModelResponseSchema,
        });
        if (env.ai.toolsDebug) {
          console.error('[debug-branch] no-tool path: re-called structured');
        }
        const result = validateModelResult(response.data, request, branchAgent);

        return {
          reply: result.reply,
          resultRisk: result.risk,
          resultActions: result.actions,
          toolCalls: [],
          fallback: false,
          fallbackReason: null,
          model: response.model,
          attempts: response.attempts,
          latencyMs: response.latencyMs,
          usage: response.usage,
          messages: [{ role: 'assistant', content: result.reply }],
        };
      }
    }

    // 最终轮：有流式上下文则走 token 流（打字机），否则一次性结构化。
    const streamContext = streamingContextStorage.getStore();
    const response =
      streamContext?.onToken &&
      typeof modelClient.createStructuredResponseStream === 'function'
        ? await modelClient.createStructuredResponseStream({
            messages,
            responseSchema: sceneModelResponseSchema,
            onToken: streamContext.onToken,
          })
        : await modelClient.createStructuredResponse({
            messages,
            responseSchema: sceneModelResponseSchema,
          });
    if (env.ai.toolsDebug) {
      console.error('[debug-branch] structured path (no tools / final round)');
    }
    const result = validateModelResult(response.data, request, branchAgent);

    return {
      reply: result.reply,
      resultRisk: result.risk,
      resultActions: result.actions,
      toolCalls: [],
      fallback: false,
      fallbackReason: null,
      model: response.model,
      attempts: response.attempts,
      latencyMs: response.latencyMs,
      usage: response.usage,
      messages: [{ role: 'assistant', content: result.reply }],
    };
  } catch (error) {
    if (env.ai.toolsDebug) {
      console.error(
        `[debug-branch] caught: code=${error.code} msg=${String(error.message).slice(0, 200)} cause=${String(error.cause?.message ?? error.cause).slice(0, 200)}`,
      );
    }

    if (!FALLBACK_ELIGIBLE_CODES.has(error.code)) {
      throw error;
    }

    const latencyMs = Date.now() - startedAt;

    return {
      reply: '当前暂时无法完成该请求，请稍后重试。',
      resultRisk: state.risk,
      resultActions: ['retry'],
      toolCalls: [],
      fallback: true,
      fallbackReason: error.code || error.name || 'UNKNOWN_ERROR',
      model: null,
      usage: null,
      attempts: 0,
      latencyMs,
      messages: [
        {
          role: 'assistant',
          content: '当前暂时无法完成该请求，请稍后重试。',
        },
      ],
    };
  }
};

// tools 节点工厂：执行本轮 tool_calls，结果以 ToolMessage 回填消息流。
export const createToolsNode = (toolRegistry) => async (state) => {
  const results = [];
  const toolMessages = [];
  const executeInContext = async () => {
    for (const call of state.toolCalls) {
      const registered = toolRegistry[call.name];
      let output;

      try {
        output = registered
          ? await registered.invoke(call.args)
          : JSON.stringify({ ok: false, error: `unknown tool: ${call.name}` });
      } catch (error) {
        output = JSON.stringify({
          ok: false,
          error: String(error?.message ?? error),
        });
      }

      results.push({ id: call.id, name: call.name, output });
      toolMessages.push(
        new ToolMessage({
          content: output,
          tool_call_id: call.id,
          name: call.name,
        }),
      );
    }
  };

  // 请求用户上下文经 AsyncLocalStorage 注入，工具内 getContext 读取
  const userContext = state.userContext ?? null;

  if (userContext) {
    toolContextStorage.run(userContext, executeInContext);
  } else {
    await executeInContext();
  }

  streamingContextStorage
    .getStore()
    ?.onStatus?.({ phase: 'tool_result', toolNames: results.map((r) => r.name) });

  return {
    toolResults: results,
    messages: toolMessages,
    toolLoopCount: state.toolLoopCount + 1,
  };
};

// P4: HITL（KIN 审批）节点 —— 敏感工具调用在真正执行前经 interrupt 暂停，
// 由管理方（KIN）审批；恢复后 approved=true 才放行 execute_tools，否则拒绝并收尾。
// 注意：interrupt 通过抛出 GraphInterrupt 暂停，恢复时返回 Command({ resume }) 的值，
// 因此本节点内不要用 try/catch 包住 interrupt。
export const createApprovalNode = () => async (state) => {
  const decision = interrupt({
    type: 'kin_approval',
    toolCalls: state.toolCalls,
    message: '以下操作需要 KIN 审批：' +
      state.toolCalls.map((call) => `${call.name}(${JSON.stringify(call.args)})`).join('、'),
  });
  const approved = decision?.approved === true;

  return approved
    ? {
        approvalRequest: {
          type: 'kin_approval',
          toolCalls: state.toolCalls,
          message: '以下操作需要 KIN 审批：' +
            state.toolCalls.map((call) => `${call.name}(${JSON.stringify(call.args)})`).join('、'),
        },
        approvalDecision: decision,
        approvalDenied: false,
      }
    : {
        approvalRequest: null,
        approvalDecision: decision ?? null,
        approvalDenied: true,
        toolCalls: [],
        reply: '该操作需要 KIN（管理方）审批，当前未获批准，我没有执行。你可以自行安排后续。',
        resultRisk: 'low',
        resultActions: ['request_rephrase'],
        fallback: false,
        fallbackReason: null,
        model: null,
        usage: null,
        attempts: 0,
        latencyMs: 0,
        messages: [
          {
            role: 'assistant',
            content: '该操作需要 KIN（管理方）审批，当前未获批准，我没有执行。你可以自行安排后续。',
          },
        ],
      };
};

// finalize 节点：组装对外响应（结构与旧 orchestrator 完全一致）。
export const finalizeNode = async (state) => ({
  finalResponse: {
    sceneId: state.sceneId,
    sceneName: state.sceneName,
    result: {
      reply: state.reply,
      intent: state.intent,
      risk: state.resultRisk,
      sceneId: state.sceneId,
      actions: state.resultActions,
    },
    meta: {
      targetAgentId: state.targetAgentId,
      branchName: state.branchName,
      mode: state.mode,
      intent: state.intent,
      inputRisk: { level: state.risk, signals: state.riskSignals },
      fallback: state.fallback,
      fallbackReason: state.fallbackReason,
      model: state.model,
      attempts: state.attempts,
      latencyMs: state.latencyMs,
      usage: state.usage,
    },
  },
});
