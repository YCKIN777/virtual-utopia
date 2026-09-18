import { Router } from 'express';
import { env } from '../config/env.js';

const router = Router();

router.get('/health', (_request, response) => {
  response.json({
    status: 'ok',
    environment: env.nodeEnv,
  });
});

router.get('/capabilities', (_request, response) => {
  response.json({
    codeGenerationEnabled: env.codeGenerationEnabled,
  });
});

export default router;
