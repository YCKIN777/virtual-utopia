import { PHASE7_LIMITS } from './config.js';

/**
 * 关键词检索（v1.0）+ 权限隔离。
 *
 * 检索范围（严格按身份裁剪）：
 *   - 原住民：本人全部聊天记录（广场公屏 + 双人私聊）、本人主页条目与留言、
 *            以及其他原住民的「公开」主页条目与「公开」留言。
 *   - 广场公共频道消息：频道本身即全员可见，原住民均可检索。
 *   - 访客：无检索权限（由路由层拒绝）。
 *   - 管理员：不额外读取任何私密内容（与普通原住民同权）。
 */
const canReadDocument = ({ doc, viewerId, isResident }) => {
  if (!doc) {
    return false;
  }

  if (doc.type === 'public_chat') {
    return isResident;
  }

  if (doc.type === 'direct_chat') {
    return Array.isArray(doc.participants)
      ? doc.participants.includes(String(viewerId))
      : false;
  }

  if (doc.type === 'profile_entry' || doc.type === 'profile_comment') {
    if (String(doc.ownerId) === String(viewerId)) {
      return true;
    }
    return isResident && doc.visibility === 'public';
  }

  return false;
};

export const createSearchService = ({ searchIndex }) => ({
  search({ viewerId, isResident, query, limit = PHASE7_LIMITS.maxSearchResults }) {
    const normalizedQuery = String(query ?? '').trim();
    if (normalizedQuery.length < 1) {
      return { query: normalizedQuery, total: 0, results: [] };
    }

    const raw = searchIndex.query(normalizedQuery, {
      limit: Math.min(PHASE7_LIMITS.maxSearchResults, Math.max(1, limit) * 3),
    });

    const results = raw
      .filter((doc) => canReadDocument({ doc, viewerId, isResident }))
      .slice(0, Math.min(PHASE7_LIMITS.maxSearchResults, Math.max(1, limit)))
      .map((doc) => ({
        docId: doc.id,
        type: doc.type,
        channel: doc.channel || null,
        ownerId: doc.ownerId,
        ownerName: doc.ownerName || null,
        visibility: doc.visibility || null,
        text: doc.text,
        snippet: doc.snippet,
        at: doc.at,
        ref: doc.ref,
      }));

    return { query: normalizedQuery, total: results.length, results };
  },
});

export const searchInternals = { canReadDocument };
