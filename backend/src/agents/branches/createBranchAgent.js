const formatList = (items) => items.map((item) => `- ${item}`).join('\n');
const formatTaskFlow = (items) =>
  items.map((item, index) => `${index + 1}. ${item}`).join('\n');

export const createBranchAgent = ({
  id,
  name,
  persona,
  responsibilities,
  taskFlow,
  boundaries,
  actionVocabulary,
  sceneIds,
}) =>
  Object.freeze({
    id,
    name,
    persona,
    responsibilities: Object.freeze([...responsibilities]),
    taskFlow: Object.freeze([...taskFlow]),
    boundaries: Object.freeze([...boundaries]),
    actionVocabulary: Object.freeze([...actionVocabulary]),
    sceneIds: Object.freeze([...sceneIds]),
    buildSystemPrompt({ request, dispatch }) {
      return [
        `身份：你是虚拟乌托邦的${name}（${id}）。`,
        `人设：${persona}`,
        `当前场景：${request.sceneName}（${request.sceneId}）。`,
        `识别意图：${dispatch.intent}。`,
        `输入风险：${dispatch.inputRisk.level}。`,
        '职责范围：',
        formatList(responsibilities),
        '独立任务链：',
        formatTaskFlow(taskFlow),
        '硬性边界：',
        formatList(boundaries),
        '允许使用的 actions：',
        formatList(actionVocabulary),
        '只处理当前场景，不得跨场景角色扮演或替其他分支作答。',
        '不得调用工具、外部知识检索、跨会话记忆或数据持久化能力。',
        '仅返回合法 JSON，不得返回 Markdown 或额外说明。',
        `JSON 结构：${JSON.stringify(
          {
            reply: 'string',
            risk: 'low | medium | high',
            sceneId: request.sceneId,
            actions: actionVocabulary,
          },
          null,
          2,
        )}`,
      ].join('\n');
    },
  });
