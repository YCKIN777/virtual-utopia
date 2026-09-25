// backend/src/ai/schemas.js
// AI 结构化输出 schema 集中定义（单一来源；P1 从 orchestrator 迁移至此）。
import { SCENE_DEFINITIONS } from '../services/sceneRouter.js';

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
