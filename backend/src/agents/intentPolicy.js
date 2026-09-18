const HIGH_RISK_PATTERNS = [
  {
    code: 'system_prompt_extraction',
    pattern:
      /(系统提示词|系统指令|system\s*prompt|developer\s*message|忽略.{0,8}(指令|规则)|越狱|jailbreak)/i,
  },
  {
    code: 'secret_extraction',
    pattern:
      /(api\s*key|访问密钥|密钥|access\s*token|api\s*token|bearer\s*token|密码|环境变量|\.env|数据库连接串)/i,
  },
];

const CROSS_SCOPE_PATTERN =
  /(切换.{0,6}(场景|角色)|扮演.{0,8}(其他|另一个).{0,8}(角色|智能体)|假装你是|进入其他场景)/i;

export const assessInputRisk = (content) => {
  const highRiskSignals = HIGH_RISK_PATTERNS.filter(({ pattern }) =>
    pattern.test(content),
  ).map(({ code }) => code);

  if (highRiskSignals.length > 0) {
    return {
      level: 'high',
      signals: highRiskSignals,
    };
  }

  if (CROSS_SCOPE_PATTERN.test(content)) {
    return {
      level: 'high',
      signals: ['cross_scene_role_switch'],
    };
  }

  return {
    level: 'low',
    signals: [],
  };
};

export const classifyIntent = (content) => {
  if (/^(你好|您好|嗨|hi|hello|在吗)[！!。.\s]*$/i.test(content)) {
    return 'greeting';
  }

  if (/(请|帮我|帮忙|生成|整理|创建|告诉我)/.test(content)) {
    return 'request';
  }

  if (/(建议|反馈|不满|喜欢|讨厌)/.test(content)) {
    return 'feedback';
  }

  if (
    /[?？]$/.test(content) ||
    /(什么|如何|为什么|是否|能否|怎么)/.test(content)
  ) {
    return 'question';
  }

  return 'unknown';
};
