# CTBMS 对话原生智能体 UAT 自动验收报告 v2

- 生成时间: 2026-02-26T13:35:43.112Z
- 总检查项: 6
- 通过: 6
- 失败: 0
- 结论: PASS

## 结果总览

| 需求 | 用例 | 状态 | 耗时(秒) |
| --- | --- | --- | --- |
| 1. 自然对话直达结果 | 会话创建/多轮自动执行主链路 | PASS | 37.01 |
| 2. 自生成能力与 Skill 能力 | Skill Draft + 审批流 + 运行时授权治理 | PASS | 22.25 |
| 3. 无配置多轮 + 结果复用 | 资产语义复用 + 跨轮候选选择 | PASS | 80.48 |
| 4. 聊天展示 + 多渠道投递 | 导出 + Email/DingTalk/WeCom/Feishu adapter | PASS | 32.87 |
| 5. 对话式定时任务 | 自然语言调度创建/暂停/恢复 | PASS | 48.15 |
| 全链路质量门禁 | type-check + suite + pre-release | PASS | 476.48 |

## 执行明细

### 1. 自然对话直达结果 - 会话创建/多轮自动执行主链路

- 命令: `pnpm --filter api exec ts-node test/agent-conversation.e2e-spec.ts`
- 状态: PASS
- 开始: 2026-02-26T13:24:05.861Z
- 结束: 2026-02-26T13:24:42.874Z
- 耗时: 37.01s

```text
ok
```

### 2. 自生成能力与 Skill 能力 - Skill Draft + 审批流 + 运行时授权治理

- 命令: `pnpm --filter api exec ts-node test/agent-conversation-skill-draft.e2e-spec.ts`
- 状态: PASS
- 开始: 2026-02-26T13:24:42.874Z
- 结束: 2026-02-26T13:25:05.125Z
- 耗时: 22.25s

```text
ok
```

### 3. 无配置多轮 + 结果复用 - 资产语义复用 + 跨轮候选选择

- 命令: `pnpm --filter api exec ts-node test/agent-conversation-assets.e2e-spec.ts`
- 状态: PASS
- 开始: 2026-02-26T13:25:05.125Z
- 结束: 2026-02-26T13:26:25.604Z
- 耗时: 80.48s

```text
ok
```

### 4. 聊天展示 + 多渠道投递 - 导出 + Email/DingTalk/WeCom/Feishu adapter

- 命令: `pnpm --filter api exec ts-node test/agent-conversation-delivery.e2e-spec.ts`
- 状态: PASS
- 开始: 2026-02-26T13:26:25.604Z
- 结束: 2026-02-26T13:26:58.478Z
- 耗时: 32.87s

```text
ok
```

### 5. 对话式定时任务 - 自然语言调度创建/暂停/恢复

- 命令: `pnpm --filter api exec ts-node test/agent-conversation-schedule.e2e-spec.ts`
- 状态: PASS
- 开始: 2026-02-26T13:26:58.478Z
- 结束: 2026-02-26T13:27:46.629Z
- 耗时: 48.15s

```text
ok
```

### 全链路质量门禁 - type-check + suite + pre-release

- 命令: `pnpm agent:pre-release`
- 状态: PASS
- 开始: 2026-02-26T13:27:46.629Z
- 结束: 2026-02-26T13:35:43.112Z
- 耗时: 476.48s

```text
ok
```

