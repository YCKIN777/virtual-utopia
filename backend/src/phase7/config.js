import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(currentDirectory, '../..');
const rootDirectory = path.resolve(backendDirectory, '..');

/**
 * 阶段七（空间社交内容层）配置。
 *
 * 存储选型：JSON 文件分片（不引入重型数据库），与既有 SQLite 主存并存——
 * 本层只负责「内容层 + 检索层 + 导出/备份」，不改动既有 phase6 数据。
 */
export const PHASE7_VERSION = '1.0.0';

export const PHASE7_LIMITS = Object.freeze({
  /** 单会话/单频道消息超过该条数即自动归档历史片段 */
  shardSize: 2000,
  listDefaultLimit: 60,
  listMaxLimit: 200,
  maxTextLength: 500,
  maxCommentLength: 300,
  maxTitleLength: 80,
  maxBodyLength: 2000,
  maxSearchResults: 50,
  maxExportMessages: 8000,
  maxExportEntries: 2000,
});

/** 七大交流场景 → 稳定场景标识（写入消息 scene.zone 字段） */
export const SOCIAL_SCENES = Object.freeze([
  { id: 'plaza', label: '中心广场穹顶公共交流', channel: 'public', radius: 24 },
  { id: 'home_gate', label: '宅院门口邻里交流', channel: 'direct', radius: 7 },
  { id: 'home_interior', label: '宅院内部私密交流', channel: 'interior', radius: 7 },
  { id: 'river', label: '河岸步道小桥偶遇交流', channel: 'encounter', radius: 9 },
  { id: 'plaza_edge', label: '广场周边休闲交流', channel: 'local', radius: 26 },
  { id: 'mountain', label: '山脚全区域自由交流', channel: 'local', radius: 18 },
  { id: 'async', label: '主页异步交流', channel: 'async', radius: 0 },
]);

export const PROFILE_BOARDS = Object.freeze([
  'work_plan',
  'travel_log',
  'life_note',
  'board',
]);

export const readPhase7Config = (environment = process.env) => ({
  enabled: environment.PHASE7_ENABLED !== 'false',
  dataDirectory: path.resolve(
    environment.PHASE7_DATA_DIR || path.join(rootDirectory, 'data'),
  ),
  backupDirectory: path.resolve(
    environment.PHASE7_BACKUP_DIR || path.join(rootDirectory, 'backups'),
  ),
});

export const phase7Paths = (dataDirectory) => ({
  dataDirectory,
  publicChat: path.join(dataDirectory, 'public', 'public_chat.json'),
  usersDirectory: path.join(dataDirectory, 'users'),
  index: path.join(dataDirectory, 'index', 'search_index.json'),
  exportsDirectory: path.join(dataDirectory, 'exports'),
  homesDirectory: path.join(dataDirectory, 'homes'),
});
