import { Router } from 'express';
import { listBranchAgents } from '../agents/registry.js';
import { SCENE_DEFINITIONS } from '../services/sceneRouter.js';

export const createSceneRouter = ({ orchestrator }) => {
  const router = Router();

  router.get('/scenes', (_request, response) => {
    response.json({
      scenes: Object.entries(SCENE_DEFINITIONS).map(([id, name]) => ({
        id,
        name,
      })),
      agents: listBranchAgents(),
    });
  });

  router.post('/scene/route', async (request, response, next) => {
    try {
      const result = await orchestrator.handle(request.body, {
        userContext: request.userContext,
      });
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
};
