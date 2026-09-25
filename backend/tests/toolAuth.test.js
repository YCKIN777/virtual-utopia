import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOOL_ROLE_RULES,
  checkToolRole,
} from '../src/ai/tools/auth.js';

const ROLES = ['viewer', 'resident', 'editor', 'admin', null];

test('ToolAuth：5 个工具的权限规则与注册表一致', () => {
  const expected = {
    query_friends: ['resident', 'admin'],
    guestbook_write: ['editor', 'admin'],
    plot_lookup: ['viewer', 'resident', 'editor', 'admin'],
    quota_overview: ['viewer', 'resident', 'editor', 'admin'],
    resident_card_lookup: ['viewer', 'resident', 'editor', 'admin'],
  };

  assert.deepEqual(TOOL_ROLE_RULES, expected);
});

test('ToolAuth：每个角色 × 每个工具的放行/拒绝符合规则', () => {
  const matrix = {};

  for (const role of ROLES) {
    matrix[String(role)] = {};
    for (const toolName of Object.keys(TOOL_ROLE_RULES)) {
      const result = checkToolRole({ name: toolName, context: { role } });
      matrix[String(role)][toolName] = result.ok;
    }
  }

  assert.equal(matrix.viewer.query_friends, false);
  assert.equal(matrix.viewer.guestbook_write, false);
  assert.equal(matrix.viewer.plot_lookup, true);
  assert.equal(matrix.viewer.quota_overview, true);
  assert.equal(matrix.viewer.resident_card_lookup, true);

  assert.equal(matrix.resident.query_friends, true);
  assert.equal(matrix.resident.guestbook_write, false);
  assert.equal(matrix.resident.plot_lookup, true);
  assert.equal(matrix.resident.quota_overview, true);
  assert.equal(matrix.resident.resident_card_lookup, true);

  assert.equal(matrix.editor.query_friends, false);
  assert.equal(matrix.editor.guestbook_write, true);
  assert.equal(matrix.editor.plot_lookup, true);
  assert.equal(matrix.editor.quota_overview, true);
  assert.equal(matrix.editor.resident_card_lookup, true);

  assert.equal(matrix.admin.query_friends, true);
  assert.equal(matrix.admin.guestbook_write, true);
  assert.equal(matrix.admin.plot_lookup, true);
  assert.equal(matrix.admin.quota_overview, true);
  assert.equal(matrix.admin.resident_card_lookup, true);

  // 无身份（role=null）：安全默认，任何工具都不可用（含公开工具）——
  // 未登录用户不提供数据，模型会转述"需要身份信息"；登录后的低权限
  // viewer 角色才可访问公开工具。
  assert.equal(matrix.null.query_friends, false);
  assert.equal(matrix.null.guestbook_write, false);
  assert.equal(matrix.null.plot_lookup, false);
  assert.equal(matrix.null.quota_overview, false);
  assert.equal(matrix.null.resident_card_lookup, false);
});

test('ToolAuth：未知工具与未知角色返回结构化错误而非异常', () => {
  const unknownTool = checkToolRole({ name: 'not_a_tool', context: { role: 'admin' } });
  assert.equal(unknownTool.ok, false);
  assert.match(unknownTool.error, /unknown tool/);

  const unknownRole = checkToolRole({ name: 'plot_lookup', context: { role: 'superuser' } });
  assert.equal(unknownRole.ok, false);
  assert.match(unknownRole.error, /requires role/);
});
