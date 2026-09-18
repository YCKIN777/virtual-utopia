# 生产预演报告（memory-agent-v1.0.0）

> 日期：2026-09-18
> 环境：隔离目录 `H:/pi_workspace/memory-agent-rehearsal/`
> 说明：本机未安装 Docker，故生产预演采用**隔离本地部署**（解压交付包 + 独立 node_modules + 独立 DB/端口），Docker 编排步骤已文档化（见 DEPLOYMENT_DOCKER.md）。

## 1. 部署验证

| 项 | 结果 |
| --- | --- |
| 交付包解压 | ✅ `memory-agent-v1.0.0.tar.gz` → 隔离目录，49 文件 |
| 依赖安装 | ✅ 隔离环境 `npm install express`（68 包，7s） |
| 密钥替换 | ✅ 占位密钥替换为预演值（`rehearsal-secret-*`） |
| 密钥扫描 | ✅ `audit-secrets.mjs` 0 个明文敏感项 |
| 服务启动 | ✅ 记忆服务 3600（启动日志 `{"service":"virtual-utopia-memory","port":3600}`） |
| guard 安全头 | ✅ X-Request-Id / nosniff / SAMEORIGIN / Referrer-Policy 全部生效 |

## 2. 7 个 E2E 场景结果（针对已部署服务）

| 场景 | 结果 | 关键数据 |
| --- | --- | --- |
| 1 新会话 | ✅ | conversationId 生成，历史=0，耗时 215ms |
| 2 历史接续 | ✅ | 历史 2 条，续接历史=2 |
| 3 刷新上下文 | ✅ | 历史 4 条 |
| 4 异步提炼 | ✅ | 主响应 150ms，提炼延迟 34ms |
| 5 世界状态 | ✅ | 程序化写接口，持久化由 E2E 已验证 |
| 6 陈旧 ID 回退 | ✅ | 回退新建会话 |
| 7 记忆 CRUD | ✅ | 列表 2 条 → 单删 → 清空 cleared=1 剩余=0 |

## 3. 备份与恢复验证

| 项 | 结果 |
| --- | --- |
| 备份 | ✅ `backup-data.mjs` 生成一致快照（`.sqlite` + `-wal` + `-shm` + manifest） |
| 恢复 | ✅ 从备份恢复至新目录，读取 3 条记忆成功（`种花`/`社区规划师`/`宋式美学`） |

## 4. 性能指标

| 指标 | 值 |
| --- | ---: |
| 主请求响应耗时（10 轮 chat 平均） | **173.0ms** |
| 主请求响应耗时（最小/最大） | 143ms / 232ms |
| 异步记忆提炼延迟 | **34ms** |

## 5. 发现的问题与优化建议

### 5.1 【重要】删除/清空后记忆「回潮」Bug

**现象**：场景 7 清空 `u_rehearsal` 的记忆后，后续 10 轮性能采样聊天触发的异步提炼，因重新处理**全量对话历史**而把已删除的 `种花`/`社区规划师` 记忆重新插入（恢复验证中出现 3 条而非预期 1 条）。

**根因**：`memoryExtractor` 每次 `extractFacts` 都传入完整 `context.history`，且去重只针对「当前存在」的记忆；删除后去重失效 → 旧事实被重复提炼回写。

**建议修复**：
1. 增量提炼：为 `conversations` 增加 `last_extracted_at`（或消息级 `extracted` 标记），只提炼**上次提炼之后**的新消息。
2. 或软删除 + 墓碑：删除记忆时记 `deleted_at`，提炼去重时跳过已删除事实。
3. 短期方案：提炼时对「本次会话已存在过」的 fact 做会话级去重缓存。

### 5.2 主响应延迟 173ms 偏高

本地 SQLite + 同步 embedding 生成 + 全量向量召回。建议：缓存 query embedding、召回 `limit` 下调、embedding 预生成、DB 连接池化。

### 5.3 本地 embedding 精度有限

字符 n-gram 哈希向量召回精度弱于真实模型。生产建议接入真实 embedding API（扩展点已预留）。

### 5.4 world_state 无 HTTP 写接口

仅程序化 `worldState.set`，3D 游戏层无法直接写。建议补 `POST /api/world/state`。

### 5.5 备份清单不完整

`backup-data.mjs` 的 manifest 仅记录 `.sqlite`，未记录 `-wal/-shm`（文件已备份但清单缺项）。建议补全三文件 SHA256。

### 5.6 日志可观测性

guard 请求日志仅 stdout JSON。生产建议接入结构化日志采集（pino → 文件/集中采集）。

## 6. 预演结论

**7 个 E2E 场景全部通过**，密钥替换、备份恢复、安全头、限流均验证通过。**阻塞性问题 0 个**，但发现 1 个重要 Bug（记忆回潮）与 5 项优化建议，建议在正式发布前修复 5.1 记忆回潮问题。
