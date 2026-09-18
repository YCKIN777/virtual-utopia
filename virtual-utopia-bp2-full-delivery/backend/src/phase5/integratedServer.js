import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createApp } from '../app.js';
import { createDeepSeekClient } from '../services/deepSeekClient.js';
import {
  createRagClient,
  createRagEnhancedModelClient,
  readPhase4Config,
} from '../phase4/index.js';
import { readPhase5Config } from './config.js';
import { createConfiguredSessionStore } from './sessionStoreAdapter.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(currentDirectory, '../..');

dotenv.config({
  path: path.join(backendDirectory, '.env'),
  override: true,
  quiet: true,
});

export const startIntegratedPhase4Server = async ({
  phase5Config = readPhase5Config(),
  phase4Config = readPhase4Config(),
} = {}) => {
  const sessionStore = await createConfiguredSessionStore({
    mode: phase5Config.sessionStorageMode,
    baseUrl: phase5Config.phase4BaseUrl,
    serviceToken: phase5Config.serviceToken,
  });
  const baseModelClient = createDeepSeekClient({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.DEEPSEEK_BASE_URL,
    model: process.env.DEEPSEEK_MODEL,
  });
  const ragClient = createRagClient({
    baseUrl: phase4Config.ragBaseUrl,
    collectionName: phase4Config.collectionName,
    similarityThreshold: phase4Config.similarityThreshold,
    topK: phase4Config.topK,
  });
  const modelClient = createRagEnhancedModelClient({
    modelClient: baseModelClient,
    ragClient,
    enabled: phase4Config.enabled,
  });
  const app = createApp({
    modelClient,
    sessionStore,
  });
  const server = await new Promise((resolve, reject) => {
    const listeningServer = app.listen(phase4Config.port, 'localhost');

    listeningServer.once('listening', () => resolve(listeningServer));
    listeningServer.once('error', reject);
  });

  const close = async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    await sessionStore.dispose();
  };

  return {
    app,
    server,
    sessionStore,
    close,
  };
};

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  startIntegratedPhase4Server()
    .then(({ server, sessionStore }) => {
      console.log(
        JSON.stringify({
          service: 'virtual-utopia-phase4-integrated',
          port: server.address().port,
          sessionStorageMode: process.env.SESSION_STORAGE_MODE || 'memory',
          sessionCount: sessionStore.size,
        }),
      );
    })
    .catch((error) => {
      console.error(error.stack || error);
      process.exitCode = 1;
    });
}
