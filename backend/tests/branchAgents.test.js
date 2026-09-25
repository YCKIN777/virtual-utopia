import assert from 'node:assert/strict';
import test from 'node:test';
import { branchAgents } from '../src/agents/branches/index.js';
import {
  getBranchAgentForScene,
  listBranchAgents,
} from '../src/agents/registry.js';

const sceneNames = {
  yard: '大院',
  'resource-wall': '资源墙',
  pavilion: '议事亭',
  library: '书屋',
  cabin: '小屋',
};

test('defines five independent branch agents', () => {
  const agents = Object.values(branchAgents);
  const personas = new Set(agents.map((agent) => agent.persona));

  assert.equal(agents.length, 5);
  assert.equal(personas.size, 5);
  assert.deepEqual(
    agents.map((agent) => agent.id),
    ['ahe', 'zhiyu', 'xubai', 'suian', 'fenghe'],
  );
  assert.equal(listBranchAgents().length, 5);
});

test('maps all five assigned scenes without cross-scene ambiguity', () => {
  const expected = {
    yard: 'ahe',
    'resource-wall': 'zhiyu',
    pavilion: 'xubai',
    library: 'suian',
    cabin: 'fenghe',
  };

  for (const [sceneId, agentId] of Object.entries(expected)) {
    assert.equal(getBranchAgentForScene(sceneId).id, agentId);
  }

  assert.equal(getBranchAgentForScene('far-forest'), undefined);
});

test('keeps zhiyu, xubai and fenghe within their corrected roles', () => {
  const zhiyu = getBranchAgentForScene('resource-wall');
  const xubai = getBranchAgentForScene('pavilion');
  const fenghe = getBranchAgentForScene('cabin');

  assert.deepEqual(zhiyu.sceneIds, ['resource-wall']);
  assert.match(zhiyu.responsibilities.join(''), /资源/);
  assert.deepEqual(xubai.sceneIds, ['pavilion']);
  assert.match(xubai.responsibilities.join(''), /议事/);
  assert.deepEqual(fenghe.sceneIds, ['cabin']);
  assert.doesNotMatch(fenghe.persona, /远林/);
});

test('builds isolated prompts for every branch', () => {
  for (const [sceneId, sceneName] of Object.entries(sceneNames)) {
    const agent = getBranchAgentForScene(sceneId);
    const prompt = agent.buildSystemPrompt({
      request: {
        sceneId,
        sceneName,
      },
      dispatch: {
        intent: 'question',
        inputRisk: {
          level: 'low',
        },
      },
    });

    assert.match(prompt, new RegExp(agent.name));
    assert.match(prompt, new RegExp(sceneName));
    assert.match(prompt, /不得跨场景角色扮演/);
    assert.match(prompt, /可使用系统提供的工具查询大院实时数据/);
    assert.match(prompt, /须先获得成员确认或管理方审批/);
  }
});

test('defines an independent task flow for every branch', () => {
  for (const agent of Object.values(branchAgents)) {
    const prompt = agent.buildSystemPrompt({
      request: {
        sceneId: agent.sceneIds[0],
        sceneName: sceneNames[agent.sceneIds[0]],
      },
      dispatch: {
        intent: 'request',
        inputRisk: {
          level: 'low',
        },
      },
    });

    assert.equal(agent.taskFlow.length, 4);
    assert.match(prompt, /独立任务链/);
    assert.match(prompt, new RegExp(agent.taskFlow[0]));
  }
});

test('keeps the library agent at a non-persistent memory placeholder', () => {
  const agent = getBranchAgentForScene('library');
  const prompt = agent.buildSystemPrompt({
    request: {
      sceneId: 'library',
      sceneName: '书屋',
    },
    dispatch: {
      intent: 'request',
      inputRisk: {
        level: 'low',
      },
    },
  });

  assert.equal(agent.id, 'suian');
  assert.match(prompt, /memory_interface_placeholder/);
  assert.match(prompt, /不写入数据库，不持久化，不归档/);
  assert.match(prompt, /不得声称已经记住、保存或找回任何内容/);
});
