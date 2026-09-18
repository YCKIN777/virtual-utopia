# 虚拟乌托邦 BP4 规划索引

> 状态：需求规划与方案设计  
> 代码状态：未开始  
> 冻结范围：BP1、BP2、BP3源码与归档

## 文档

- [BP4需求规格说明书](docs/BP4-REQUIREMENT-SPEC.md)
- [BP4接口设计文档](docs/BP4-API-DESIGN.md)
- [BP4开发排期与风险评估](docs/BP4-ROADMAP-RISK.md)
- [BP4开发任务清单](docs/BP4-TASK-LIST.md)

## BP4定位

BP4不再扩展基础玩法，而是把BP1~BP3交付的单机验收系统升级为可持续生产运行的世界平台。

P0：

- PostgreSQL持久化迁移与数据校验。
- 统一WebSocket实时通道。
- mediasoup多Worker/多节点和TURN。
- 身份、限流、幂等和审计安全基线。
- 监控、日志、备份、恢复和告警。

P1：

- 世界运营后台。
- 事件、任务、资源和奖励模板。
- 移动端性能和PWA体验。
- 数据看板和留存分析。

P2：

- AI NPC与动态内容。
- 实时语音识别、合成和翻译。
- 多世界、多区域扩展。
- UGC家园模板和素材生态。

## 冻结边界

- 不修改BP1、BP2、BP3源码和测试。
- 不修改BP2、BP3冻结交付包。
- 不修改Obsidian历史归档。
- BP4使用新目录、新服务、新数据库迁移和新版本号。
