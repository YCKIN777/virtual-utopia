export const SCENE_DEFINITIONS = Object.freeze({
  yard: '大院',
  pavilion: '议事亭',
  'resource-wall': '资源墙',
  library: '书屋',
  cabin: '小屋',
  'far-forest': '远林',
});

export class SceneRequestError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'SceneRequestError';
    this.statusCode = statusCode;
  }
}

const normalizeHistory = (history) => {
  if (history === undefined) {
    return [];
  }

  if (!Array.isArray(history) || history.length > 30) {
    throw new SceneRequestError(
      'history must be an array with at most 30 messages',
    );
  }

  return history.map((message) => {
    if (
      !message ||
      !['user', 'assistant'].includes(message.role) ||
      typeof message.content !== 'string' ||
      message.content.trim() === '' ||
      message.content.length > 8000
    ) {
      throw new SceneRequestError('history contains an invalid message');
    }

    return {
      role: message.role,
      content: message.content.trim(),
    };
  });
};

export const normalizeSceneRequest = (body) => {
  if (!body || typeof body !== 'object') {
    throw new SceneRequestError('request body must be an object');
  }

  const { sceneId, input, history, companions } = body;

  if (!Object.hasOwn(SCENE_DEFINITIONS, sceneId)) {
    throw new SceneRequestError('sceneId is not supported');
  }

  const content =
    typeof input === 'string' ? input.trim() : input?.content?.trim();

  if (!content || content.length > 8000) {
    throw new SceneRequestError(
      'input.content must contain 1 to 8000 characters',
    );
  }

  return {
    sceneId,
    sceneName: SCENE_DEFINITIONS[sceneId],
    input: {
      content,
    },
    history: normalizeHistory(history),
    companions: Array.isArray(companions)
      ? companions.filter((x) => typeof x === 'string').slice(0, 5)
      : undefined,
  };
};
