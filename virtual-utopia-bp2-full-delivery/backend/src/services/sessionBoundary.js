import { getBranchAgentForScene } from '../agents/registry.js';
import { SCENE_DEFINITIONS } from './sceneRouter.js';
import { SessionError } from './sessionStore.js';

const getSessionType = (sceneId) =>
  sceneId === 'cabin' ? 'private' : 'public';

export const createSessionBoundary = ({ orchestrator, sessionStore }) => ({
  async handle(body) {
    const sceneId = body?.sceneId;

    if (!Object.hasOwn(SCENE_DEFINITIONS, sceneId)) {
      throw new SessionError('场景无效', {
        code: 'INVALID_SCENE',
      });
    }

    const branchAgent = getBranchAgentForScene(sceneId);

    if (!branchAgent) {
      throw new SessionError('该场景尚未开放', {
        code: 'SCENE_NOT_AVAILABLE',
        statusCode: 503,
      });
    }

    const expectedType = getSessionType(sceneId);
    let session;

    if (body.sessionId) {
      session = sessionStore.getSession(body.sessionId);

      if (
        session.sceneId !== sceneId ||
        session.type !== expectedType ||
        session.ownerAgentId !== branchAgent.id
      ) {
        throw new SessionError('禁止访问其他场景的会话上下文', {
          code: 'SESSION_SCOPE_VIOLATION',
          statusCode: 403,
        });
      }
    } else {
      session = sessionStore.createSession({
        sceneId,
        type: expectedType,
        ownerAgentId: branchAgent.id,
      });
    }

    const response = await orchestrator.handle({
      ...body,
      sessionId: session.id,
      history: session.messages,
    });
    const userContent = body.input?.content?.trim();

    sessionStore.appendMessages(session.id, [
      {
        role: 'user',
        content: userContent,
      },
      {
        role: 'assistant',
        content: response.result.reply,
      },
    ]);

    return {
      ...response,
      meta: {
        ...response.meta,
        session: {
          id: session.id,
          type: session.type,
          sceneId: session.sceneId,
          ownerAgentId: session.ownerAgentId,
          expiresAt: session.expiresAt,
        },
      },
    };
  },
});
