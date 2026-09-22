import { readPhase7Config } from './config.js';
import { createPhase7Router } from './router.js';

export { PHASE7_LIMITS, PHASE7_VERSION, SOCIAL_SCENES } from './config.js';
export { createContentStore, HOME_ACCESS_MODES, normalizeScene } from './contentStore.js';
export { createSearchIndex, tokenize } from './searchIndex.js';
export { createSearchService } from './searchService.js';
export { createBackupService } from './backupService.js';

/**
 * 阶段七装配入口。
 *
 * 设计约束：**只新增**，不改动既有 phase6 路由与 SQLite 数据。
 * 本层负责：JSON 文件分片存储（内容层）+ 关键词检索（检索层）+
 * 权限校验 + 个人数据导出 + data 目录快照备份。
 */
export const createPhase7 = ({
  phase6Config = {},
  authenticate,
  visitorQuotaStore,
  friendStore,
  environment = process.env,
} = {}) => {
  const config = readPhase7Config(environment);

  const instance = createPhase7Router({
    phase6Config: {
      ...phase6Config,
      phase7BackupDirectory: config.backupDirectory,
    },
    authenticate,
    visitorQuotaStore,
    friendStore,
    dataDirectory: config.dataDirectory,
  });

  return {
    enabled: config.enabled,
    config,
    ...instance,
  };
};
