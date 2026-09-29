// backend/src/ai/tools/index.js
// P4: 工具集注册 —— 首批 5 个业务工具（好友/私聊、留言簿、宅院、名额、居民卡片）。
// 依赖注入：stores 为 phase6 各 store 实例；getContext() 返回当前请求上下文
// （{ userId, role, username }），由装配方（HTTP 路由）提供。
// 每个工具均经 ToolAuth 角色校验；返回 JSON 字符串，模型可直接引用。
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { checkToolRole } from './auth.js';
import { toolContextStorage } from './context.js';

const serialize = (payload) => JSON.stringify(payload);

export const createToolSet = ({
  stores,
  getContext = () => toolContextStorage.getStore() ?? null,
  worldState = null,
} = {}) => {
  const { friendStore, guestbookStore, plotStore, quotaStore, cardStore } =
    stores ?? {};

  const context = () => getContext() ?? {};

  const tools = [];

  // 1) 好友/私聊：查询我的好友与待处理申请
  if (friendStore) {
    tools.push(
      tool(
        async () => {
          const current = context();
          const auth = checkToolRole({ name: 'query_friends', context: current });

          if (!auth.ok) return serialize(auth);

          return serialize({
            friends: friendStore.listFriends({ id: current.userId }),
            pendingRequests: friendStore.listRequests({ id: current.userId }),
          });
        },
        {
          name: 'query_friends',
          description:
            '查询当前居民的好友列表与待处理的好友申请。仅原住民与管理员可用。',
          schema: z.object({}),
        },
      ),
    );
  }

  // 2) 留言簿：写入一条邻里留言
  if (guestbookStore) {
    tools.push(
      tool(
        async ({ content }) => {
          const current = context();
          const auth = checkToolRole({ name: 'guestbook_write', context: current });

          if (!auth.ok) return serialize(auth);

          return serialize(
            guestbookStore.create({
              fromUserId: current.userId,
              fromUsername: current.username ?? '',
              content,
            }),
          );
        },
        {
          name: 'guestbook_write',
          description:
            '在乌托邦留言簿上写下一条留言（内容为纯文本）。需要编辑或管理员权限。',
          schema: z.object({
            content: z
              .string()
              .min(1)
              .max(2000)
              .describe('留言内容，1 至 2000 字符'),
          }),
        },
      ),
    );
  }

  // 3) 宅院：查询宅院分配统计与指定地块
  if (plotStore) {
    tools.push(
      tool(
        async ({ plotNumber }) => {
          const auth = checkToolRole({ name: 'plot_lookup', context: context() });

          if (!auth.ok) return serialize(auth);

          const payload = { stats: plotStore.getStats() };

          if (plotNumber !== undefined) {
            payload.plot =
              plotStore
                .list()
                .find((plot) => plot.plotNumber === plotNumber) ?? null;
          }

          return serialize(payload);
        },
        {
          name: 'plot_lookup',
          description:
            '查询乌托邦宅院分配情况：总体统计（总数/已分配/空闲），或指定地块编号的归属。',
          schema: z.object({
            plotNumber: z
              .number()
              .int()
              .min(1)
              .max(50)
              .optional()
              .describe('宅院编号 1-50，缺省时只返回统计'),
          }),
        },
      ),
    );
  }

  // 4) 名额：访客名额全局统计
  if (quotaStore) {
    tools.push(
      tool(
        async () => {
          const auth = checkToolRole({ name: 'quota_overview', context: context() });

          if (!auth.ok) return serialize(auth);

          return serialize(quotaStore.getStats());
        },
        {
          name: 'quota_overview',
          description:
            '查询乌托邦访客名额的全局统计：原住民上限/在住数、邀请名额总数/已发/已用、全局访客上限/当前数。公开信息。',
          schema: z.object({}),
        },
      ),
    );
  }

  // 5) 居民卡片：查询某位居民的公开卡片（residents 权限）
  if (cardStore) {
    tools.push(
      tool(
        async ({ userId }) => {
          const auth = checkToolRole({ name: 'resident_card_lookup', context: context() });

          if (!auth.ok) return serialize(auth);

          return serialize({
            cards: cardStore.listPublicByUser(userId),
          });
        },
        {
          name: 'resident_card_lookup',
          description:
            '查询指定居民公开展示的卡片（介绍/收藏/作品等，residents 权限）。返回卡片列表。',
          schema: z.object({
            userId: z.number().int().describe('目标居民的用户 ID'),
          }),
        },
      ),
    );
  }

  // 6) P5.7 约伴移动：居民角色聚会到指定场景（写入 world_state，3D 前端轮询呈现）
  if (worldState) {
    tools.push(
      tool(
        async ({ targetSceneId, withResidentIds }) => {
          const current = context();
          const auth = checkToolRole({ name: 'gather_move', context: current });

          if (!auth.ok) return serialize(auth);

          const sceneIds = [
            'yard', 'pavilion', 'resource-wall', 'library', 'cabin', 'far-forest', 'plaza',
          ];
          if (!sceneIds.includes(targetSceneId)) {
            return serialize({ ok: false, error: `目标场景必须是：${sceneIds.join('、')}` });
          }

          const targets = withResidentIds?.length
            ? withResidentIds.filter((id) => sceneIds.length) // 保留名单
            : [];
          // 至少让当前对话的居民角色移动；withResidentIds 缺省时 = 访客勾选同行（P5.9）∪ 当前对话角色
          const companions = current.companions ?? [];
          const currentId = String(current.residentId || current.username || 'ahe');
          const residentIds =
            targets.length > 0
              ? targets
              : Array.from(new Set([...companions, currentId]));

          const now = new Date().toISOString();
          const moved = [];
          for (const residentId of residentIds) {
            worldState.set({
              key: `npc:${residentId}`,
              kind: 'npc',
              payload: { sceneId: targetSceneId, updatedAt: now },
            });
            moved.push(residentId);
          }

          return serialize({
            ok: true,
            targetSceneId,
            moved,
            note: `已发起聚会：${moved.join('、')} 前往「${targetSceneId}」`,
          });
        },
        {
          name: 'gather_move',
          description:
            '发起一场居民聚会移动：把一位或多位居民移动到指定场景（yard 大院 / pavilion 凉亭 / resource-wall 资源墙 / library 书屋 / cabin 小屋 / far-forest 远林 / plaza 生活广场）。当访客说「我们去某处聚一聚/玩/聊」且你愿意响应时调用；withResidentIds 填同行居民 id（缺省只移当前角色）。',
          schema: z.object({
            targetSceneId: z
              .enum(['yard', 'pavilion', 'resource-wall', 'library', 'cabin', 'far-forest', 'plaza'])
              .describe('聚会目标场景'),
            withResidentIds: z
              .array(z.string())
              .optional()
              .describe('同行的居民 id 列表，缺省只移动当前对话的居民'),
          }),
        },
      ),
    );
  }

  return Object.freeze(tools);
};
