import { createToolSet } from '../src/ai/tools/index.js';
import { toolContextStorage } from '../src/ai/tools/context.js';

const written = [];
const ws = { set: (v) => written.push(v) };
const set = createToolSet({
  stores: { friendStore: null, guestbookStore: null, plotStore: null, quotaStore: null, cardStore: null },
  worldState: ws,
});
const gm = set.find((t) => t.name === 'gather_move');
if (!gm) { console.log('FAIL: gather_move 未注册'); process.exit(1); }

await toolContextStorage.run({ username: 'admin', companions: ['ahe', 'zhiyu'] }, async () => {
  const out = await gm.invoke({ targetSceneId: 'plaza' });
  console.log('场景1(companions缺省):', JSON.parse(out).moved, '| 写入:', written.map(w => w.key + '->' + w.payload.sceneId).join(','));
});

written.length = 0;
await toolContextStorage.run({ username: 'admin', companions: ['ahe'] }, async () => {
  const out = await gm.invoke({ targetSceneId: 'pavilion', withResidentIds: ['fenghe', 'suian'] });
  console.log('场景2(显式名单):', JSON.parse(out).moved, '| 写入:', written.map(w => w.key + '->' + w.payload.sceneId).join(','));
});

written.length = 0;
await toolContextStorage.run({ username: 'admin', companions: [] }, async () => {
  const out = await gm.invoke({ targetSceneId: 'yard' });
  console.log('场景3(无同行):', JSON.parse(out).moved, '| 写入:', written.map(w => w.key + '->' + w.payload.sceneId).join(','));
});
