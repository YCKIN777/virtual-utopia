import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * 居民主页卡片存储（居民主页迭代 S1）。
 *
 * 五种卡片：work_plan / travel_log / life_note / wish_list / favorite。
 * 单条权限：self（仅自己）/ residents（原住民可见）。
 * 收藏角（favorite）恒为 self，服务端强制，不接受外部传入 residents。
 *
 * 无点赞 / 热度 / 排行；纯记录 + 权限。
 */
export const RESIDENT_CARD_TYPES = Object.freeze([
  'work_plan',
  'travel_log',
  'life_note',
  'wish_list',
  'favorite',
]);

export const RESIDENT_CARD_PERMISSIONS = Object.freeze(['self', 'residents']);

export const CARD_INTERACTION_KINDS = Object.freeze([
  'signup', // 出游卡：报名参加
  'help', // 心愿卡：我来帮你
  'want', // 心愿卡：我也想要
  'comment', // 随记卡：评论
]);

const now = () => new Date().toISOString();

const mapCard = (row) => {
  if (!row) return null;

  let content;

  try {
    content = JSON.parse(row.content);
  } catch {
    content = { title: '', body: '' };
  }

  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    cardType: row.card_type,
    content,
    permission: row.permission,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const createResidentCardStore = ({ databasePath = ':memory:' } = {}) => {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);

  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS resident_cards (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      card_type TEXT NOT NULL
        CHECK (card_type IN ('work_plan', 'travel_log', 'life_note', 'wish_list', 'favorite')),
      content TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'self'
        CHECK (permission IN ('self', 'residents')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_resident_cards_user_type
      ON resident_cards(user_id, card_type);
    CREATE INDEX IF NOT EXISTS idx_resident_cards_perm_type
      ON resident_cards(permission, card_type);

    CREATE TABLE IF NOT EXISTS card_interactions (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      kind TEXT NOT NULL
        CHECK (kind IN ('signup', 'help', 'want', 'comment')),
      content TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_card_interactions_card
      ON card_interactions(card_id, created_at);
  `);

  const getById = (id) => {
    const row = database
      .prepare('SELECT * FROM resident_cards WHERE id = ?')
      .get(id);

    return row ? mapCard(row) : null;
  };

  const listByUser = (userId) =>
    database
      .prepare(
        `SELECT * FROM resident_cards
         WHERE user_id = ?
         ORDER BY created_at DESC, id DESC`,
      )
      .all(userId)
      .map(mapCard);

  // 原住民社区可见的内容：其他居民的 residents 权限卡片（收藏角除外）
  const listCommunity = (excludeUserId) =>
    database
      .prepare(
        `SELECT * FROM resident_cards
         WHERE permission = 'residents'
           AND card_type != 'favorite'
           AND user_id != ?
         ORDER BY created_at DESC, id DESC`,
      )
      .all(excludeUserId)
      .map(mapCard);

  // 某位居民公开展示的内容：其 residents 权限卡片（收藏角除外，用于个人展示板）
  const listPublicByUser = (userId) =>
    database
      .prepare(
        `SELECT * FROM resident_cards
         WHERE user_id = ?
           AND permission = 'residents'
           AND card_type != 'favorite'
         ORDER BY created_at DESC, id DESC`,
      )
      .all(userId)
      .map(mapCard);

  const create = ({ userId, username, cardType, content, permission }) => {
    const createdAt = now();
    const id = `card-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const card = {
      id,
      userId,
      username: username || '',
      cardType,
      content,
      permission: cardType === 'favorite' ? 'self' : permission,
      createdAt,
      updatedAt: createdAt,
    };

    database
      .prepare(
        `INSERT INTO resident_cards (
          id, user_id, username, card_type, content, permission, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        card.id,
        card.userId,
        card.username,
        card.cardType,
        JSON.stringify(card.content),
        card.permission,
        card.createdAt,
        card.updatedAt,
      );

    return card;
  };

  const update = (id, { content, permission }) => {
    const current = getById(id);

    if (!current) return null;

    const next = {
      content: content ?? current.content,
      permission:
        current.cardType === 'favorite' ? 'self' : (permission ?? current.permission),
    };

    database
      .prepare(
        `UPDATE resident_cards
         SET content = ?, permission = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(JSON.stringify(next.content), next.permission, now(), id);

    return getById(id);
  };

  const remove = (id) => {
    const current = getById(id);

    if (!current) return null;

    database.prepare('DELETE FROM resident_cards WHERE id = ?').run(id);
    database
      .prepare('DELETE FROM card_interactions WHERE card_id = ?')
      .run(id);
    return current;
  };

  const mapInteraction = (row) => ({
    id: row.id,
    cardId: row.card_id,
    userId: row.user_id,
    username: row.username,
    kind: row.kind,
    content: row.content || null,
    createdAt: row.created_at,
  });

  const listInteractions = (cardId) =>
    database
      .prepare(
        `SELECT * FROM card_interactions
         WHERE card_id = ?
         ORDER BY created_at ASC, id ASC`,
      )
      .all(cardId)
      .map(mapInteraction);

  const createInteraction = ({ cardId, userId, username, kind, content }) => {
    const createdAt = now();
    const id = `ci-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const interaction = {
      id,
      cardId,
      userId,
      username: username || '',
      kind,
      content: content || null,
      createdAt,
    };

    database
      .prepare(
        `INSERT INTO card_interactions (
          id, card_id, user_id, username, kind, content, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        interaction.id,
        interaction.cardId,
        interaction.userId,
        interaction.username,
        interaction.kind,
        interaction.content,
        interaction.createdAt,
      );

    return interaction;
  };

  return Object.freeze({
    getById,
    listByUser,
    listCommunity,
    listPublicByUser,
    listInteractions,
    createInteraction,
    create,
    update,
    remove,
    close() {
      database.close();
    },
  });
};
