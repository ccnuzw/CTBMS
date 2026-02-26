# CTBMS 对话原生智能体 UAT 自动验收报告 v2

- 生成时间: 2026-02-26T11:47:47.767Z
- 总检查项: 6
- 通过: 6
- 失败: 0
- 结论: PASS

## 结果总览

| 需求 | 用例 | 状态 | 耗时(秒) |
| --- | --- | --- | --- |
| 1. 自然对话直达结果 | 会话创建/多轮自动执行主链路 | PASS | 31.35 |
| 2. 自生成能力与 Skill 能力 | Skill Draft + 审批流 + 运行时授权治理 | PASS | 16.71 |
| 3. 无配置多轮 + 结果复用 | 资产语义复用 + 跨轮候选选择 | PASS | 77.32 |
| 4. 聊天展示 + 多渠道投递 | 导出 + Email/DingTalk/WeCom/Feishu adapter | PASS | 28.37 |
| 5. 对话式定时任务 | 自然语言调度创建/暂停/恢复 | PASS | 32.04 |
| 全链路质量门禁 | type-check + suite + pre-release | PASS | 444.05 |

## 执行明细

### 1. 自然对话直达结果 - 会话创建/多轮自动执行主链路

- 命令: `pnpm --filter api exec ts-node test/agent-conversation.e2e-spec.ts`
- 状态: PASS
- 开始: 2026-02-26T11:37:17.929Z
- 结束: 2026-02-26T11:37:49.283Z
- 耗时: 31.35s

```text
ok
```

### 2. 自生成能力与 Skill 能力 - Skill Draft + 审批流 + 运行时授权治理

- 命令: `pnpm --filter api exec ts-node test/agent-conversation-skill-draft.e2e-spec.ts`
- 状态: PASS
- 开始: 2026-02-26T11:37:49.283Z
- 结束: 2026-02-26T11:38:05.995Z
- 耗时: 16.71s

```text
ok
```

### 3. 无配置多轮 + 结果复用 - 资产语义复用 + 跨轮候选选择

- 命令: `pnpm --filter api exec ts-node test/agent-conversation-assets.e2e-spec.ts`
- 状态: PASS
- 开始: 2026-02-26T11:38:05.995Z
- 结束: 2026-02-26T11:39:23.315Z
- 耗时: 77.32s

```text
ok
```

### 4. 聊天展示 + 多渠道投递 - 导出 + Email/DingTalk/WeCom/Feishu adapter

- 命令: `pnpm --filter api exec ts-node test/agent-conversation-delivery.e2e-spec.ts`
- 状态: PASS
- 开始: 2026-02-26T11:39:23.315Z
- 结束: 2026-02-26T11:39:51.681Z
- 耗时: 28.37s

```text
ok
```

### 5. 对话式定时任务 - 自然语言调度创建/暂停/恢复

- 命令: `pnpm --filter api exec ts-node test/agent-conversation-schedule.e2e-spec.ts`
- 状态: PASS
- 开始: 2026-02-26T11:39:51.681Z
- 结束: 2026-02-26T11:40:23.719Z
- 耗时: 32.04s

```text
ok
```

### 全链路质量门禁 - type-check + suite + pre-release

- 命令: `pnpm agent:pre-release`
- 状态: PASS
- 开始: 2026-02-26T11:40:23.720Z
- 结束: 2026-02-26T11:47:47.767Z
- 耗时: 444.05s

```text
ok
```

