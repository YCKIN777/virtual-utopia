// backend/src/ai/tools/auth.js
// P4: ToolAuth —— 工具权限二次校验（不依赖模型自律，延续 guard.js 思想）。
// 每个工具在注册时声明允许的最小角色集，执行前由包装器校验。
// 校验失败不抛异常（避免中断图执行），返回结构化错误让模型理解并转述。
export const TOOL_ROLE_RULES = Object.freeze({
  query_friends: ['resident', 'admin'], // 好友/私聊：viewer 禁用
  guestbook_write: ['editor', 'admin'], // 留言簿写入：editor+
  plot_lookup: ['viewer', 'resident', 'editor', 'admin'], // 宅院查询：公开
  quota_overview: ['viewer', 'resident', 'editor', 'admin'], // 名额统计：公开
  resident_card_lookup: ['viewer', 'resident', 'editor', 'admin'], // 居民卡片公开读
});

export const checkToolRole = ({ name, context }) => {
  const allowedRoles = TOOL_ROLE_RULES[name];

  if (!allowedRoles) {
    return {
      ok: false,
      error: `unknown tool: ${name}`,
    };
  }

  const role = context?.role ?? null;

  if (!allowedRoles.includes(role)) {
    return {
      ok: false,
      error: `tool ${name} requires role in [${allowedRoles.join(', ')}], got: ${role}`,
    };
  }

  return { ok: true };
};
