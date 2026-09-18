const viteEnv = import.meta.env || {};

export const phase6RuntimeConfig = Object.freeze({
  appTitle: viteEnv.VITE_APP_TITLE || '虚拟乌托邦 BP2 管理台',
  phase6ApiBaseUrl: viteEnv.VITE_PHASE6_API_BASE_URL || 'http://localhost:3400',
});

export const documentStatusOptions = Object.freeze([
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待处理' },
  { value: 'indexed', label: '已入库' },
  { value: 'failed', label: '失败' },
  { value: 'deleted', label: '已删除' },
]);

export const sceneOptions = Object.freeze([
  { value: '', label: '全部场景' },
  { value: 'yard', label: '大院' },
  { value: 'pavilion', label: '议事亭' },
  { value: 'resource-wall', label: '资源墙' },
  { value: 'library', label: '书屋' },
  { value: 'cabin', label: '小屋' },
  { value: 'far-forest', label: '远林' },
]);

export const sessionTypeOptions = Object.freeze([
  { value: '', label: '全部类型' },
  { value: 'public', label: '公开会话' },
  { value: 'private', label: '私聊会话' },
]);
