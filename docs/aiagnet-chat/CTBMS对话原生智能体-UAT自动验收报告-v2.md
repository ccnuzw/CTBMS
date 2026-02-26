# CTBMS 对话原生智能体 UAT 自动验收报告 v2

- 生成时间: 2026-02-26T16:31:45.080Z
- 总检查项: 6
- 通过: 0
- 失败: 6
- 结论: FAIL

## 结果总览

| 需求 | 用例 | 状态 | 耗时(秒) |
| --- | --- | --- | --- |
| 1. 自然对话直达结果 | 会话创建/多轮自动执行主链路 | FAIL | 18.11 |
| 2. 自生成能力与 Skill 能力 | Skill Draft + 审批流 + 运行时授权治理 | FAIL | 18.39 |
| 3. 无配置多轮 + 结果复用 | 资产语义复用 + 跨轮候选选择 | FAIL | 20.01 |
| 4. 聊天展示 + 多渠道投递 | 导出 + Email/DingTalk/WeCom/Feishu adapter | FAIL | 19.78 |
| 5. 对话式定时任务 | 自然语言调度创建/暂停/恢复 | FAIL | 24.12 |
| 全链路质量门禁 | type-check + suite + pre-release | FAIL | 50 |

## 执行明细

### 1. 自然对话直达结果 - 会话创建/多轮自动执行主链路

- 命令: `pnpm --filter api exec ts-node test/agent-conversation.e2e-spec.ts`
- 状态: FAIL
- 开始: 2026-02-26T16:29:14.678Z
- 结束: 2026-02-26T16:29:32.786Z
- 耗时: 18.11s

```text
undefined
/Users/mac/Progame/CTBMS/apps/api:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: ts-node test/agent-conversation.e2e-spec.ts

```

### 2. 自生成能力与 Skill 能力 - Skill Draft + 审批流 + 运行时授权治理

- 命令: `pnpm --filter api exec ts-node test/agent-conversation-skill-draft.e2e-spec.ts`
- 状态: FAIL
- 开始: 2026-02-26T16:29:32.786Z
- 结束: 2026-02-26T16:29:51.172Z
- 耗时: 18.39s

```text
undefined
/Users/mac/Progame/CTBMS/apps/api:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: ts-node test/agent-conversation-skill-draft.e2e-spec.ts

```

### 3. 无配置多轮 + 结果复用 - 资产语义复用 + 跨轮候选选择

- 命令: `pnpm --filter api exec ts-node test/agent-conversation-assets.e2e-spec.ts`
- 状态: FAIL
- 开始: 2026-02-26T16:29:51.172Z
- 结束: 2026-02-26T16:30:11.181Z
- 耗时: 20.01s

```text
undefined
/Users/mac/Progame/CTBMS/apps/api:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: ts-node test/agent-conversation-assets.e2e-spec.ts

```

### 4. 聊天展示 + 多渠道投递 - 导出 + Email/DingTalk/WeCom/Feishu adapter

- 命令: `pnpm --filter api exec ts-node test/agent-conversation-delivery.e2e-spec.ts`
- 状态: FAIL
- 开始: 2026-02-26T16:30:11.181Z
- 结束: 2026-02-26T16:30:30.963Z
- 耗时: 19.78s

```text
undefined
/Users/mac/Progame/CTBMS/apps/api:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: ts-node test/agent-conversation-delivery.e2e-spec.ts

```

### 5. 对话式定时任务 - 自然语言调度创建/暂停/恢复

- 命令: `pnpm --filter api exec ts-node test/agent-conversation-schedule.e2e-spec.ts`
- 状态: FAIL
- 开始: 2026-02-26T16:30:30.963Z
- 结束: 2026-02-26T16:30:55.079Z
- 耗时: 24.12s

```text
undefined
/Users/mac/Progame/CTBMS/apps/api:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: ts-node test/agent-conversation-schedule.e2e-spec.ts

```

### 全链路质量门禁 - type-check + suite + pre-release

- 命令: `pnpm agent:pre-release`
- 状态: FAIL
- 开始: 2026-02-26T16:30:55.079Z
- 结束: 2026-02-26T16:31:45.079Z
- 耗时: 50s

```text
Running generate... (Use --skip-generate to skip the generators)
[2K[1A[2K[GRunning generate... - Prisma Client
[2K[1A[2K[G✔ Generated Prisma Client (v5.22.0) to ./../../node_modules/.pnpm/@prisma+client
@5.22.0_prisma@5.22.0/node_modules/@prisma/client in 1.70s


> ctbms-monorepo@ workflow:type-check:split /Users/mac/Progame/CTBMS
> pnpm --filter @packages/types type-check && pnpm --filter api type-check && pnpm --filter web type-check


> @packages/types@0.0.0 type-check /Users/mac/Progame/CTBMS/packages/types
> tsc --noEmit


> api@0.0.1 type-check /Users/mac/Progame/CTBMS/apps/api
> tsc --noEmit

src/modules/workflow-execution/engine/node-executors/data-fetch.executor.ts(342,9): error TS2783: 'fetchedAt' is specified more than once, so this usage will be overwritten.
src/modules/workflow-execution/engine/node-executors/data-fetch.executor.ts(343,9): error TS2783: 'recordCount' is specified more than once, so this usage will be overwritten.
/Users/mac/Progame/CTBMS/apps/api:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  api@0.0.1 type-check: `tsc --noEmit`
Exit status 2
 ELIFECYCLE  Command failed with exit code 2.
 ELIFECYCLE  Command failed with exit code 2.

```

