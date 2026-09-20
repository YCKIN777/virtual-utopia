#!/usr/bin/env node
/**
 * 生成干净的 v1.0 初始数据库模板（仅表结构 + bootstrap 管理员）。
 *
 * 用法：node scripts/init-clean-db.mjs
 * 输出：database/templates/*.sqlite
 */
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  closePhase5Database,
  openPhase5Database,
} from '../backend/src/phase5/database.js';
import { createAuditStore } from '../backend/src/phase6/auditStore.js';
import { createGuestbookStore } from '../backend/src/phase6/guestbookStore.js';
import { createPlotAssignmentStore } from '../backend/src/phase6/plotAssignmentStore.js';
import { createResidentCardStore } from '../backend/src/phase6/residentCardStore.js';
import { createResidentSocialStore } from '../backend/src/phase6/residentSocialStore.js';
import { createVisitorQuotaStore } from '../backend/src/phase6/visitorQuotaStore.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'database', 'templates');

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// phase5：schema + bootstrap 管理员（admin / utopia2026）
const phase5 = await openPhase5Database({
  databasePath: path.join(OUT, 'virtual_utopia_phase5.sqlite'),
  busyTimeoutMs: 5000,
  bootstrapAdminUsername: 'admin',
  bootstrapAdminPassword: 'utopia2026',
});
closePhase5Database(phase5);

// phase6 各存储：仅表结构（plot_assignment 含 50 块空置宅院）
const stores = [
  createVisitorQuotaStore({
    databasePath: path.join(OUT, 'phase6_visitor_quota.sqlite'),
  }),
  createPlotAssignmentStore({
    databasePath: path.join(OUT, 'phase6_plot_assignment.sqlite'),
  }),
  createResidentCardStore({
    databasePath: path.join(OUT, 'phase6_resident_cards.sqlite'),
  }),
  createGuestbookStore({
    databasePath: path.join(OUT, 'phase6_guestbook.sqlite'),
  }),
  createResidentSocialStore({
    databasePath: path.join(OUT, 'phase6_resident_social.sqlite'),
  }),
  createAuditStore(path.join(OUT, 'phase6_audit.sqlite')),
];

for (const store of stores) {
  if (typeof store.close === 'function') {
    store.close();
  }
}

console.log('clean DB templates generated at:', OUT);
