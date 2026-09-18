export const SCENE_CATALOG = Object.freeze({
  yard: Object.freeze({
    id: 'yard',
    name: '大院',
    agentEnabled: true,
  }),
  'resource-wall': Object.freeze({
    id: 'resource-wall',
    name: '资源墙',
    agentEnabled: true,
  }),
  pavilion: Object.freeze({
    id: 'pavilion',
    name: '议事亭',
    agentEnabled: true,
  }),
  library: Object.freeze({
    id: 'library',
    name: '书屋',
    agentEnabled: true,
  }),
  cabin: Object.freeze({
    id: 'cabin',
    name: '小屋',
    agentEnabled: true,
  }),
  'far-forest': Object.freeze({
    id: 'far-forest',
    name: '远林',
    agentEnabled: false,
  }),
});

export const getSceneDefinition = (sceneId) => SCENE_CATALOG[sceneId];

export const isKnownScene = (sceneId) => Object.hasOwn(SCENE_CATALOG, sceneId);

export const isSceneAgentEnabled = (sceneId) =>
  getSceneDefinition(sceneId)?.agentEnabled === true;
