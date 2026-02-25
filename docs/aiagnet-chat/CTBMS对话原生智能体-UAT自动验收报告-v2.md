# CTBMS 对话原生智能体 UAT 自动验收报告 v2

- 生成时间: 2026-02-25T17:22:58.153Z
- 总检查项: 6
- 通过: 6
- 失败: 0
- 结论: PASS

## 结果总览

| 需求 | 用例 | 状态 | 耗时(秒) |
| --- | --- | --- | --- |
| 1. 自然对话直达结果 | 会话创建/多轮自动执行主链路 | PASS | 14.24 |
| 2. 自生成能力与 Skill 能力 | Skill Draft + 审批流 + 运行时授权治理 | PASS | 14.35 |
| 3. 无配置多轮 + 结果复用 | 资产语义复用 + 跨轮候选选择 | PASS | 15.11 |
| 4. 聊天展示 + 多渠道投递 | 导出 + Email/DingTalk/WeCom/Feishu adapter | PASS | 14.39 |
| 5. 对话式定时任务 | 自然语言调度创建/暂停/恢复 | PASS | 14.7 |
| 全链路质量门禁 | type-check + suite + pre-release | PASS | 279.81 |

## 执行明细

### 1. 自然对话直达结果 - 会话创建/多轮自动执行主链路

- 命令: `pnpm --filter api exec ts-node test/agent-conversation.e2e-spec.ts`
- 状态: PASS
- 开始: 2026-02-25T17:17:05.549Z
- 结束: 2026-02-25T17:17:19.786Z
- 耗时: 14.24s

```text
ok
```

### 2. 自生成能力与 Skill 能力 - Skill Draft + 审批流 + 运行时授权治理

- 命令: `pnpm --filter api exec ts-node test/agent-conversation-skill-draft.e2e-spec.ts`
- 状态: PASS
- 开始: 2026-02-25T17:17:19.786Z
- 结束: 2026-02-25T17:17:34.135Z
- 耗时: 14.35s

```text
ok
```

### 3. 无配置多轮 + 结果复用 - 资产语义复用 + 跨轮候选选择

- 命令: `pnpm --filter api exec ts-node test/agent-conversation-assets.e2e-spec.ts`
- 状态: PASS
- 开始: 2026-02-25T17:17:34.135Z
- 结束: 2026-02-25T17:17:49.249Z
- 耗时: 15.11s

```text
ok
```

### 4. 聊天展示 + 多渠道投递 - 导出 + Email/DingTalk/WeCom/Feishu adapter

- 命令: `pnpm --filter api exec ts-node test/agent-conversation-delivery.e2e-spec.ts`
- 状态: PASS
- 开始: 2026-02-25T17:17:49.249Z
- 结束: 2026-02-25T17:18:03.642Z
- 耗时: 14.39s

```text
ok
```

### 5. 对话式定时任务 - 自然语言调度创建/暂停/恢复

- 命令: `pnpm --filter api exec ts-node test/agent-conversation-schedule.e2e-spec.ts`
- 状态: PASS
- 开始: 2026-02-25T17:18:03.642Z
- 结束: 2026-02-25T17:18:18.338Z
- 耗时: 14.7s

```text
ok
```

### 全链路质量门禁 - type-check + suite + pre-release

- 命令: `pnpm agent:pre-release`
- 状态: PASS
- 开始: 2026-02-25T17:18:18.339Z
- 结束: 2026-02-25T17:22:58.151Z
- 耗时: 279.81s

```text
ok
```

