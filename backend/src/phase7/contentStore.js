import path from 'node:path';
import { PHASE7_LIMITS, PROFILE_BOARDS, phase7Paths } from './config.js';
import {
  ensureDirectory,
  listJsonFiles,
  readJson,
  removeFile,
  safeSegment,
  writeJson,
} from './jsonFile.js';

const nowIso = () => new Date().toISOString();

const createId = (prefix) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export const HOME_ACCESS_MODES = Object.freeze(['open', 'friends', 'closed']);

/** 场景位置：仅保留有限数值并裁剪精度 */
export const normalizeScene = (scene) => {
  if (!scene || typeof scene !== 'object') {
    return null;
  }
  const x = Number(scene.x);
  const y = Number(scene.y);
  const z = Number(scene.z);
  if (![x, y, z].every(Number.isFinite)) {
    return null;
  }
  return {
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    z: Number(z.toFixed(2)),
    zone: typeof scene.zone === 'string' ? scene.zone.slice(0, 32) : null,
  };
};

export const pairKey = (leftId, rightId) =>
  [String(leftId), String(rightId)].sort().join('~');

/**
 * 阶段七内容层：JSON 文件分片存储。
 *
 * 目录结构：
 *   data/public/public_chat.json                广场公共频道
 *   data/users/<userId>/profile.json            个人主页四板块 + 评论留言
 *   data/users/<userId>/direct/<peerId>.json    双人私聊会话（含归档分片）
 *   data/homes/<plotId>.json                    宅院交流权限（全开/仅好友/闭门）
 *
 * 消息字段：消息ID / 发送人ID / 接收对象或频道 / 文本 / 时间戳 / 场景位置。
 */
export const createContentStore = ({ dataDirectory, searchIndex }) => {
  const paths = phase7Paths(dataDirectory);

  const userDirectory = (userId) =>
    path.join(paths.usersDirectory, safeSegment(userId));
  const profilePath = (userId) =>
    path.join(userDirectory(userId), 'profile.json');
  const directDirectory = (userId) =>
    path.join(userDirectory(userId), 'direct');
  const directPath = (userId, peerId) =>
    path.join(directDirectory(userId), `${safeSegment(peerId)}.json`);
  const homePath = (plotId) =>
    path.join(paths.homesDirectory, `${safeSegment(plotId)}.json`);

  const emptyProfile = (ownerId) => ({
    version: 1,
    ownerId,
    entries: [],
    comments: {},
    updatedAt: nowIso(),
  });

  const readProfileFile = (ownerId) =>
    readJson(profilePath(ownerId), null) || emptyProfile(ownerId);

  const entryDoc = (ownerId, ownerName, entry) => ({
    id: `entry:${ownerId}:${entry.id}`,
    type: 'profile_entry',
    ownerId,
    ownerName: ownerName || ownerId,
    visibility: entry.visibility,
    channel: 'async',
    text: `${entry.title || ''} ${entry.body || ''}`.trim(),
    at: entry.updatedAt || entry.createdAt,
    ref: { kind: 'profile_entry', ownerId, entryId: entry.id, board: entry.board },
  });

  const commentDoc = (ownerId, ownerName, entryId, comment, visibility) => ({
    id: `comment:${ownerId}:${entryId}:${comment.id}`,
    type: 'profile_comment',
    ownerId,
    ownerName: ownerName || ownerId,
    visibility,
    channel: 'async',
    text: comment.text,
    at: comment.createdAt,
    ref: { kind: 'profile_comment', ownerId, entryId, commentId: comment.id },
  });

  return {
    paths,
    dataDirectory,

    // —— ① 广场公共频道（全员可见） ——
    appendPublicMessage({ fromUserId, fromUsername, text, scene, channel = 'public' }) {
      const file = readJson(paths.publicChat, null) || {
        version: 1,
        channel: 'public',
        archives: [],
        messages: [],
      };
      const message = {
        id: createId('pub'),
        fromUserId,
        fromUsername: fromUsername || fromUserId,
        target: 'public',
        channel,
        text,
        createdAt: nowIso(),
        scene: normalizeScene(scene),
      };
      file.messages.push(message);
      file.updatedAt = message.createdAt;
      // 自动分片：超过阈值把最旧的一批归档到独立片段，防止单文件过大
      if (file.messages.length > PHASE7_LIMITS.shardSize) {
        const overflow = file.messages.splice(
          0,
          file.messages.length - PHASE7_LIMITS.shardSize,
        );
        const archiveName = `public_chat.archive-${Date.now().toString(36)}.json`;
        writeJson(path.join(path.dirname(paths.publicChat), archiveName), {
          version: 1,
          channel: 'public',
          archivedAt: nowIso(),
          messages: overflow,
        });
        file.archives = [...(file.archives || []), archiveName].slice(-20);
      }
      writeJson(paths.publicChat, file);
      searchIndex?.upsert({
        id: `public:${message.id}`,
        type: 'public_chat',
        ownerId: fromUserId,
        ownerName: message.fromUsername,
        visibility: 'public',
        channel: 'public',
        text: message.text,
        at: message.createdAt,
        ref: { kind: 'public_chat', messageId: message.id },
      });
      return message;
    },

    listPublicMessages({ limit = PHASE7_LIMITS.listDefaultLimit } = {}) {
      const file = readJson(paths.publicChat, null);
      if (!file?.messages?.length) {
        return [];
      }
      return file.messages.slice(-Math.max(1, limit));
    },

    publicChatStats() {
      const file = readJson(paths.publicChat, null);
      return {
        messages: file?.messages?.length || 0,
        archives: (file?.archives || []).length,
        updatedAt: file?.updatedAt || null,
      };
    },

    // —— ② 双人私聊会话（双方各存一份镜像，仅双方可读） ——
    appendDirectMessage({
      fromUserId,
      fromUsername,
      toUserId,
      toUsername,
      text,
      scene,
      channel = 'direct',
    }) {
      const message = {
        id: createId('dm'),
        fromUserId,
        fromUsername: fromUsername || fromUserId,
        toUserId,
        target: toUserId,
        channel,
        text,
        createdAt: nowIso(),
        scene: normalizeScene(scene),
      };
      this.writeConversation(fromUserId, toUserId, message);
      this.writeConversation(toUserId, fromUserId, message);
      searchIndex?.upsert({
        id: `direct:${pairKey(fromUserId, toUserId)}:${message.id}`,
        type: 'direct_chat',
        ownerId: fromUserId,
        ownerName: message.fromUsername,
        visibility: 'direct',
        participants: [String(fromUserId), String(toUserId)],
        channel,
        text: message.text,
        at: message.createdAt,
        ref: {
          kind: 'direct_chat',
          messageId: message.id,
          peerId: toUserId,
          fromUserId,
        },
      });
      return message;
    },

    /** 写入某一侧会话文件；超过阈值时把最旧一批归档到片段文件 */
    writeConversation(ownerId, peerId, message) {
      const file = readJson(directPath(ownerId, peerId), null) || {
        version: 1,
        ownerId,
        peerId,
        archives: [],
        messages: [],
      };
      file.messages.push(message);
      file.updatedAt = message.createdAt;
      if (file.messages.length > PHASE7_LIMITS.shardSize) {
        const overflow = file.messages.splice(
          0,
          file.messages.length - PHASE7_LIMITS.shardSize,
        );
        const archiveName = `${safeSegment(peerId)}.archive-${Date.now().toString(36)}.json`;
        writeJson(path.join(directDirectory(ownerId), archiveName), {
          version: 1,
          ownerId,
          peerId,
          archivedAt: nowIso(),
          messages: overflow,
        });
        file.archives = [...(file.archives || []), archiveName].slice(-20);
      }
      writeJson(directPath(ownerId, peerId), file);
      return file;
    },

    listConversation({ viewerId, peerId, limit = PHASE7_LIMITS.listDefaultLimit }) {
      const file = readJson(directPath(viewerId, peerId), null);
      if (!file?.messages?.length) {
        return [];
      }
      return file.messages.slice(-Math.max(1, limit));
    },

    listConversationPeers(userId) {
      return listJsonFiles(directDirectory(userId))
        .filter((name) => !name.includes('.archive-'))
        .map((name) => name.replace(/\.json$/, ''));
    },

    // —— ③ 个人主页（四板块 + 公开/私密 + 评论留言） ——
    readProfile(ownerId) {
      return readProfileFile(ownerId);
    },

    /** 按访问者身份裁剪：私密条目仅作者本人可读 */
    readVisibleProfile({ ownerId, viewerId, isResident }) {
      const profile = readProfileFile(ownerId);
      const isOwner = String(ownerId) === String(viewerId);
      if (isOwner) {
        return { ownerId, isOwner: true, entries: profile.entries, comments: profile.comments };
      }
      if (!isResident) {
        return { ownerId, isOwner: false, entries: [], comments: {} };
      }
      const entries = profile.entries.filter((entry) => entry.visibility === 'public');
      const allowed = new Set(entries.map((entry) => entry.id));
      const comments = Object.fromEntries(
        Object.entries(profile.comments).filter(([entryId]) => allowed.has(entryId)),
      );
      return { ownerId, isOwner: false, entries, comments };
    },

    upsertProfileEntry({
      ownerId,
      ownerName,
      entryId,
      board,
      title,
      body,
      images = [],
      visibility = 'public',
    }) {
      if (!PROFILE_BOARDS.includes(board)) {
        throw new Error(`invalid board: ${board}`);
      }
      if (!['public', 'private'].includes(visibility)) {
        throw new Error(`invalid visibility: ${visibility}`);
      }
      const profile = readProfileFile(ownerId);
      const stamp = nowIso();
      let entry = entryId
        ? profile.entries.find((item) => item.id === entryId)
        : null;
      if (entry) {
        Object.assign(entry, { board, title, body, images, visibility, updatedAt: stamp });
      } else {
        entry = {
          id: createId('entry'),
          board,
          title,
          body,
          images,
          visibility,
          createdAt: stamp,
          updatedAt: stamp,
        };
        profile.entries.push(entry);
      }
      profile.updatedAt = stamp;
      writeJson(profilePath(ownerId), profile);

      searchIndex?.upsert(entryDoc(ownerId, ownerName, entry));
      (profile.comments[entry.id] || []).forEach((comment) => {
        searchIndex?.upsert(
          commentDoc(ownerId, ownerName, entry.id, comment, entry.visibility),
        );
      });
      return entry;
    },

    deleteProfileEntry({ ownerId, entryId }) {
      const profile = readProfileFile(ownerId);
      const entry = profile.entries.find((item) => item.id === entryId);
      if (!entry) {
        return null;
      }
      profile.entries = profile.entries.filter((item) => item.id !== entryId);
      const comments = profile.comments[entryId] || [];
      delete profile.comments[entryId];
      profile.updatedAt = nowIso();
      writeJson(profilePath(ownerId), profile);
      searchIndex?.removeMany([
        `entry:${ownerId}:${entryId}`,
        ...comments.map((comment) => `comment:${ownerId}:${entryId}:${comment.id}`),
      ]);
      return entry;
    },

    addProfileComment({ ownerId, ownerName, entryId, fromUserId, fromUsername, text }) {
      const profile = readProfileFile(ownerId);
      const entry = profile.entries.find((item) => item.id === entryId);
      if (!entry) {
        return null;
      }
      const comment = {
        id: createId('cmt'),
        entryId,
        fromUserId,
        fromUsername: fromUsername || fromUserId,
        text,
        createdAt: nowIso(),
      };
      profile.comments[entryId] = [...(profile.comments[entryId] || []), comment];
      profile.updatedAt = comment.createdAt;
      writeJson(profilePath(ownerId), profile);
      searchIndex?.upsert(
        commentDoc(ownerId, ownerName, entryId, comment, entry.visibility),
      );
      return comment;
    },

    deleteProfileComment({ ownerId, entryId, commentId }) {
      const profile = readProfileFile(ownerId);
      const comments = profile.comments[entryId] || [];
      const comment = comments.find((item) => item.id === commentId);
      if (!comment) {
        return null;
      }
      profile.comments[entryId] = comments.filter((item) => item.id !== commentId);
      profile.updatedAt = nowIso();
      writeJson(profilePath(ownerId), profile);
      searchIndex?.remove(`comment:${ownerId}:${entryId}:${commentId}`);
      return comment;
    },

    listProfileEntriesForOwner(ownerId) {
      return readProfileFile(ownerId).entries;
    },

    // —— ④ 宅院交流权限（每户：全开 / 仅好友 / 闭门） ——
    readHomeAccess(plotId) {
      return (
        readJson(homePath(plotId), null) || {
          version: 1,
          plotId,
          ownerId: null,
          mode: 'open',
          updatedBy: null,
          updatedAt: null,
        }
      );
    },

    writeHomeAccess({ plotId, ownerId, mode, updatedBy }) {
      if (!HOME_ACCESS_MODES.includes(mode)) {
        throw new Error(`invalid home access mode: ${mode}`);
      }
      const record = {
        version: 1,
        plotId,
        ownerId: ownerId ?? null,
        mode,
        updatedBy: updatedBy ?? null,
        updatedAt: nowIso(),
      };
      writeJson(homePath(plotId), record);
      return record;
    },

    listHomeAccess() {
      return listJsonFiles(paths.homesDirectory).map((name) =>
        readJson(path.join(paths.homesDirectory, name), null),
      ).filter(Boolean);
    },

    // —— ⑤ 导出 / 统计 ——
    exportUser({ userId, username }) {
      const profile = readProfileFile(userId);
      const peers = this.listConversationPeers(userId);
      const conversations = peers.map((peerId) => ({
        peerId,
        messages: this.listConversation({
          viewerId: userId,
          peerId,
          limit: PHASE7_LIMITS.maxExportMessages,
        }),
      }));
      const publicFile = readJson(paths.publicChat, null);
      const ownPublicMessages = (publicFile?.messages || []).filter(
        (message) => String(message.fromUserId) === String(userId),
      );
      const payload = {
        exportedAt: nowIso(),
        userId,
        username: username || userId,
        profile,
        conversations,
        publicMessages: ownPublicMessages,
        homeAccess: this.listHomeAccess().filter(
          (record) => String(record.ownerId) === String(userId),
        ),
      };
      const file = path.join(
        paths.exportsDirectory,
        `${safeSegment(userId)}-${Date.now()}.json`,
      );
      writeJson(file, payload);
      return { file, payload };
    },

    stats() {
      const usersDirectory = paths.usersDirectory;
      const userDirectories = listJsonFiles(usersDirectory);
      return {
        dataDirectory,
        publicChat: this.publicChatStats(),
        userFiles: userDirectories.length,
        index: searchIndex?.stats() || null,
      };
    },

    removeExport(file) {
      return removeFile(file);
    },

    ensureLayout() {
      ensureDirectory(paths.usersDirectory);
      ensureDirectory(path.dirname(paths.publicChat));
      ensureDirectory(paths.homesDirectory);
      ensureDirectory(paths.exportsDirectory);
      ensureDirectory(path.dirname(paths.index));
      return true;
    },
  };
};
