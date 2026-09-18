# 数据库迁移步骤

## 1. 数据库概述

记忆模块使用**独立 SQLite** 数据库（默认 `data/virtual_utopia_memory.sqlite`），与 phase5 的 `users` 表完全隔离。

## 2. 表结构（5 张表）

| 表 | 用途 | 主键/唯一键 |
| --- | --- | --- |
| `users` | 用户身份 | `id`（TEXT） |
| `conversations` | 会话元数据 | `id`（TEXT） |
| `messages` | 短期会话记忆（消息历史） | `id`（TEXT） |
| `user_memory` | 用户全局长期记忆（含向量） | `id`（TEXT） |
| `world_state` | 虚拟世界状态记忆 | `key`（TEXT） |

完整 DDL 见 `backend/src/memory/migrate-memory.sql`。

## 3. 迁移步骤

### 3.1 全新部署（无历史数据）

```powershell
cd H:\BP2
# 启动记忆服务时自动建表（openMemoryDatabase 执行 migrate-memory.sql）
node backend/src/memory/server.mjs
```

### 3.2 手动执行迁移

```powershell
# 方式一：用通用迁移脚本（会额外创建 schema_migrations 表）
node scripts/migrate.mjs data/virtual_utopia_memory.sqlite --dir=migrations

# 方式二：直接用 sqlite 执行 DDL
# （等价于 openMemoryDatabase 内部行为）
```

### 3.3 旧库升级（向量召回扩展）

旧版本 `user_memory` 无 `embedding` 列时，`openMemoryDatabase` 会自动检测并执行：

```sql
ALTER TABLE user_memory ADD COLUMN embedding TEXT;
```

- **无需人工干预**：启动即自动补列。
- **旧记忆兼容**：旧数据 `embedding` 为 `NULL`，向量召回时 `similarity=0`，退化为 importance 排序，不崩溃。

## 4. 迁移验证

```powershell
# 启动后验证 5 张表 + embedding 列存在
node --input-type=module -e "
import { openMemoryDatabase } from './backend/src/memory/database.mjs';
const db = openMemoryDatabase({ databasePath: 'data/virtual_utopia_memory.sqlite' });
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'\").all();
console.log('表:', tables.map(t => t.name).join(', '));
const cols = db.prepare('PRAGMA table_info(user_memory)').all().map(c => c.name);
console.log('user_memory 列:', cols.join(', '));
db.close();
"
```

预期输出包含：`users, conversations, messages, user_memory, world_state` 与 `embedding` 列。

## 5. 备份与恢复

```powershell
# 备份（含 -wal/-shm 一致快照 + SHA256）
node scripts/backup-data.mjs

# 恢复：停止服务 → 复制 backups/<时间戳>/ 下的三文件回 data/ → 重启
```
