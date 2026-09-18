/**
 * 轻量 LLM 客户端（记忆模块专用，独立于冻结代码，不引用 frozen services）。
 * 无 API Key 时自动进入 mock 模式（enabled=false），记忆提炼走启发式回退。
 */
const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';

export const createLlmClient = ({
  apiKey = process.env.DEEPSEEK_API_KEY,
  baseUrl = process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL,
  model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
} = {}) => {
  const enabled = Boolean(apiKey);

  const complete = async (
    messages,
    { temperature = 0.7, maxTokens = 1024 } = {},
  ) => {
    if (!enabled) return { content: '', mock: true };
    const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error('LLM 请求失败 ' + res.status + ': ' + text.slice(0, 200));
    }
    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      mock: false,
    };
  };

  const completeJson = async (messages, options = {}) => {
    const { content, mock } = await complete(messages, {
      ...options,
      temperature: 0.2,
    });
    if (mock) return null;
    try {
      const match = content.match(/\[[\s\S]*\]|{[\s\S]*}/);
      if (match) return JSON.parse(match[0]);
    } catch {
      // 解析失败返回 null，由调用方降级
    }
    return null;
  };

  return { enabled, complete, completeJson };
};
