# 版本封存说明（memory-agent-v1.0.1）

> 封存日期：2026-09-18
> 版本：`virtual-utopia-memory-agent v1.0.1`

## 1. 封存信息

| 项 | 值 |
| --- | --- |
| 版本号 | `v1.0.1` |
| Git tag | `memory-agent-v1.0.1` |
| 封存 commit | `e427a45` |
| 交付包 | `deliverables/memory-agent-v1.0.1.tar.gz`（51 文件） |
| SHA256 | `0600eba707609b9e10ea99ffdfd4bead8757ee09c6a5c9159a18a6ff862df020` |

## 2. 冻结范围

以下目录/文件自 v1.0.1 起**冻结**，禁止修改（Bug 修复需走新版本 v1.0.2+）：

- `backend/src/memory/`（分层记忆后端全部模块 + 单元测试）
- `backend/src/runtime/`（防护中间件）
- `frontend/src/session/`（H5 会话前端全部组件 + 测试）
- `backend/src/{agents,routes,services,rag,phase4}`（BP1~BP4 冻结基线，一直冻结）
- `stage2~4_memory.md`（阶段记忆文档）

## 3. 冻结校验

```powershell
# 冻结边界检查（冻结目录无未提交变更）
node scripts/check-frozen.mjs

# 交付包 SHA256 校验
sha256sum -c deliverables/memory-agent-v1.0.1.tar.gz.sha256
```

## 4. 本版本变更摘要

- 落地分层记忆架构（短期会话 + 长期记忆 + 世界状态，5 张表）
- 向量召回（embedding + 余弦相似度 + importance 二次排序）
- 前端 H5 会话（侧边栏/聊天/记忆管理面板）
- 记忆 CRUD + 全链路 E2E（7 场景）
- **修复记忆回潮 Bug**（增量提炼游标 `last_processed_message_id`）

## 5. 解冻规则

任何后续变更必须：
1. 新版本号（v1.0.2+）。
2. 不修改冻结目录源码，新增走独立模块/中间件/脚本。
3. 全套回归（单测 + 7 场景 E2E）通过后方可打新 tag。
