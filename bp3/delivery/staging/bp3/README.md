# 虚拟乌托邦 BP3 项目索引

> 项目：虚拟乌托邦 BP3
> 版本：BP3 M1 + M2 + M3
> 归档日期：2026-09-17
> 状态：开发完成，全链路验收通过

## 项目模块

| 模块  | 内容                       | 源码目录                      |
| ----- | -------------------------- | ----------------------------- |
| M1 P0 | 语音、家园权限、门锁、访客 | `bp3/backend`、`bp3/frontend` |
| M2 P1 | 事件、任务、资源、背包     | `bp3/p1`                      |
| M3 P2 | Avatar动作表情、家园留言板 | `bp3/p2`                      |

## 文档索引

- [[docs/00-BP3-M1-README.md|BP3 M1 P0 README]]
- [[docs/01-BP3-M2-README.md|BP3 M2 P1 README]]
- [[docs/02-BP3-M3-README.md|BP3 M3 P2 README]]
- [[docs/10-BP3-FINAL-OVERVIEW.md|BP3 最终总览]]
- [[docs/11-BP3-API-REFERENCE.md|BP3 API 总览]]
- [[docs/12-BP3-DEPLOYMENT.md|BP3 部署文档]]
- [[docs/13-BP3-PERFORMANCE-SECURITY.md|BP3 性能与安全]]
- [[docs/14-BP3-ACCEPTANCE-REPORT.md|BP3 最终验收报告]]
- [[docs/90-stage5_memory.md|BP3 开发记忆快照]]

## 交付与校验

- 交付包：`bp3/delivery/virtual-utopia-bp3-delivery-20260917-v1.0.zip`
- 校验清单：`bp3/delivery/BP3-DELIVERY-CHECKLIST.md`
- 文件清单：`bp3/delivery/DELIVERY-MANIFEST.json`
- SHA256：见交付目录同名校验文件

## BP2 关联

- [[虚拟乌托邦-BP2交付归档|BP2-V1.1冻结归档]]
- [[BP2交付归档-20260917-v1.1/stage5_memory|BP2阶段记忆快照]]

BP3通过新增文档关联BP2只读归档，不修改BP2源码或原归档内容。

## 验收摘要

- P0/P1/P2单模块测试通过。
- M3全链路E2E通过。
- 40路并发Avatar状态更新通过。
- 伪造作者、越权删除和私密家园留言拦截通过。
- 桌面与移动端截图完整。
