// backend/src/ai/tools/factory.js
// P4: 业务工具集装配 —— 按 phase6 真实配置创建 SQLite store，供 HTTP 装配方
// （phase4/phase5/主入口）注入 createApp({ tools })。friendStore 为内存 store，
// 进程内共享；其余 4 个 store 使用与 phase6 服务相同的数据库文件，数据天然一致。
import { readPhase6Config } from '../../phase6/config.js';
import { createVisitorQuotaStore } from '../../phase6/visitorQuotaStore.js';
import { createPlotAssignmentStore } from '../../phase6/plotAssignmentStore.js';
import { createResidentCardStore } from '../../phase6/residentCardStore.js';
import { createGuestbookStore } from '../../phase6/guestbookStore.js';
import { createFriendStore } from '../../phase6/friendStore.js';
import { createToolSet } from './index.js';

export const createBusinessToolSet = ({ stores, getContext, worldState } = {}) => {
  const config = readPhase6Config();

  return createToolSet({
    worldState,
    stores:
      stores ??
      Object.freeze({
        friendStore: createFriendStore(),
        guestbookStore: createGuestbookStore({
          databasePath: config.guestbookDatabasePath,
        }),
        plotStore: createPlotAssignmentStore({
          databasePath: config.plotDatabasePath,
        }),
        quotaStore: createVisitorQuotaStore({
          databasePath: config.quotaDatabasePath,
        }),
        cardStore: createResidentCardStore({
          databasePath: config.cardDatabasePath,
        }),
      }),
    getContext,
  });
};
