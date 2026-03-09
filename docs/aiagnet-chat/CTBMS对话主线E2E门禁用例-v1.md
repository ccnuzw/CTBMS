# CTBMS 对话主线 E2E 门禁用例 v1.0

- 版本：v1.0
- 日期：2026-03-06
- 目标：将“普通用户无感 + 自由对话闭环”固化为可执行门禁

---

## 1. 门禁范围

本门禁覆盖以下主线能力：

1. 首轮回复必须有可执行下一步动作。
2. 对话内完成“提问 -> 结果 -> 发送”闭环。
3. 对话内完成“提问 -> 结果 -> 定时”闭环。
4. 失败场景要返回可执行补救动作而非仅报错。

---

## 2. 用例清单

### GATE-CHAT-001 首轮动作可执行

1. 目标：验证首轮回复包含 `replyOptions`，且至少 1 个可执行动作。
2. 覆盖脚本：`apps/api/test/agent-conversation.e2e-spec.ts`
3. 执行命令：`pnpm --filter api run test:e2e:agent-conversation`
4. 通过标准：
   - `replyOptions` 数组存在
   - `replyOptions.length >= 1`
   - 结果状态为 `PLAN_PREVIEW` 或 `EXECUTING`

### GATE-CHAT-002 对话内发送闭环

1. 目标：验证用户无需跳复杂页面即可完成导出与发送。
2. 覆盖脚本：`apps/api/test/agent-conversation-delivery.e2e-spec.ts`
3. 执行命令：`pnpm --filter api run test:e2e:agent-conversation-delivery`
4. 通过标准：
   - 会话可创建并执行
   - 导出任务可创建
   - Email/IM 渠道发送返回 `SENT`
   - 失败补救链路可用（例如缺少 target 时返回可识别错误码，补充后重试成功）

### GATE-CHAT-003 对话内定时闭环

1. 目标：验证自然语言定时任务可创建/暂停/恢复。
2. 覆盖脚本：`apps/api/test/agent-conversation-schedule.e2e-spec.ts`
3. 执行命令：`pnpm --filter api run test:e2e:agent-conversation-schedule`
4. 通过标准：
   - `schedules/resolve` 可完成 `CREATE`
   - 可执行 `PAUSE` 与 `RESUME`
   - 状态流转正确（`ACTIVE -> PAUSED -> ACTIVE`）

### GATE-CHAT-004 主线套件总门禁

1. 目标：在放量前执行完整对话主链路回归。
2. 覆盖脚本：`agent-conversation*` 套件（含 delivery/subscription/schedule 等）
3. 执行命令：`pnpm --filter api run test:e2e:agent-suite`
4. 通过标准：
   - 所有子套件通过
   - 无阻断级失败

---

## 3. 放量门禁判定

1. 以上 4 个门禁用例全部通过，方可进入放量评审。
2. 任一失败时，按 `CTBMS对话产品文档治理与落地执行计划-v1.md` 的纠偏 SLA 执行。
3. 门禁结果需写入周检记录文档，给出“允许/禁止放量”结论。

---

## 4. 关联文档

1. `docs/aiagnet-chat/CTBMS对话产品文档治理与落地执行计划-v1.md`
2. `docs/aiagnet-chat/CTBMS对话主线周检清单-v1.md`
3. `docs/aiagnet-chat/CTBMS对话主线周检清单-2026-03-06.md`
4. `docs/aiagnet-chat/CTBMS大宗农产贸易超级智能体-研发任务拆解与Backlog-v1.md`

---

## 5. 稳定性观察（持续更新）

1. `agent-conversation-assets` 在长链路套件中出现过偶发失败，单测与复跑可通过。
2. 建议将 `agent-conversation-assets` 纳入每日定时回归，连续 7 天观察通过率。
3. 每日执行建议：
   - 命令：`pnpm --filter api run test:e2e:agent-conversation-assets`
   - 次数：每天至少 3 次（建议早/中/晚各一次）
   - 判定：当日通过率 < 100% 则标记为“波动未收敛”，禁止放量，仅允许修复与复验。
