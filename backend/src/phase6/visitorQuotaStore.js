import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * 访客名额权限模块的持久化规则常量。
 *
 * - 原住民上限 50 人，每位 3 个专属访客邀请名额（50 × 3 = 150）。
 * - 全局访客硬上限 200 人。
 * - 访客总数达到 150 时，原住民邀请入口关闭，仅城主后台可发公共名额。
 * - 访客总数达到 200 时，全渠道禁止新增访客。
 */
export const VISITOR_QUOTA_RULES = Object.freeze({
  residentLimit: 50,
  quotaPerResident: 3,
  residentQuotaTotal: 150,
  residentInviteThreshold: 150,
  globalVisitorCap: 200,
});

const now = () => new Date().toISOString();

const mapResident = (row) => ({
  id: row.id,
  userId: row.user_id,
  username: row.username,
  displayName: row.display_name,
  homePlotId: row.home_plot_id,
  quotaTotal: row.quota_total,
  hobbies: row.hobbies || null,
  occupation: row.occupation || null,
  selfIntro: row.self_intro || null,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapInvitation = (row) => ({
  id: row.id,
  code: row.code,
  channel: row.channel,
  residentUserId: row.resident_user_id,
  residentUsername: row.resident_username,
  visitorUserId: row.visitor_user_id,
  visitorUsername: row.visitor_username,
  visitorDisplayName: row.visitor_display_name,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createVisitorQuotaStore = ({ databasePath = ':memory:' } = {}) => {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), {
      recursive: true,
    });
  }

  const database = new DatabaseSync(databasePath);

  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS utopia_residents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      username TEXT NOT NULL,
      display_name TEXT,
      home_plot_id TEXT,
      quota_total INTEGER NOT NULL DEFAULT 3,
      hobbies TEXT,
      occupation TEXT,
      self_intro TEXT,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'departed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_utopia_residents_status
      ON utopia_residents(status);

    CREATE TABLE IF NOT EXISTS visitor_invitations (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      channel TEXT NOT NULL CHECK (channel IN ('resident', 'admin')),
      resident_user_id INTEGER,
      resident_username TEXT,
      visitor_user_id INTEGER,
      visitor_username TEXT,
      visitor_display_name TEXT,
      status TEXT NOT NULL DEFAULT 'issued'
        CHECK (status IN ('issued', 'used', 'revoked')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_visitor_invitations_status
      ON visitor_invitations(status);
    CREATE INDEX IF NOT EXISTS idx_visitor_invitations_resident
      ON visitor_invitations(resident_user_id, status);
    CREATE INDEX IF NOT EXISTS idx_visitor_invitations_visitor
      ON visitor_invitations(visitor_user_id);
  `);

  // 为既有库补齐居民档案字段（爱好/职业/自我介绍）
  const residentColumns = database
    .prepare('PRAGMA table_info(utopia_residents)')
    .all()
    .map((column) => column.name);

  for (const [name, type] of [
    ['hobbies', 'TEXT'],
    ['occupation', 'TEXT'],
    ['self_intro', 'TEXT'],
  ]) {
    if (!residentColumns.includes(name)) {
      database.exec(`ALTER TABLE utopia_residents ADD COLUMN ${name} ${type}`);
    }
  }

  const selectAllResidents = () =>
    database
      .prepare(
        'SELECT * FROM utopia_residents ORDER BY created_at ASC, id ASC',
      )
      .all()
      .map(mapResident);

  const selectAllInvitations = () =>
    database
      .prepare(
        'SELECT * FROM visitor_invitations ORDER BY created_at ASC, id ASC',
      )
      .all()
      .map(mapInvitation);

  const getResidentByUserId = (userId) => {
    const row = database
      .prepare('SELECT * FROM utopia_residents WHERE user_id = ?')
      .get(userId);

    return row ? mapResident(row) : null;
  };

  const getInvitationById = (id) => {
    const row = database
      .prepare('SELECT * FROM visitor_invitations WHERE id = ?')
      .get(id);

    return row ? mapInvitation(row) : null;
  };

  const getInvitationByCode = (code) => {
    const row = database
      .prepare('SELECT * FROM visitor_invitations WHERE code = ?')
      .get(code);

    return row ? mapInvitation(row) : null;
  };

  const countActiveResidents = () =>
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM utopia_residents WHERE status = 'active'",
      )
      .get().count;

  const countVisitorTotal = () =>
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM visitor_invitations WHERE status = 'used'",
      )
      .get().count;

  const countResidentIssued = () =>
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM visitor_invitations
         WHERE channel = 'resident' AND status IN ('issued', 'used')`,
      )
      .get().count;

  const countResidentUsed = () =>
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM visitor_invitations
         WHERE channel = 'resident' AND status = 'used'`,
      )
      .get().count;

  const countAdminIssued = () =>
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM visitor_invitations
         WHERE channel = 'admin' AND status IN ('issued', 'used')`,
      )
      .get().count;

  const countResidentPersonalIssued = (userId) =>
    database
      .prepare(
        `SELECT COUNT(*) AS count FROM visitor_invitations
         WHERE resident_user_id = ? AND status IN ('issued', 'used')`,
      )
      .get(userId).count;

  const makeCode = () =>
    `VU-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`;

  const onboardResident = ({ userId, username, displayName, homePlotId, hobbies, occupation, selfIntro }) => {
    if (countActiveResidents() >= VISITOR_QUOTA_RULES.residentLimit) {
      const error = new Error('原住民已达 50 人上限，无法继续入住');
      error.code = 'RESIDENT_LIMIT_REACHED';
      throw error;
    }

    const existing = getResidentByUserId(userId);

    if (existing) {
      if (existing.status === 'active') {
        return existing;
      }

      database
        .prepare(
          `UPDATE utopia_residents
           SET username = ?,
               display_name = ?,
               home_plot_id = ?,
               hobbies = ?,
               occupation = ?,
               self_intro = ?,
               status = 'active',
               updated_at = ?
           WHERE user_id = ?`,
        )
        .run(
          username || existing.username,
          displayName ?? existing.displayName,
          homePlotId ?? existing.homePlotId,
          hobbies ?? existing.hobbies,
          occupation ?? existing.occupation,
          selfIntro ?? existing.selfIntro,
          now(),
          userId,
        );

      return getResidentByUserId(userId);
    }

    const createdAt = now();
    database
      .prepare(
        `INSERT INTO utopia_residents (
          user_id,
          username,
          display_name,
          home_plot_id,
          quota_total,
          hobbies,
          occupation,
          self_intro,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      )
      .run(
        userId,
        username,
        displayName ?? null,
        homePlotId ?? null,
        VISITOR_QUOTA_RULES.quotaPerResident,
        hobbies ?? null,
        occupation ?? null,
        selfIntro ?? null,
        createdAt,
        createdAt,
      );

    return getResidentByUserId(userId);
  };

  const departResident = (userId) => {
    const resident = getResidentByUserId(userId);

    if (!resident || resident.status !== 'active') {
      return null;
    }

    const currentTime = now();
    database
      .prepare(
        `UPDATE utopia_residents
         SET status = 'departed', updated_at = ?
         WHERE user_id = ?`,
      )
      .run(currentTime, userId);

    const invitations = selectAllInvitations().filter(
      (invitation) =>
        invitation.residentUserId === userId &&
        invitation.status !== 'revoked',
    );

    for (const invitation of invitations) {
      database
        .prepare(
          `UPDATE visitor_invitations
           SET status = 'revoked',
               visitor_user_id = NULL,
               visitor_username = NULL,
               visitor_display_name = NULL,
               updated_at = ?
           WHERE id = ?`,
        )
        .run(currentTime, invitation.id);
    }

    return {
      resident: getResidentByUserId(userId),
      revokedInvitations: invitations.map((invitation) => invitation.id),
    };
  };

  const listResidents = () => selectAllResidents();

  const listInvitations = ({ residentUserId } = {}) => {
    if (residentUserId === undefined) {
      return selectAllInvitations();
    }

    return selectAllInvitations().filter(
      (invitation) => invitation.residentUserId === residentUserId,
    );
  };

  const issueResidentInvitation = ({ userId }) => {
    const resident = getResidentByUserId(userId);

    if (!resident || resident.status !== 'active') {
      const error = new Error('当前账号不是原住民，无法发放访客名额');
      error.code = 'NOT_RESIDENT';
      throw error;
    }

    if (
      countResidentPersonalIssued(userId) >=
      VISITOR_QUOTA_RULES.quotaPerResident
    ) {
      const error = new Error('你的 3 个访客邀请名额已用完');
      error.code = 'RESIDENT_QUOTA_EXHAUSTED';
      throw error;
    }

    if (
      countVisitorTotal() >= VISITOR_QUOTA_RULES.residentInviteThreshold
    ) {
      const error = new Error('访客总数已达 150，原住民邀请入口已关闭');
      error.code = 'RESIDENT_ENTRY_CLOSED';
      throw error;
    }

    const id = `inv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const code = makeCode();
    const createdAt = now();
    const invitation = {
      id,
      code,
      channel: 'resident',
      residentUserId: userId,
      residentUsername: resident.username,
      visitorUserId: null,
      visitorUsername: null,
      visitorDisplayName: null,
      status: 'issued',
      createdAt,
      updatedAt: createdAt,
    };

    database
      .prepare(
        `INSERT INTO visitor_invitations (
          id,
          code,
          channel,
          resident_user_id,
          resident_username,
          visitor_user_id,
          visitor_username,
          visitor_display_name,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        invitation.id,
        invitation.code,
        invitation.channel,
        invitation.residentUserId,
        invitation.residentUsername,
        null,
        null,
        null,
        invitation.status,
        invitation.createdAt,
        invitation.updatedAt,
      );

    return invitation;
  };

  const revokeResidentInvitation = ({ userId, invitationId }) => {
    const invitation = getInvitationById(invitationId);

    if (
      !invitation ||
      invitation.channel !== 'resident' ||
      invitation.residentUserId !== userId
    ) {
      return null;
    }

    if (invitation.status !== 'issued') {
      const error = new Error('只有未使用的名额可以回收');
      error.code = 'INVITATION_NOT_REVOCABLE';
      throw error;
    }

    database
      .prepare(
        `UPDATE visitor_invitations
         SET status = 'revoked', updated_at = ?
         WHERE id = ?`,
      )
      .run(now(), invitationId);

    return getInvitationById(invitationId);
  };

  const issueAdminInvitation = () => {
    if (countVisitorTotal() >= VISITOR_QUOTA_RULES.globalVisitorCap) {
      const error = new Error('访客总数已达 200，全渠道禁止新增访客');
      error.code = 'GLOBAL_CAP_REACHED';
      throw error;
    }

    const id = `inv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const code = makeCode();
    const createdAt = now();
    const invitation = {
      id,
      code,
      channel: 'admin',
      residentUserId: null,
      residentUsername: null,
      visitorUserId: null,
      visitorUsername: null,
      visitorDisplayName: null,
      status: 'issued',
      createdAt,
      updatedAt: createdAt,
    };

    database
      .prepare(
        `INSERT INTO visitor_invitations (
          id,
          code,
          channel,
          resident_user_id,
          resident_username,
          visitor_user_id,
          visitor_username,
          visitor_display_name,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        invitation.id,
        invitation.code,
        invitation.channel,
        null,
        null,
        null,
        null,
        null,
        invitation.status,
        invitation.createdAt,
        invitation.updatedAt,
      );

    return invitation;
  };

  const registerVisitor = ({ code, user }) => {
    const invitation = getInvitationByCode(code);

    if (!invitation) {
      const error = new Error('邀请码不存在');
      error.code = 'INVITATION_NOT_FOUND';
      throw error;
    }

    if (invitation.status !== 'issued') {
      const error = new Error('邀请码已失效或已被使用');
      error.code = 'INVITATION_NOT_AVAILABLE';
      throw error;
    }

    if (countVisitorTotal() >= VISITOR_QUOTA_RULES.globalVisitorCap) {
      const error = new Error('访客总数已达 200，无法注册访客');
      error.code = 'GLOBAL_CAP_REACHED';
      throw error;
    }

    const resident = getResidentByUserId(user.id);

    if (resident && resident.status === 'active') {
      const error = new Error('原住民不能注册为访客');
      error.code = 'RESIDENT_CANNOT_BE_VISITOR';
      throw error;
    }

    if (user.role === 'admin') {
      const error = new Error('城主账号不能注册为访客');
      error.code = 'ADMIN_CANNOT_BE_VISITOR';
      throw error;
    }

    if (user.role === 'editor') {
      const error = new Error('编辑者账号不能注册为访客（访客不能编辑家园）');
      error.code = 'EDITOR_CANNOT_BE_VISITOR';
      throw error;
    }

    const alreadyVisitor = selectAllInvitations().some(
      (candidate) =>
        candidate.status === 'used' &&
        candidate.visitorUserId === user.id,
    );

    if (alreadyVisitor) {
      const error = new Error('该账号已经是访客');
      error.code = 'ALREADY_VISITOR';
      throw error;
    }

    database
      .prepare(
        `UPDATE visitor_invitations
         SET status = 'used',
             visitor_user_id = ?,
             visitor_username = ?,
             visitor_display_name = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        user.id,
        user.username,
        user.displayName || user.username,
        now(),
        invitation.id,
      );

    return getInvitationById(invitation.id);
  };

  const removeVisitor = ({ userId }) => {
    const invitation = selectAllInvitations().find(
      (candidate) =>
        candidate.status === 'used' &&
        candidate.visitorUserId === userId,
    );

    if (!invitation) {
      return null;
    }

    const currentTime = now();

    database
      .prepare(
        `UPDATE visitor_invitations
         SET status = 'revoked',
             visitor_user_id = NULL,
             visitor_username = NULL,
             visitor_display_name = NULL,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(currentTime, invitation.id);

    return getInvitationById(invitation.id);
  };

  const getStats = () => {
    const totalVisitors = countVisitorTotal();
    const residentIssuedCount = countResidentIssued();
    const residentUsedCount = countResidentUsed();

    return {
      residentLimit: VISITOR_QUOTA_RULES.residentLimit,
      quotaPerResident: VISITOR_QUOTA_RULES.quotaPerResident,
      residentQuotaTotal: VISITOR_QUOTA_RULES.residentQuotaTotal,
      residentInviteThreshold: VISITOR_QUOTA_RULES.residentInviteThreshold,
      globalVisitorCap: VISITOR_QUOTA_RULES.globalVisitorCap,
      activeResidentCount: countActiveResidents(),
      residentIssuedCount,
      residentUsedCount,
      residentAvailableCount:
        VISITOR_QUOTA_RULES.residentQuotaTotal - residentIssuedCount,
      adminIssuedCount: countAdminIssued(),
      totalVisitors,
      remainingVisitorCapacity:
        VISITOR_QUOTA_RULES.globalVisitorCap - totalVisitors,
      residentEntryOpen:
        totalVisitors < VISITOR_QUOTA_RULES.residentInviteThreshold,
      globalEntryOpen: totalVisitors < VISITOR_QUOTA_RULES.globalVisitorCap,
    };
  };

  const getOverview = ({ userId, role }) => {
    const resident = getResidentByUserId(userId);
    const isResident = Boolean(resident && resident.status === 'active');
    const personalIssued = isResident
      ? countResidentPersonalIssued(userId)
      : 0;

    return {
      isResident,
      isAdmin: role === 'admin',
      resident: isResident
        ? {
            ...resident,
            quotaUsed: personalIssued,
            quotaAvailable:
              VISITOR_QUOTA_RULES.quotaPerResident - personalIssued,
          }
        : null,
      invitations: isResident ? listInvitations({ residentUserId: userId }) : [],
      stats: getStats(),
    };
  };

  return Object.freeze({
    onboardResident,
    departResident,
    listResidents,
    listInvitations,
    issueResidentInvitation,
    revokeResidentInvitation,
    issueAdminInvitation,
    registerVisitor,
    removeVisitor,
    getStats,
    getOverview,
    close() {
      database.close();
    },
  });
};
