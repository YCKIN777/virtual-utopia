export const RESIDENT_CHAT_DISTANCE = 4.0;

export const seedResidents = [
  {
    avatarId: 'resident-1',
    residentName: '阿岚',
    homePlotId: 'plot-2',
    avatarColor: '#7a4b3a',
    hairColor: '#2b2620',
  },
  {
    avatarId: 'resident-2',
    residentName: '苏禾',
    homePlotId: 'plot-15',
    avatarColor: '#3a5a8a',
    hairColor: '#4a3b2a',
  },
  {
    avatarId: 'resident-3',
    residentName: '林涧',
    homePlotId: 'plot-25',
    avatarColor: '#5a3a6a',
    hairColor: '#6b4a2a',
  },
  {
    avatarId: 'resident-4',
    residentName: '白石',
    homePlotId: 'plot-40',
    avatarColor: '#7a6b3a',
    hairColor: '#8a6a3a',
  },
  {
    avatarId: 'resident-5',
    residentName: '墨竹',
    homePlotId: 'plot-48',
    avatarColor: '#b04a3a',
    hairColor: '#c9a24a',
  },
];

// P5.7 约伴移动：与后端分支角色对应的 5 位居民 NPC（avatarId 与后端 branch id 一致，
// 3D 世界按后端 world_state（npc:<id> -> sceneId）把 TA 们移动到对应场景聚点）
export const dialogueResidents = [
  {
    avatarId: 'ahe',
    residentName: '阿禾',
    homePlotId: 'plot-3',
    avatarColor: '#4f8f7b',
    hairColor: '#2b2620',
  },
  {
    avatarId: 'zhiyu',
    residentName: '知予',
    homePlotId: 'plot-8',
    avatarColor: '#3a6b9a',
    hairColor: '#4a3b2a',
  },
  {
    avatarId: 'xubai',
    residentName: '叙白',
    homePlotId: 'plot-20',
    avatarColor: '#8a7b4a',
    hairColor: '#5b4a2a',
  },
  {
    avatarId: 'suian',
    residentName: '岁安',
    homePlotId: 'plot-35',
    avatarColor: '#6a4a7a',
    hairColor: '#4a3a4a',
  },
  {
    avatarId: 'fenghe',
    residentName: '风禾',
    homePlotId: 'plot-45',
    avatarColor: '#b0604a',
    hairColor: '#8a5a3a',
  },
];

// P5.7 场景聚点坐标（3D 世界坐标）：中心生活广场为 (0, 3.6, 22.6)，
// 五个对话场景分布在广场周边 ±10m，居民聚会时走到对应聚点。
export const SCENE_GATHER_POINTS = Object.freeze({
  yard: { x: -3, z: 20 },
  pavilion: { x: 8, z: 27 },
  'resource-wall': { x: -9, z: 15 },
  library: { x: 11, z: 17 },
  cabin: { x: -7, z: 31 },
  'far-forest': { x: 18, z: 34 },
  'plaza': { x: 0, z: 22.6 },
});

export const getGatherPoint = (sceneId) => SCENE_GATHER_POINTS[sceneId] || null;

export const getResidentByAvatarId = (avatarId) =>
  seedResidents.find((resident) => resident.avatarId === avatarId) ||
  dialogueResidents.find((resident) => resident.avatarId === avatarId) ||
  null;
