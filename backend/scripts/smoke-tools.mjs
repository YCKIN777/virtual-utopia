// P4 冒烟：工具集 ReAct 循环 E2E（真实模型 + 内存 store + 5 工具）。
// 用法：node scripts/smoke-tools.mjs
// 验证：居民对话中触发工具调用（名额统计 / 留言簿写入 / 宅院查询），
//       工具结果回填后模型基于真实数据作答；guestbook 写入产生数据副作用。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(currentDir, '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const { createModelClient } = await import('../src/ai/modelClientFactory.js');
const { createSceneGraphOrchestrator } = await import(
  '../src/ai/graph/graphOrchestrator.js'
);
const { createToolSet } = await import('../src/ai/tools/index.js');
const { createGuestbookStore } = await import(
  '../src/phase6/guestbookStore.js'
);
const { createPlotAssignmentStore } = await import(
  '../src/phase6/plotAssignmentStore.js'
);
const { createVisitorQuotaStore } = await import(
  '../src/phase6/visitorQuotaStore.js'
);
const { createResidentCardStore } = await import(
  '../src/phase6/residentCardStore.js'
);
const { createFriendStore } = await import('../src/phase6/friendStore.js');

// 1) 内存 store + 预置数据
const guestbookStore = createGuestbookStore();
const plotStore = createPlotAssignmentStore();
const quotaStore = createVisitorQuotaStore();
const cardStore = createResidentCardStore();
const friendStore = createFriendStore();

quotaStore.onboardResident({
  userId: 1,
  username: 'demo',
  displayName: '演示居民',
  homePlotId: 1,
});
quotaStore.onboardResident({
  userId: 2,
  username: 'neighbor',
  displayName: '邻居甲',
  homePlotId: 2,
});
quotaStore.issueResidentInvitation({ userId: 1 });

plotStore.assignPlot({
  plotNumber: 3,
  residentUserId: 2,
  residentUsername: 'neighbor',
  residentDisplayName: '邻居甲',
  customName: '听雨轩',
});

cardStore.create({
  userId: 2,
  username: 'neighbor',
  cardType: 'life_note',
  content: { text: '爱好园艺与手作，欢迎大家来听雨轩做客。' },
  permission: 'residents',
});

friendStore.sendRequest({
  from: { id: 1, username: 'demo', displayName: '演示居民' },
  to: { id: 2, username: 'neighbor', displayName: '邻居甲' },
});

// 2) 工具集（当前上下文：演示居民，editor 角色）
const tools = createToolSet({
  stores: { friendStore, guestbookStore, plotStore, quotaStore, cardStore },
  getContext: () => ({
    userId: 1,
    username: 'demo',
    role: 'editor',
  }),
});

const orchestrator = createSceneGraphOrchestrator({
  modelClient: createModelClient(),
  tools,
});

const run = async (input) => {
  const result = await orchestrator.handle({
    // 每次运行独立线程，避免 checkpoint 跨运行累积工具消息历史
    conversationId: `smoke-tools-${Date.now()}`,
    sceneId: 'yard',
    input: { content: input },
  });

  console.log(`输入：${input}`);
  console.log(`回复：${result.result.reply}`);
  console.log(
    `meta: ${JSON.stringify({ branch: result.meta.branchName, intent: result.meta.intent, fallback: result.meta.fallback, fallbackReason: result.meta.fallbackReason, model: result.meta.model })}`,
  );
  console.log('---');
  return result;
};

// 3) 场景一：访客名额统计（触发 quota_overview）
await run('帮我看看现在乌托邦的访客名额是什么情况？');

// 4) 场景二：留言簿写入（触发 guestbook_write，产生数据副作用）
await run('帮我在留言簿写一条留言：本周六上午九点在广场办邻里早市，欢迎大家参加。');

// 5) 场景三：宅院查询（触发 plot_lookup）
await run('3号宅院现在是哪位居民住的？');

// 6) 验证副作用：留言簿确实写入了
const messages = guestbookStore.list();
console.log('guestbook 当前留言数:', messages.length);
console.log('留言内容:', messages[0]?.content);

console.log('TOOLS_SMOKE_DONE');
