import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app.js';
import { env } from './config/env.js';
import { createCaptchaService } from './services/captchaService.js';
import { createConversationRegistry } from './services/conversationRegistry.js';
import { createSceneAuditStore } from './services/sceneAuditStore.js';
import { createBusinessToolSet } from './ai/tools/factory.js';
import { createConfiguredMemoryGateway } from './ai/memory/memoryGateway.js';
import { createModelClient } from './ai/modelClientFactory.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(currentDir, '../data');

// P5.2-⑥：生产装配 —— 验证码与会话归属注册表显式持久化到 SQLite，
// 跨进程重启保留数据（captchaId 未过期仍可校验；resume 仍能校验会话 owner）。
const captchaService = createCaptchaService({
  databasePath: path.join(dataDir, 'captcha.db'),
});
const conversationRegistry = createConversationRegistry({
  databasePath: path.join(dataDir, 'conversation-registry.db'),
});
// P5.2-⑧：KIN 审批决策审计持久化（管理后台/审计可跨重启查询）。
const sceneAuditStore = createSceneAuditStore({
  databasePath: path.join(dataDir, 'scene-audit.db'),
});

// P5.4-14：长记忆 LLM 提炼 —— modelClient 与图共享同一实例，注入 memoryGateway 供 extractor 使用。
const modelClient = createModelClient();

const app = createApp({
  tools: createBusinessToolSet(),
  modelClient,
  memoryGateway: createConfiguredMemoryGateway(undefined, { modelClient }),
  captchaService,
  conversationRegistry,
  sceneAuditStore,
});

app.listen(env.port, () => {
  console.log(
    `[backend] listening on http://localhost:${env.port} (${env.nodeEnv})`,
  );
});
