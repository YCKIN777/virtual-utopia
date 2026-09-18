# 测试报告汇总

> 汇总日期：2026-09-18

## 1. 单元测试

| 测试 | 用例数 | 结果 |
| --- | ---: | --- |
| 后端核心（BP2）`npm test --workspace backend` | 33 | ✅ 33/33 |
| 记忆召回 `memoryRetriever.test.js` | 4 | ✅ 4/4 |
| 前端会话 `session.smoke.test.js` | 3 | ✅ 3/3 |
| 前端记忆 `memory.smoke.test.js` | 1 | ✅ 1/1 |

**memoryRetriever 单元测试覆盖**：
- embedding 生成与相似度（相似文本 > 不相关，确定性，128 维）
- 权重模式（importance 降序）
- 向量模式（相似度优先 + importance 二次排序）
- 旧记忆兼容（无向量 similarity=0 不崩溃）

## 2. 冒烟测试

| 测试 | 场景 | 结果 |
| --- | ---: | --- |
| `test-memory.mjs`（后端记忆冒烟） | 新会话加载记忆/世界状态 + 续接历史 + 异步提炼 | ✅ |
| `test-memory-e2e.mjs`（全链路 E2E） | 7 场景（见下） | ✅ 7/7 |

**E2E 场景**：①新会话自动加载记忆+世界状态 ②历史会话接续 ③F5 刷新恢复上下文 ④异步提炼不阻塞 ⑤世界状态持久化 ⑥陈旧 ID 回退 ⑦记忆 CRUD。

## 3. 覆盖率（c8）

| 指标 | 覆盖 |
| --- | ---: |
| Statements | 91.42% |
| Branch | 79.33% |
| Functions | 95.00% |
| Lines | 91.42% |

## 4. 回归校验

| 校验项 | 结果 |
| --- | --- |
| `npm run lint` | ✅ no-undef=0 |
| `remediate-risk.mjs --check` | ✅ 通过 |
| `check-structure.mjs` | ✅ 通过 |
| `check-frozen.mjs` | ✅ 冻结目录无变更 |
| `audit-secrets.mjs` | ⚠️ 2 项（新轮换 key 在 .env，见交付说明） |

## 5. 复跑命令

```powershell
node --test backend/src/memory/tests/memoryRetriever.test.js
node scripts/test-memory.mjs
node scripts/test-memory-e2e.mjs
node --test frontend/src/session/tests/session.smoke.test.js frontend/src/session/tests/memory.smoke.test.js
npm run coverage
```
