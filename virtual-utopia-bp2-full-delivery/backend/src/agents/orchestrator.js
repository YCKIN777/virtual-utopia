import { DeepSeekError } from '../services/deepSeekClient.js';
import {
  SCENE_DEFINITIONS,
  normalizeSceneRequest,
} from '../services/sceneRouter.js';
import { assessInputRisk, classifyIntent } from './intentPolicy.js';
import { getBranchAgentForScene } from './registry.js';

const FALLBACK_ELIGIBLE_CODES = new Set([
  'DEEPSEEK_API_ERROR',
  'DEEPSEEK_CIRCUIT_OPEN',
  'DEEPSEEK_NETWORK_ERROR',
  'DEEPSEEK_OVERLOADED',
  'DEEPSEEK_TIMEOUT',
  'SCENE_RESPONSE_INVALID',
  'STRUCTURED_OUTPUT_ERROR',
]);

export const sceneModelResponseSchema = Object.freeze({
  type: 'object',
  properties: {
    reply: { type: 'string', maxLength: 4000 },
    risk: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
    },
    sceneId: {
      type: 'string',
      enum: Object.keys(SCENE_DEFINITIONS),
    },
    actions: {
      type: 'array',
      items: { type: 'string', maxLength: 120 },
    },
  },
  required: ['reply', 'risk', 'sceneId', 'actions'],
  additionalProperties: false,
});

export class SceneResponseValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SceneResponseValidationError';
    this.code = 'SCENE_RESPONSE_INVALID';
    this.statusCode = 502;
  }
}

export const dispatchSceneTask = (request) => {
  const inputRisk = assessInputRisk(request.input.content);
  const intent =
    inputRisk.level === 'high'
      ? 'safety_attempt'
      : classifyIntent(request.input.content);
  const branchAgent = getBranchAgentForScene(request.sceneId);

  if (!branchAgent) {
    throw new SceneResponseValidationError(
      'no branch agent is registered for the scene',
    );
  }

  return {
    intent,
    inputRisk,
    branchAgent,
    targetAgentId: branchAgent.id,
    mode: inputRisk.level === 'high' ? 'safety_refusal' : 'branch_response',
  };
};

const createSafetyResponse = (request, dispatch) => ({
  sceneId: request.sceneId,
  sceneName: request.sceneName,
  result: {
    reply: '该请求涉及系统指令、敏感信息或跨场景越权，当前场景无法处理。',
    intent: dispatch.intent,
    risk: 'high',
    sceneId: request.sceneId,
    actions: ['request_rephrase'],
  },
  meta: {
    targetAgentId: dispatch.targetAgentId,
    branchName: dispatch.branchAgent.name,
    mode: dispatch.mode,
    intent: dispatch.intent,
    inputRisk: dispatch.inputRisk,
    fallback: false,
    model: null,
    attempts: 0,
    latencyMs: 0,
    usage: null,
  },
});

const createFallbackResponse = (request, dispatch, error, latencyMs) => ({
  sceneId: request.sceneId,
  sceneName: request.sceneName,
  result: {
    reply: '当前暂时无法完成该请求，请稍后重试。',
    intent: dispatch.intent,
    risk: dispatch.inputRisk.level,
    sceneId: request.sceneId,
    actions: ['retry'],
  },
  meta: {
    targetAgentId: dispatch.targetAgentId,
    branchName: dispatch.branchAgent.name,
    mode: dispatch.mode,
    intent: dispatch.intent,
    inputRisk: dispatch.inputRisk,
    fallback: true,
    fallbackReason: error.code || error.name || 'UNKNOWN_ERROR',
    model: null,
    attempts: 0,
    latencyMs,
    usage: null,
  },
});

const validateModelResult = (result, request, dispatch) => {
  if (result.sceneId !== request.sceneId) {
    throw new SceneResponseValidationError(
      'model response sceneId does not match the request',
    );
  }

  const invalidActions = result.actions.filter(
    (action) => !dispatch.branchAgent.actionVocabulary.includes(action),
  );

  if (invalidActions.length > 0) {
    throw new SceneResponseValidationError(
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

export const createSceneOrchestrator = ({
  modelClient,
  now = Date.now,
} = {}) => ({
  async handle(body) {
    const request = normalizeSceneRequest(body);
    const dispatch = dispatchSceneTask(request);

    if (dispatch.mode === 'safety_refusal') {
      return createSafetyResponse(request, dispatch);
    }

    const startedAt = now();

    try {
      const response = await modelClient.createStructuredResponse({
        messages: [
          {
            role: 'system',
            content: dispatch.branchAgent.buildSystemPrompt({
              request,
              dispatch,
            }),
          },
          ...request.history,
          {
            role: 'user',
            content: request.input.content,
          },
        ],
        responseSchema: sceneModelResponseSchema,
      });
      const result = validateModelResult(response.data, request, dispatch);

      return {
        sceneId: request.sceneId,
        sceneName: request.sceneName,
        result: {
          ...result,
          intent: dispatch.intent,
        },
        meta: {
          targetAgentId: dispatch.targetAgentId,
          branchName: dispatch.branchAgent.name,
          mode: dispatch.mode,
          intent: dispatch.intent,
          inputRisk: dispatch.inputRisk,
          fallback: false,
          model: response.model,
          attempts: response.attempts,
          latencyMs: response.latencyMs,
          usage: response.usage,
        },
      };
    } catch (error) {
      if (!FALLBACK_ELIGIBLE_CODES.has(error.code)) {
        throw error;
      }

      return createFallbackResponse(
        request,
        dispatch,
        error,
        now() - startedAt,
      );
    }
  },
});
