import express from 'express';

import {
  Phase6ForbiddenError,
  Phase6NotFoundError,
  Phase6UnauthorizedError,
  Phase6ValidationError,
} from '../phase6/errors.js';
import {
  HOME_ACCESS_MODES,
  normalizeScene,
  createContentStore,
} from './contentStore.js';
import {
  PHASE7_LIMITS,
  PHASE7_VERSION,
  PROFILE_BOARDS,
  SOCIAL_SCENES,
} from './config.js';
import { createBackupService } from './backupService.js';
import { createSearchIndex } from './searchIndex.js';
import { createSearchService } from './searchService.js';

const RESIDENT_ROLES = ['admin', 'editor'];

const asyncHandler = (handler) => (request, response, next) =>
  Promise.resolve(handler(request, response, next)).catch(next);

const readLimit = (query, fallback = PHASE7_LIMITS.listDefaultLimit) => {
  const parsed = Number.parseInt(query?.limit, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.min(parsed, PHASE7_LIMITS.listMaxLimit));
};

const readText = (value, max, field) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) {
    throw new Phase6ValidationError(`${field} 不能为空`);
  }
  if (text.length > max) {
    throw new Phase6ValidationError(`${field} 长度需在 1~${max} 之间`);
  }
  return text;
};

/**
 * 阶段七路由：空间社交内容层。
 *
 * 挂在 phase6 应用内（`/api/phase7/...`），因此复用同一套
 * 鉴权（phase5 token）、错误处理与限流包装。
 */
export const createPhase7Router = ({
  phase6Config,
  authenticate,
  visitorQuotaStore,
  friendStore,
  dataDirectory,
}) => {
  const searchIndex = createSearchIndex({ dataDirectory });
  const contentStore = createContentStore({ dataDirectory, searchIndex });
  const searchService = createSearchService({ searchIndex });
  const backupService = createBackupService({
    dataDirectory,
    backupDirectory: phase6Config.phase7BackupDirectory,
  });

  contentStore.ensureLayout();

  const router = express.Router();

  const requireUser = async (request) => {
    const authorization = request.get('authorization');
    if (!authorization) {
      throw new Phase6UnauthorizedError('Authorization header is required');
    }
    return authenticate(authorization);
  };

  /** 正式原住民门禁：访客（viewer）无任何空间社交权限 */
  const ensureResident = (user) => {
    if (!RESIDENT_ROLES.includes(user?.role)) {
      throw new Phase6ForbiddenError('访客暂无空间社交权限');
    }
  };

  const ensureAdmin = (user) => {
    if (user?.role !== 'admin') {
      throw new Phase6ForbiddenError('仅管理员可执行该操作');
    }
  };

  const residentsCache = () => {
    try {
      return visitorQuotaStore?.listResidents?.() || [];
    } catch {
      return [];
    }
  };

  const findResident = (userId) =>
    residentsCache().find(
      (resident) => String(resident.userId) === String(userId),
    ) || null;

  /** 'me' 别名：便于前端以自身身份调用 */
  const resolveOwnerId = (raw, user) =>
    String(raw) === 'me' ? String(user.id) : String(raw);

  const residentName = (userId, fallback = '') =>
    findResident(userId)?.displayName || fallback || String(userId);

  // —— 元信息 ——
  router.get('/phase7/health', (_request, response) => {
    response.json({
      service: 'virtual-utopia-phase7',
      version: PHASE7_VERSION,
      dataDirectory,
      scenes: SOCIAL_SCENES.length,
      index: searchIndex.stats(),
    });
  });

  router.get('/phase7/scenes', (_request, response) => {
    response.json({ scenes: SOCIAL_SCENES, boards: PROFILE_BOARDS });
  });

  // —— ① 广场公共频道（全员可见，无人数限制） ——
  router.get(
    '/phase7/public-chat',
    asyncHandler(async (request, response) => {
      const user = await requireUser(request);
      ensureResident(user);
      response.json({
        channel: 'public',
        messages: contentStore.listPublicMessages({ limit: readLimit(request.query) }),
      });
    }),
  );

  router.post(
    '/phase7/public-chat',
    asyncHandler(async (request, response) => {
      const user = await requireUser(request);
      ensureResident(user);
      const text = readText(request.body?.text, PHASE7_LIMITS.maxTextLength, '发言内容');
      const message = contentStore.appendPublicMessage({
        fromUserId: user.id,
        fromUsername: residentName(user.id, user.username),
        text,
        scene: normalizeScene(request.body?.scene),
        channel: 'public',
      });
      response.status(201).json({ message });
    }),
  );

  // —— ②③④⑤⑥ 就近私聊 / 偶遇 / 休闲 / 山脚自由交流（统一走双人会话） ——
  router.get(
    '/phase7/direct/:peerId',
    asyncHandler(async (request, response) => {
      const user = await requireUser(request);
      ensureResident(user);
      const peerId = String(request.params.peerId);
      response.json({
        peerId,
        peerName: residentName(peerId),
        messages: contentStore.listConversation({
          viewerId: user.id,
          peerId,
          limit: readLimit(request.query),
        }),
      });
    }),
  );

  router.post(
    '/phase7/direct/:peerId',
    asyncHandler(async (request, response) => {
      const user = await requireUser(request);
      ensureResident(user);
      const peerId = String(request.params.peerId);
      if (peerId === String(user.id)) {
        throw new Phase6ValidationError('不能给自己发送私聊');
      }

      const peer = findResident(peerId);
      if (!peer || peer.status !== 'active') {
        throw new Phase6NotFoundError('对方不是有效原住民');
      }

      const text = readText(request.body?.text, PHASE7_LIMITS.maxTextLength, '消息内容');
      const channel = ['direct', 'encounter', 'interior', 'local'].includes(
        request.body?.channel,
      )
        ? request.body.channel
        : 'direct';

      const message = contentStore.appendDirectMessage({
        fromUserId: user.id,
        fromUsername: residentName(user.id, user.username),
        toUserId: peerId,
        toUsername: peer.displayName || peer.username,
        text,
        scene: normalizeScene(request.body?.scene),
        channel,
      });
      response.status(201).json({ message });
    }),
  );

  // —— ⑦ 主页：四板块 + 公开/私密 + 评论留言（异步交流） ——
  router.get(
    '/phase7/profile/me',
    asyncHandler(async (request, response) => {
      const user = await requireUser(request);
      ensureResident(user);
      const profile = contentStore.readProfile(user.id);
      response.json({
        ownerId: user.id,
        ownerName: residentName(user.id, user.username),
        entries: profile.entries,
        comments: profile.comments,
      });
    }),
  );

  router.get(
    '/phase7/profile/:userId',
    asyncHandler(async (request, response) => {
      const user = await requireUser(request);
      ensureResident(user);
      const ownerId = resolveOwnerId(request.params.userId, user);
      const view = contentStore.readVisibleProfile({
        ownerId,
        viewerId: user.id,
        isResident: true,
      });
      response.json({
        ownerId,
        ownerName: residentName(ownerId),
        isOwner: view.isOwner,
        entries: view.entries,
        comments: view.comments,
      });
    }),
  );

  router.put(
    '/phase7/profile/entries',
    asyncHandler(async (request, response) => {
      const user = await requireUser(request);
      ensureResident(user);
      const board = String(request.body?.board || '');
      if (!PROFILE_BOARDS.includes(board)) {
        throw new Phase6ValidationError('板块类型不合法');
      }
      const title = readText(request.body?.title, PHASE7_LIMITS.maxTitleLength, '标题');
      const body = String(request.body?.body ?? '').slice(0, PHASE7_LIMITS.maxBodyLength);
      const visibility = request.body?.visibility === 'private' ? 'private' : 'public';
      const images = Array.isArray(request.body?.images)
        ? request.body.images.slice(0, 6).map((item) => String(item).slice(0, 512))
        : [];
      const entry = contentStore.upsertProfileEntry({
        ownerId: user.id,
        ownerName: residentName(user.id, user.username),
        entryId: request.body?.id ? String(request.body.id) : undefined,
        board,
        title,
        body,
        images,
        visibility,
      });
      response.status(201).json({ entry });
    }),
  );

  router.delete(
    '/phase7/profile/entries/:entryId',
    asyncHandler(async (request, response) => {
      const user = await requireUser(request);
      ensureResident(user);
      const entry = contentStore.deleteProfileEntry({
        ownerId: user.id,
        entryId: String(request.params.entryId),
      });
      if (!entry) {
        throw new Phase6NotFoundError('条目不存在');
      }
      response.json({ entry });
    }),
  );

  router.get(
    '/phase7/profile/:ownerId/entries/:entryId/comments',
    asyncHandler(async (request, response) => {
      const user = await requireUser(request);
      ensureResident(user);
      const ownerId = resolveOwnerId(request.params.ownerId, user);
      const entryId = String(request.params.entryId);
      const view = contentStore.readVisibleProfile({
        ownerId,
        viewerId: user.id,
        isResident: true,
      });
      if (!view.entries.some((entry) => entry.id === entryId)) {
        throw new Phase6ForbiddenError('该条目不可见');
      }
      response.json({ comments: view.comments[entryId] || [] });
    }),
  );

  router.post(
    '/phase7/profile/:ownerId/entries/:entryId/comments',
    asyncHandler(async (request, response) => {
      const user = await requireUser(request);
      ensureResident(user);
      const ownerId = resolveOwnerId(request.params.ownerId, user);
      const entryId = String(request.params.entryId);
      const view = contentStore.readVisibleProfile({
        ownerId,
        viewerId: user.id,
        isResident: true,
      });
      if (!view.entries.some((entry) => entry.id === entryId)) {
        throw new Phase6ForbiddenError('该条目不可见或为私密内容');
      }
      const text = readText(
        request.body?.text,
        PHASE7_LIMITS.maxCommentLength,
        '留言内容',
      );
      const comment = contentStore.addProfileComment({
        ownerId,
        ownerName: residentName(ownerId),
        entryId,
        fromUserId: user.id,
        fromUsername: residentName(user.id, user.username),
        text,
      });
      response.status(201).json({ comment });
    }),
  );

  router.delete(
    '/phase7/profile/:ownerId/entries/:entryId/comments/:commentId',
    asyncHandler(async (request, response) => {
      const user = await requireUser(request);
      ensureResident(user);
      const ownerId = resolveOwnerId(request.params.ownerId, user);
      const entryId = String(request.params.entryId);
      const commentId = String(request.params.commentId);
      const profile = contentStore.readProfile(ownerId);
      const comment = (profile.comments[entryId] || []).find(
        (item) => item.id === commentId,
      );
      if (!comment) {
        throw new Phase6NotFoundError('留言不存在');
      }
      const isOwner = String(ownerId) === String(user.id);
      const isAuthor = String(comment.fromUserId) === String(user.id);
      if (!isOwner && !isAuthor) {
        throw new Phase6ForbiddenError('仅条目作者或留言作者可删除留言');
      }
      const removed = contentStore.deleteProfileComment({ ownerId, entryId, commentId });
      response.json({ comment: removed });
    }),
  );

  // —— 宅院交流权限（全开 / 仅好友 / 闭门） ——
  router.get(
    '/phase7/home-access/:plotId',
    asyncHandler(async (request, response) => {
      const user = await requireUser(request);
      ensureResident(user);
      response.json({ access: contentStore.readHomeAccess(String(request.params.plotId)) });
    }),
  );

  router.put(
    '/phase7/home-access/:plotId',
    asyncHandler(async (request, response) => {
      const user = await requireUser(request);
      ensureResident(user);
      const plotId = String(request.params.plotId);
      const mode = String(request.body?.mode || '');
      if (!HOME_ACCESS_MODES.includes(mode)) {
        throw new Phase6ValidationError('权限需为 open / friends / closed');
      }
      const current = contentStore.readHomeAccess(plotId);
      const ownerResident = residentsCache().find(
        (item) => item.status === 'active' && String(item.homePlotId) === plotId,
      );
      const ownerId = ownerResident?.userId ?? current.ownerId ?? null;
      // 归属判定：宅院主人 / 已认领者 / 无主宅院由原住民就地认领 / 管理员
      const isOwner =
        (ownerId != null && String(ownerId) === String(user.id)) ||
        (ownerId == null && RESIDENT_ROLES.includes(user.role)) ||
        user.role === 'admin';
      if (!isOwner) {
        throw new Phase6ForbiddenError('仅宅院主人可修改交流权限');
      }
      const access = contentStore.writeHomeAccess({
        plotId,
        ownerId: ownerId ?? user.id,
        mode,
        updatedBy: user.id,
      });
      response.json({ access });
    }),
  );

  /** 访客到访前的服务端权限裁决：闭门直接拒绝；仅好友需在好友列表内 */
  router.post(
    '/phase7/home-access/:plotId/check',
    asyncHandler(async (request, response) => {
      const user = await requireUser(request);
      ensureResident(user);
      const plotId = String(request.params.plotId);
      const access = contentStore.readHomeAccess(plotId);
      const isOwner =
        access.ownerId && String(access.ownerId) === String(user.id);
      if (isOwner || access.mode === 'open') {
        response.json({ allowed: true, mode: access.mode, reason: 'open' });
        return;
      }
      if (access.mode === 'closed') {
        response.json({ allowed: false, mode: access.mode, reason: 'closed' });
        return;
      }
      const friendIds = (friendStore?.listFriends?.(user) || []).map((friend) =>
        String(friend?.userId ?? friend?.id ?? friend),
      );
      const allowed = access.ownerId
        ? friendIds.includes(String(access.ownerId))
        : true;
      response.json({
        allowed,
        mode: access.mode,
        reason: allowed ? 'friend' : 'not_friend',
      });
    }),
  );

  // —— 关键词检索（严格权限隔离） ——
  router.get(
    '/phase7/search',
    asyncHandler(async (request, response) => {
      const user = await requireUser(request);
      ensureResident(user);
      const query = String(request.query.q ?? '').trim();
      const result = searchService.search({
        viewerId: user.id,
        isResident: true,
        query,
        limit: readLimit(request.query, PHASE7_LIMITS.maxSearchResults),
      });
      response.json(result);
    }),
  );

  // —— 导出 / 备份 ——
  router.get(
    '/phase7/export/me',
    asyncHandler(async (request, response) => {
      const user = await requireUser(request);
      ensureResident(user);
      const { file, payload } = contentStore.exportUser({
        userId: user.id,
        username: residentName(user.id, user.username),
      });
      response.json({
        file,
        exportedAt: payload.exportedAt,
        counts: {
          entries: payload.profile.entries.length,
          conversations: payload.conversations.length,
          publicMessages: payload.publicMessages.length,
        },
      });
    }),
  );

  router.get(
    '/phase7/stats',
    asyncHandler(async (request, response) => {
      const user = await requireUser(request);
      ensureResident(user);
      response.json({ stats: contentStore.stats(), snapshots: backupService.listSnapshots() });
    }),
  );

  router.post(
    '/phase7/backup',
    asyncHandler(async (request, response) => {
      const user = await requireUser(request);
      ensureAdmin(user);
      const snapshot = backupService.snapshot({ label: 'phase7-manual' });
      response.status(201).json({ snapshot });
    }),
  );

  return { router, contentStore, searchIndex, searchService, backupService };
};
