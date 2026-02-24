# CTBMS 对话式 AI 智能体开发启动清单 v1.0

- 目标：先打通“多轮对话 -> 计划确认 -> 执行 -> 结构化结果”最小闭环。
- 范围：P0（2 周），优先后端闭环，前端提供最小可操作页面。

## 0. 配套文档

0. 文档索引：`docs/aiagnet-chat/CTBMS对话式AI智能体-文档索引-v1.md`
1. 产品需求：`docs/aiagnet-chat/CTBMS对话式AI智能体-产品需求文档-PRD-v1.md`
2. 技术设计：`docs/aiagnet-chat/CTBMS对话式AI智能体-技术设计说明-TDD-v1.md`
3. 错误码规范：`docs/aiagnet-chat/CTBMS对话式AI智能体-错误码规范-v1.md`
4. 上线发布清单：`docs/aiagnet-chat/CTBMS对话式AI智能体-上线发布清单-v1.md`

## 1. 里程碑与验收

## M0（第 1-2 天）基础准备

1. 完成接口与状态机评审（会签：产品/后端/前端）。
2. 确认 feature flags：
   - `AGENT_COPILOT_ENABLED`
   - `AGENT_DEBATE_ENABLED`
3. 确认首发意图仅 2 类：
   - 综合分析（RUN_PLAN）
   - 多智能体辩论（DEBATE_PLAN）

验收：评审记录落文档，开关定义可配置。

## M1（第 3-7 天）后端最小闭环

1. 新增 `agent-conversation` 模块骨架（controller/service/dto）。
2. 落地 4 个核心接口：
   - `POST /agent-conversations/sessions`
   - `POST /agent-conversations/sessions/:sessionId/turns`
   - `POST /agent-conversations/sessions/:sessionId/plan/confirm`
   - `GET /agent-conversations/sessions/:sessionId/result`
3. 实现会话状态机与 planVersion 并发保护。
4. 实现 Planner 最小策略：
   - 意图识别（分析/辩论）
   - 槽位缺失追问
   - `proposedPlan` 生成
5. 执行桥接复用现有链路：`validate/preflight/trigger`。

验收：能从一段自然语言触发真实 `workflowExecutionId` 并返回结构化结果。

## M2（第 8-10 天）辩论与交付闭环

1. `DEBATE_PLAN` 编译接入：
   - 复用 `debate-round` 与 `judge-agent` 节点。
2. 接入导出：会话结果支持触发 `report-export` 生成 PDF。
3. 先实现“站内可下载”闭环，邮件留开关占位。

验收：辩论场景能输出结论并成功生成 PDF 下载链接。

## M3（第 11-14 天）前端最小可用

1. 新建页面 `\/workflow\/copilot`（三栏最小版）。
2. 接入会话创建、发送轮次、确认执行、结果展示。
3. 右栏展示计划预览（skills、数据源、风险提示）。
4. 结果页展示 `facts/citations/analysis/actions`。

验收：业务可在页面完整跑通一次“输入 -> 补槽 -> 执行 -> 结果”。

## 2. 工单拆分（可直接分配）

## 2.1 后端

1. `API-01` 会话模型与 DTO（types + validation）。
2. `API-02` sessions 接口实现。
3. `API-03` turns 接口与槽位补齐逻辑。
4. `API-04` plan/confirm 接口 + 并发保护。
5. `API-05` result 聚合器（facts/citations/actions）。
6. `API-06` debate 计划编译器。
7. `API-07` report-export 会话联动。

## 2.2 前端

1. `WEB-01` `CopilotPage` 路由与页面框架。
2. `WEB-02` 聊天流组件（输入、消息、状态标签）。
3. `WEB-03` 计划预览面板与确认交互。
4. `WEB-04` 结果分区卡（facts/analysis/actions）。
5. `WEB-05` 导出下载入口（对接 exportTask）。

## 2.3 数据层

1. `DB-01` 先落 `ConversationSession/ConversationTurn/ConversationPlan`。
2. `DB-02` 生成 migration 并补基础索引。
3. `DB-03` 回填与清理脚本（开发环境）。

## 3. 首发字段冻结（防止反复改接口）

1. 会话主键：`sessionId`。
2. 计划主键：`planId + planVersion`。
3. 结果标准字段：`facts[]`、`citations[]`、`analysis`、`actions`、`confidence`。
4. 执行关联：`workflowExecutionId`。

## 4. 技术约束

1. 不新建执行引擎，必须复用现有 `workflow-execution`。
2. DTO 与 schema 统一放 `packages/types`。
3. 事实结论必须附 `citations`，否则降级文本。
4. 低置信度禁止输出 BUY/SELL。

## 5. 测试清单（P0）

1. 单测：意图识别、槽位补齐、计划编译。
2. 集成：从 turns 到 confirm 到 execution 的全链路。
3. 回归：不影响现有 workflow studio 与 report-export。
4. 人工验收脚本：
   - 周度复盘场景
   - 辩论 + PDF 场景

## 6. 风险清单与预案

1. 风险：Planner 不稳定。
   - 预案：先规则化模板映射，降低自由度。
2. 风险：执行耗时长。
   - 预案：异步执行 + 进度轮询。
3. 风险：数据缺失导致结果空。
   - 预案：明确缺失提示 + 可重试参数建议。

## 7. 启动日执行命令（建议）

```bash
pnpm lint
pnpm type-check
pnpm dev:api
pnpm dev:web
```

## 8. 完成定义（Definition of Done）

1. 文档、接口、代码一致。
2. 至少 2 个真实业务脚本跑通。
3. 关键接口具备鉴权、审计、错误码。
4. lint/type-check 通过。

## 9. 预发布验收（一键）

在仓库根目录执行：

```bash
pnpm agent:pre-release
```

该命令会顺序执行：

1. 构建共享类型包。
2. 同步数据库 schema（`prisma db push`）。
3. 前后端类型检查（`workflow:type-check:split`）。
4. 对话式 Agent 核心 e2e 套件：
   - 普通分析链路
   - 辩论链路
   - 导出+邮件链路
   - 导出未完成失败链路
