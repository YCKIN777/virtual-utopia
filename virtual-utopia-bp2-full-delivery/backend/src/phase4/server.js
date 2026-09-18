import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createApp } from '../app.js';
import { createDeepSeekClient } from '../services/deepSeekClient.js';
import { readPhase4Config } from './config.js';
import { createRagClient } from './ragClient.js';
import { createRagEnhancedModelClient } from './ragEnhancedModelClient.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(currentDirectory, '../..');

dotenv.config({
  path: path.join(backendDirectory, '.env'),
  override: true,
  quiet: true,
});

const config = readPhase4Config();
const baseModelClient = createDeepSeekClient({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseUrl: process.env.DEEPSEEK_BASE_URL,
  model: process.env.DEEPSEEK_MODEL,
});
const ragClient = createRagClient({
  baseUrl: config.ragBaseUrl,
  collectionName: config.collectionName,
  similarityThreshold: config.similarityThreshold,
  topK: config.topK,
});
const modelClient = createRagEnhancedModelClient({
  modelClient: baseModelClient,
  ragClient,
  enabled: config.enabled,
});
const app = createApp({ modelClient });
const server = app.listen(config.port, 'localhost', () => {
  console.log(
    JSON.stringify({
      service: 'virtual-utopia-phase4',
      port: config.port,
      ragEnhanceEnabled: config.enabled,
      ragBaseUrl: config.ragBaseUrl,
      similarityThreshold: config.similarityThreshold,
    }),
  );
});

server.on('error', (error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
