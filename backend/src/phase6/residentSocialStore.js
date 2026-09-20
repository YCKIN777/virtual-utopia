import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * 居民社交存储（居民主页迭代 S3）：一对一私聊 + 临时小群。
 *
 * - 一对一私聊：direct_messages，仅两名参与者可读。
 * - 临时小群：chat_groups + group_members + group_messages，仅群成员可读写；
 *   不设全员大群（成员上限 GROUP_MAX_MEMBERS，含创建者）。
 * 无活跃度 / 排行。
 */
export const GROUP_MAX_MEMBERS = 8;

const now = () => new Date().toISOString();

const mapDirectMessage = (row) => ({
  id: row.id,
  fromUserId: row.from_user_id,
  toUserId: row.to_user_id,
  content: row.content,
  createdAt: row.created_at,
});

const mapGroup = (row) => ({
  id: row.id,
  name: row.name,
  creatorUserId: row.creator_user_id,
  createdAt: row.created_at,
});

const mapMember = (row) => ({
  userId: row.user_id,
  username: row.username,
});

const mapGroupMessage = (row) => ({
  id: row.id,
  groupId: row.group_id,
  fromUserId: row.from_user_id,
  fromUsername: row.from_username,
  content: row.content,
  createdAt: row.created_at,
});

export const createResidentSocialStore = ({ databasePath = ':memory:' } = {}) => {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);

  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS direct_messages (
      id TEXT PRIMARY KEY,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_direct_messages_pair
      ON direct_messages(from_user_id, to_user_id, created_at);

    CREATE TABLE IF NOT EXISTS chat_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      creator_user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS group_messages (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      from_user_id INTEGER NOT NULL,
      from_username TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_group_messages_group
      ON group_messages(group_id, created_at);
  `);

  // ---- 一对一私聊 ----
  const listDirectMessages = (a, b) =>
    database
      .prepare(
        `SELECT * FROM direct_messages
         WHERE (from_user_id = ? AND to_user_id = ?)
            OR (from_user_id = ? AND to_user_id = ?)
         ORDER BY created_at ASC, id ASC`,
      )
      .all(a, b, b, a)
      .map(mapDirectMessage);

  const createDirectMessage = ({ fromUserId, toUserId, content }) => {
    const createdAt = now();
    const id = `dm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const message = { id, fromUserId, toUserId, content, createdAt };

    database
      .prepare(
        `INSERT INTO direct_messages (
          id, from_user_id, to_user_id, content, created_at
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        message.id,
        message.fromUserId,
        message.toUserId,
        message.content,
        message.createdAt,
      );

    return message;
  };

  // ---- 临时小群 ----
  const getGroup = (groupId) => {
    const row = database
      .prepare('SELECT * FROM chat_groups WHERE id = ?')
      .get(groupId);

    return row ? mapGroup(row) : null;
  };

  const listMembers = (groupId) =>
    database
      .prepare(
        `SELECT * FROM group_members WHERE group_id = ? ORDER BY created_at ASC`,
      )
      .all(groupId)
      .map(mapMember);

  const isMember = (groupId, userId) =>
    Boolean(
      database
        .prepare(
          'SELECT 1 AS ok FROM group_members WHERE group_id = ? AND user_id = ?',
        )
        .get(groupId, userId),
    );

  const listGroupsByUser = (userId) =>
    database
      .prepare(
        `SELECT g.* FROM chat_groups g
         JOIN group_members m ON m.group_id = g.id
         WHERE m.user_id = ?
         ORDER BY g.created_at DESC, g.id DESC`,
      )
      .all(userId)
      .map(mapGroup);

  const createGroup = ({ name, creatorUserId, creatorUsername, memberIds }) => {
    const createdAt = now();
    const id = `grp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const group = { id, name, creatorUserId, createdAt };

    database
      .prepare(
        `INSERT INTO chat_groups (id, name, creator_user_id, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(group.id, group.name, group.creatorUserId, group.createdAt);

    const memberSet = new Map();
    memberSet.set(creatorUserId, creatorUsername || '');

    for (const member of memberIds || []) {
      if (!memberSet.has(member.userId)) {
        memberSet.set(member.userId, member.username || '');
      }
    }

    const insertMember = database.prepare(
      `INSERT INTO group_members (group_id, user_id, username, created_at)
       VALUES (?, ?, ?, ?)`,
    );

    for (const [userId, username] of memberSet) {
      insertMember.run(id, userId, username, createdAt);
    }

    return group;
  };

  const listGroupMessages = (groupId) =>
    database
      .prepare(
        `SELECT * FROM group_messages WHERE group_id = ?
         ORDER BY created_at ASC, id ASC`,
      )
      .all(groupId)
      .map(mapGroupMessage);

  const createGroupMessage = ({ groupId, fromUserId, fromUsername, content }) => {
    const createdAt = now();
    const id = `gm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const message = { id, groupId, fromUserId, fromUsername, content, createdAt };

    database
      .prepare(
        `INSERT INTO group_messages (
          id, group_id, from_user_id, from_username, content, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        message.id,
        message.groupId,
        message.fromUserId,
        message.fromUsername,
        message.content,
        message.createdAt,
      );

    return message;
  };

  return Object.freeze({
    listDirectMessages,
    createDirectMessage,
    getGroup,
    listMembers,
    isMember,
    listGroupsByUser,
    createGroup,
    listGroupMessages,
    createGroupMessage,
    close() {
      database.close();
    },
  });
};
