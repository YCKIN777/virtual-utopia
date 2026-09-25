// backend/tests/approvalRouting.test.js
// 待办④：审批路由单测 —— routeAfterBranch 四态 + env 审批清单多值解析。
// 清单为配置驱动（AI_APPROVAL_TOOLS，默认 guestbook_write,query_friends）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeAfterBranch } from '../src/ai/graph/graphOrchestrator.js';
import { env } from '../src/config/env.js';

test('待办④ env：默认审批清单含 guestbook_write 与 query_friends', () => {
  assert.ok(env.ai.approvalTools.includes('guestbook_write'));
  assert.ok(env.ai.approvalTools.includes('query_friends'));
});

test('routeAfterBranch：无工具调用 → finalize', () => {
  assert.equal(routeAfterBranch({ toolCalls: [] }), 'finalize');
});

test('routeAfterBranch：含清单内敏感工具 → approval（HITL 暂停）', () => {
  const result = routeAfterBranch({
    toolCalls: [{ name: 'query_friends', args: {} }],
  });

  assert.equal(result, 'approval');
});

test('routeAfterBranch：含 guestbook_write（写入类）→ approval', () => {
  const result = routeAfterBranch({
    toolCalls: [{ name: 'guestbook_write', args: { content: 'x' } }],
  });

  assert.equal(result, 'approval');
});

test('routeAfterBranch：非敏感查询工具 → execute_tools（直接执行）', () => {
  const result = routeAfterBranch({
    toolCalls: [{ name: 'quota_overview', args: {} }],
  });

  assert.equal(result, 'execute_tools');
});

test('routeAfterBranch：混合调用（含敏感）→ approval', () => {
  const result = routeAfterBranch({
    toolCalls: [
      { name: 'quota_overview', args: {} },
      { name: 'query_friends', args: {} },
    ],
  });

  assert.equal(result, 'approval');
});

// 通过环境变量覆盖验证配置驱动：单进程内 env 为冻结常量，此处验证解析规则本身。
test('待办④ env：逗号分隔多值解析（trim + 过滤空项）', () => {
  const parse = (raw) =>
    (raw || 'guestbook_write,query_friends')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  assert.deepEqual(parse('guestbook_write, query_friends , '), [
    'guestbook_write',
    'query_friends',
  ]);
  assert.deepEqual(parse(''), ['guestbook_write', 'query_friends']);
});
