// backend/src/memory/impression.mjs
// P5.7 记忆深化①：居民对访客的印象档案（规则式，零 LLM 成本）。
// 存储复用 world_state 表（kind='global'——CHECK 约束只允许 scene/npc/global）：key = impression:<residentId>:<userId>
// payload = { tags: string[], relation: -2..+2, lastTalk, count }
// 规则：对话计数 +1；积极/邀请/感谢词提升关系值（上限 +2）；抱怨/冲突词降低（下限 -2）；
// 高频主题词累积 tags（最多 8 条，去重）。

const POSITIVE_WORDS = [
  '谢谢', '感谢', '欢迎', '邀请', '一起', '好啊', '喜欢', '开心',
  '帮忙', '串门', '聚', '玩', '喝茶', '吃饭', '真棒', '太好了',
];
const NEGATIVE_WORDS = [
  '讨厌', '不行', '拒绝', '不要', '滚', '烦', '生气', '失望',
  '抱怨', '吵架', '凭什么', '差劲', '没意思',
];

const pickTopic = (text) => {
  const topics = [
    ['孩子', '孩子'], ['种菜', '种菜'], ['种花', '花'], ['做饭', '饭'],
    ['工作', '工作'], ['邻居', '邻居'], ['天气', '天气'], ['家谱', '家谱'],
    ['申请', '申请'], ['审批', '审批'], ['资源', '资源'], ['议事', '议事'],
    ['读书', '书'], ['心情', '心情'], ['健康', '健康'], ['散步', '散步'],
  ];
  return topics
    .filter(([word]) => text.includes(word))
    .map(([, label]) => label)
    .slice(0, 3);
};

export const createImpressionStore = ({ db, worldState }) => {
  const keyFor = (residentId, userId) => `impression:${residentId}:${userId}`;

  const get = (residentId, userId) => {
    const record = worldState.get(keyFor(residentId, userId));
    return record?.payload || null;
  };

  /**
   * 读取阶段：按 residentId + userId 取印象（供 prompt 注入）。
   */
  const before = (residentId, userId) => {
    if (!residentId || !userId) {
      return null;
    }
    return get(residentId, userId);
  };

  /**
   * 写入阶段：用本轮对话更新印象（规则式）。
   * @param {object} param0
   * @param {string} param0.residentId 居民（分支角色）id
   * @param {string|number} param0.userId 访客 id
   * @param {string} param0.userContent 访客本轮输入
   * @param {string} [param0.reply] 居民回复
   */
  const after = ({ residentId, userId, userContent, reply }) => {
    if (!residentId || !userId || !userContent) {
      return null;
    }

    const existing = get(residentId, userId) || {
      tags: [],
      relation: 0,
      count: 0,
      lastTalk: null,
    };
    const text = `${userContent} ${reply || ''}`;
    let relation = existing.relation;

    for (const word of POSITIVE_WORDS) {
      if (text.includes(word)) {
        relation = Math.min(2, relation + 1);
        break;
      }
    }
    for (const word of NEGATIVE_WORDS) {
      if (text.includes(word)) {
        relation = Math.max(-2, relation - 1);
        break;
      }
    }

    const tags = [...new Set([...existing.tags, ...pickTopic(text)])].slice(0, 8);
    const next = {
      tags,
      relation,
      count: (existing.count || 0) + 1,
      lastTalk: new Date().toISOString(),
    };

    worldState.set({ key: keyFor(residentId, userId), kind: 'global', payload: next });
    return next;
  };

  return Object.freeze({ get, before, after });
};
