# CTBMS 对话原生智能体 灰度与回滚演练记录 v2

- 生成时间: 2026-02-26T13:46:17.139Z
- 演练模式: 文档化流程 + 开关状态快照

## 1. 灰度开关快照

| 开关 | 当前值 | 状态 |
| --- | --- | --- |
| AGENT_COPILOT_ENABLED | (unset) | OFF |
| AGENT_DELIVERY_MULTI_CHANNEL_ENABLED | (unset) | OFF |
| AGENT_SCHEDULE_NL_ENABLED | (unset) | OFF |
| AGENT_SKILL_RUNTIME_GRANT_ENABLED | (unset) | OFF |
| AGENT_ASSET_SEMANTIC_REUSE_ENABLED | (unset) | OFF |

## 2. 建议灰度顺序

1. 开启 `AGENT_COPILOT_ENABLED`（只读会话）
2. 开启 `AGENT_ASSET_SEMANTIC_REUSE_ENABLED`（复用增强）
3. 开启 `AGENT_DELIVERY_MULTI_CHANNEL_ENABLED`（多渠道投递）
4. 开启 `AGENT_SCHEDULE_NL_ENABLED`（自然语言调度）
5. 开启 `AGENT_SKILL_RUNTIME_GRANT_ENABLED`（低风险先用后审）

## 3. 回滚策略

1. 按灰度逆序逐项关闭开关。
2. 执行 `pnpm workflow:type-check:split` 与 `pnpm --filter api run test:e2e:agent-suite`。
3. 执行 `pnpm agent:pre-release` 验证回滚后基线。
4. 若投递异常，优先关闭 `AGENT_DELIVERY_MULTI_CHANNEL_ENABLED`。
5. 若复用误选升高，关闭 `AGENT_ASSET_SEMANTIC_REUSE_ENABLED` 并保留显式 assetId 模式。

## 4. 演练结论

- 该文档用于记录当前环境开关状态与标准回滚步骤。
- 正式演练建议与 `pnpm agent:uat-report`、`pnpm agent:ops-report` 联动归档。
