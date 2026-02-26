# CTBMS 对话原生智能体 上线门禁总结 v2

- 生成时间: 2026-02-26T12:07:14.271Z
- 发布结论: GO

## 1. 门禁检查结果

| 门禁项 | 来源文档 | 状态 |
| --- | --- | --- |
| UAT 自动验收 | `docs/aiagnet-chat/CTBMS对话原生智能体-UAT自动验收报告-v2.md` | PASS |
| 监控与告警基线 | `docs/aiagnet-chat/CTBMS对话原生智能体-监控与告警基线-v2.md` | PASS |
| 灰度与回滚演练 | `docs/aiagnet-chat/CTBMS对话原生智能体-灰度与回滚演练记录-v2.md` | PASS |

## 2. 关键发布命令（建议顺序）

1. `pnpm agent:pre-release`
2. `pnpm agent:uat-report`
3. `pnpm agent:ops-report`
4. `pnpm agent:gray-rollback-report`
5. `pnpm agent:release-gate-summary`

## 3. 风险与处置建议

- 当前门禁项全部达标，可进入灰度发布。
- 建议先小流量灰度，再逐级扩大。
- 继续监控：执行失败率、投递失败率、P95 延迟、高风险待审数量。

## 4. 结果摘要

- GO/NO-GO: GO
- 备注: 满足发布门禁条件
