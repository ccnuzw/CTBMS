# CTBMS 对话原生智能体 监控与告警基线 v2

- 生成时间: 2026-02-26T13:46:15.483Z
- UAT 状态: PASS
- 基线检查结论: PASS

## 告警规则

| 指标 | 目标 | Warning | Critical |
| --- | --- | --- | --- |
| 会话执行失败率 | < 2% / 1h | warning>=2% | critical>=5% |
| 导出失败率 | < 1% / 1h | warning>=1% | critical>=3% |
| 投递失败率 | < 2% / 1h | warning>=2% | critical>=5% |
| P95 响应延迟 | < 12s | warning>=12s | critical>=20s |
| 高风险草稿待审 | <= 5 | warning>5 | critical>10 |
| 活跃授权1h内过期 | <= 3 | warning>3 | critical>8 |

## 自动检查结果

| 检查项 | 状态 | 耗时(秒) |
| --- | --- | --- |
| `pnpm workflow:type-check:split` | PASS | 41.75 |
| `pnpm --filter api run test:e2e:agent-suite` | PASS | 513.48 |

### pnpm workflow:type-check:split

- 状态: PASS
- 开始: 2026-02-26T13:37:00.249Z
- 结束: 2026-02-26T13:37:42.003Z

```text
ok
```

### pnpm --filter api run test:e2e:agent-suite

- 状态: PASS
- 开始: 2026-02-26T13:37:42.003Z
- 结束: 2026-02-26T13:46:15.483Z

```text
ok (recovered after retry #1)
```

