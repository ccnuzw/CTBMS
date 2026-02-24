# CTBMS 对话式 AI Agent（Smart Skill Agent）PRD v1.3

- 项目名称：CTBMS 对话式 AI Agent（Smart Skill Agent）
- 版本：v1.3（新增订阅、回测、冲突消解）
- 文档状态：评审版
- 适用范围：`apps/web`、`apps/api`、`packages/types`

## 文档导航

0. 文档索引总览：`docs/aiagnet-chat/CTBMS对话式AI智能体-文档索引-v1.md`
1. 技术设计说明：`docs/aiagnet-chat/CTBMS对话式AI智能体-技术设计说明-TDD-v1.md`
2. 接口字段规范：`docs/aiagnet-chat/CTBMS对话式AI智能体-接口字段定义-API规范-v1.md`
3. 数据表草案：`docs/aiagnet-chat/CTBMS对话式AI智能体-数据表设计草案-PrismaDDL-v1.md`
4. 前端状态流：`docs/aiagnet-chat/CTBMS对话式AI智能体-前端状态流与页面结构-v1.md`
5. 开发启动清单：`docs/aiagnet-chat/CTBMS对话式AI智能体-开发启动清单-v1.md`
6. 错误码规范：`docs/aiagnet-chat/CTBMS对话式AI智能体-错误码规范-v1.md`
7. 上线发布清单：`docs/aiagnet-chat/CTBMS对话式AI智能体-上线发布清单-v1.md`

## 1. 产品愿景

在 CTBMS 内建设一个“能听懂复杂业务任务、能自动调度 skills、能产出可执行结论”的对话式 AI Agent。用户只需自然语言提出任务，系统即可自动完成：

1. 数据检索与汇聚（价格、知识库、B 类情报、期货、持仓等）。
2. 多智能体推理（可选辩论、裁判、结论收敛）。
3. 结构化结论与建议输出（含事实引用、风险说明）。
4. 报告产物交付（PDF/Word/JSON）与消息触达（邮件等）。
5. 能力缺口识别并生成 Skill Draft（受控创建与审批）。

## 2. 核心业务诉求（来自用户场景）

### 2.1 综合分析场景

示例：

> 调用最近一周东北玉米价格数据 + 最近一周日报/周报/研报 + 期货数据 + 当前持仓数据，先总结过去一周行情及事件，再判断未来三个月走势，并给出现货与期货操作建议。

### 2.2 多智能体辩论场景

示例：

> 就“东北玉米未来是否存在缺口并涨价”进行多智能体辩论，调用近一个月价格与知识库数据，结合期货盘面，最终给出裁决结论，并导出 PDF 发送到邮箱。

## 3. 能力扫描结论（基于当前代码）

以下为已完成能力与缺口（已扫描后端/前端模块）：

### 3.1 已具备能力

1. 多智能体辩论节点与裁判节点已具备执行能力：
   - `apps/api/src/modules/workflow-execution/engine/node-executors/debate-round.executor.ts`
   - `apps/api/src/modules/workflow-execution/engine/node-executors/judge-agent.executor.ts`
2. 报告导出中心已支持 PDF/Word/JSON 产物：
   - `apps/api/src/modules/report-export/report-export.service.ts`
   - `apps/api/src/modules/report-export/report-export.controller.ts`
3. 期货相关能力已具备基础：
   - 期货数据节点（支持 mock + DataConnector）：`apps/api/src/modules/workflow-execution/engine/node-executors/futures-data-fetch.executor.ts`
   - 期货模拟与持仓服务：`apps/api/src/modules/futures-sim/futures-sim.service.ts`
4. Agent 工具调用框架已具备（tool calling + registry）：
   - `apps/api/src/modules/workflow-execution/engine/node-executors/agent-call.executor.ts`
   - `apps/api/src/modules/agent-skill/tool-handler-registry.service.ts`
5. 工作流 DSL 与校验/预检/执行链路已存在，可复用。

### 3.2 当前缺口

1. 对话入口仍偏“基础聊天”，缺少“复杂任务规划与执行编排”闭环。
2. Skill 生态薄弱：当前内置 handler 仅少量示例（知识检索、计算 mock）。
3. “对话中自创建 skill”缺少产品化流程（Draft、沙箱测试、审批发布）。
4. 邮件通知节点当前为占位输出，尚未实现真实发信通道：
   - `apps/api/src/modules/workflow-execution/engine/node-executors/notify-node.executor.ts`
5. “对话 -> 一键导出 PDF -> 自动发邮箱”尚未形成端到端体验。
6. 缺少“订阅式任务”能力，当前以单次会话为主。
7. 缺少“策略回测”能力，建议可信度不足。
8. 缺少“多源数据冲突消解”产品化机制，冲突仅靠人工判断。

## 4. 产品目标

### 4.1 用户目标

1. 普通业务用户通过一句话发起复杂分析任务。
2. 能够发起多智能体辩论并获得可执行结论。
3. 可直接获得交付物（PDF）并指定发送方式（邮箱）。

### 4.2 平台目标

1. 对话式任务执行不绕过现有治理（权限/审计/成本/风控）。
2. Agent 具备技能编排能力与受控技能进化能力。
3. 输出可验证：事实必须有引用、建议必须有依据。

## 5. 非目标（v1.3）

1. 不允许无审批自动发布具副作用（写库、外发、交易）的技能。
2. 不开放无白名单的任意网站抓取。
3. 不重做底层工作流引擎，全部复用现有链路。

## 6. 目标用户与角色

1. 业务分析员：快速生成阶段性复盘与展望。
2. 交易/经营人员：结合现货与期货给出操作建议。
3. 管理层：通过辩论式结论查看策略分歧与风险。
4. 平台管理员：治理 skill、审批能力扩展。

## 7. 产品架构（升级版）

### 7.1 七层能力架构

1. 对话编排层（Conversation Orchestrator）：意图识别、槽位补齐、上下文记忆。
2. 任务规划层（Planner）：生成结构化执行计划，不直接输出事实结论。
3. 执行计划层（Plan Compiler）：将计划编译为 `RunPlan` 或 `DebatePlan`。
4. 技能运行层（Skill Runtime）：统一调用 Data/RAG/Futures/Report/Notify 技能。
5. 技能进化层（Skill Builder）：生成 Skill Draft、沙箱测试、审批发布。
6. 治理校验层（Validator + Policy）：权限、成本、引用、输出门禁。
7. 交付输出层（Delivery Composer）：报告生成、文件导出、消息分发。

### 7.2 两条核心执行链

1. 分析链：对话 -> 计划 -> 数据汇聚 -> 分析 -> 结论 -> 报告。
2. 辩论链：对话 -> 辩论计划 -> 多智能体辩论 -> 裁判 -> 结论 -> 报告 -> 邮件。

## 8. 场景设计（产品级）

### 8.1 场景 A：周度复盘 + 三月展望

系统动作：

1. 自动拆任务：价格趋势、事件抽取、知识总结、期货盘面、持仓暴露。
2. 自动调用技能：价格序列、知识检索、B 类情报检索、期货数据、统计计算、报告生成。
3. 输出结构：
   - 事实层（数据与引用）
   - 判断层（趋势和驱动）
   - 建议层（现货/期货动作与风险边界）

### 8.2 场景 B：多智能体辩论 + 裁判 + PDF 邮件分发

系统动作：

1. 生成辩论配置：正方/反方/中立研究员/风险官/裁判。
2. 执行辩论回合并收敛：支持 WEIGHTED、MAJORITY、JUDGE_AGENT。
3. 生成结论报告并导出 PDF。
4. 调用通知技能发送至用户邮箱（v1.3 需要补齐真实发送实现）。

### 8.3 场景 C：订阅式周报/日报自动交付

系统动作：

1. 用户在对话中说“每周一早上 8 点发我邮箱”。
2. 系统把当前 Plan 固化为 SubscriptionPlan。
3. 调度器按 cron 执行工作流并自动导出与投递。
4. 用户可在会话内说“暂停订阅/改成每天 7 点”。

### 8.4 场景 D：策略回测与复盘

系统动作：

1. 对输出的现货/期货建议自动生成回测任务。
2. 指定回看窗口（如过去 6 个月）并计算收益、回撤、胜率。
3. 输出“建议可行性评分”与风险提示。
4. 回测结果可并入 PDF 报告附件。

### 8.5 场景 E：多源数据冲突消解

系统动作：

1. 检测价格、持仓、研报结论冲突。
2. 依据来源优先级策略做冲突归并。
3. 在结果中显式输出冲突项与采用依据。
4. 低一致性时降级为“观察建议”，避免强结论。

## 9. Skill 体系设计

### 9.1 Skill 分类

1. Data Skills：采集点价格、统计聚合、异常检测、持仓分析。
2. Retrieval Skills：日报/周报/月报/研报/AI 周报/B 类情报检索。
3. Futures Skills：行情、持仓、衍生特征。
4. Debate Skills：角色生成、轮次编排、裁判策略。
5. Output Skills：Markdown/JSON/PDF/Word。
6. Delivery Skills：邮件、站内通知、任务回传。
7. Governance Skills：引用生成、置信度评估、权限与脱敏。

### 9.2 Skill 契约（必填字段）

1. `skillCode`、`name`、`description`
2. `inputSchema`、`outputSchema`
3. `permissionScope`
4. `costPolicy`、`timeoutPolicy`、`rateLimit`
5. `reliability`、`fallbackPolicy`
6. `sideEffectLevel`（READ_ONLY / WRITE / EXTERNAL_ACTION）
7. `status`（DRAFT / SANDBOX / APPROVED / PUBLISHED / DISABLED）

### 9.3 对话中创建 Skill（受控）

1. Agent 发现能力缺口时输出 `CapabilityGap`。
2. 系统可生成 `SkillDraft`（接口草案 + 参数合同 + 示例）。
3. 在沙箱执行回放测试，形成测试报告。
4. 审批通过后发布到 Skill Registry。

限制：

1. 默认仅允许 READ_ONLY 技能自动进入沙箱。
2. 涉及邮件/外发/交易必须人工审批。

## 10. 对话交互设计

### 10.1 状态机

1. `INTENT_CAPTURE`
2. `SLOT_FILLING`
3. `PLAN_PREVIEW`
4. `USER_CONFIRM`
5. `EXECUTING`
6. `RESULT_DELIVERY`
7. `CAPABILITY_GAP`（可选）

### 10.2 双确认

1. 人话确认：任务目标、范围、输出。
2. 结构确认：数据源、skills、预算、风险提示。

### 10.3 可编辑指令

支持用户在确认前直接修改：时间范围、区域、数据源、辩论角色、输出格式、收件邮箱。

## 11. 事实可信与风控机制

1. Tool-first：数字类结论必须走工具。
2. 引用门禁：事实句必须绑定 citation。
3. 置信度门禁：低置信度不输出强行动建议。
4. 成本门禁：超预算自动降级（减少检索深度/轮次）。
5. 权限门禁：越权数据直接阻断并提示。
6. 冲突门禁：数据一致性低于阈值时禁止输出激进行动建议。

## 12. 报告与交付设计

### 12.1 输出格式

1. 结构化 JSON（系统可消费）。
2. Markdown（快速阅读）。
3. PDF/Word（正式交付）。

### 12.2 交付动作

1. 导出任务生成（已具备）。
2. 下载链接返回（已具备）。
3. 邮件分发（v1.3 补齐 SMTP/企业邮件网关能力）。
4. 订阅交付（v1.3 新增）：定时执行 + 自动导出 + 自动投递。

## 13. 产品功能范围（v1.3）

### 13.1 必做

1. 对话式复杂任务生成与执行闭环。
2. 多智能体辩论模板化入口（含裁判）。
3. 报告导出（PDF/Word/JSON）与对话联动。
4. 邮件发送真实能力接入（最小可用）。
5. Capability Gap 提示与 Skill Draft 创建入口。
6. 订阅任务创建、暂停、恢复与执行日志。
7. 建议结果一键回测与回测评分。
8. 数据冲突检测与冲突解释输出。

### 13.2 后续迭代

1. Skill Draft 自动测试覆盖率提升。
2. 外部公开 API 统一接入网关。
3. 专家模式可视化调参与回放。
4. 订阅模板市场与团队共享订阅。
5. 回测参数自动寻优。

## 14. API 需求（产品视角）

1. `POST /agent-conversations/sessions`
2. `POST /agent-conversations/:id/turns`
3. `POST /agent-conversations/:id/plan/confirm`
4. `GET /agent-conversations/:id/result`
5. `POST /agent-conversations/:id/debate/start`
6. `POST /agent-conversations/:id/export`（PDF/Word/JSON）
7. `POST /agent-conversations/:id/deliver/email`
8. `POST /agent-conversations/:id/capability-gap/skill-draft`
9. `POST /agent-conversations/:id/subscriptions`
10. `PATCH /agent-conversations/:id/subscriptions/:subscriptionId`
11. `POST /agent-conversations/:id/backtests`
12. `GET /agent-conversations/:id/conflicts`

## 15. 数据模型（新增建议）

1. `ConversationSession`
2. `ConversationTurn`
3. `ConversationPlanSnapshot`
4. `ConversationExecutionLink`
5. `ConversationDeliveryTask`
6. `SkillDraft`
7. `SkillDraftTestRun`
8. `SkillReviewRecord`
9. `ConversationSubscription`
10. `ConversationSubscriptionRun`
11. `ConversationBacktestJob`
12. `ConversationConflictRecord`

## 16. 权限与治理

1. 对话数据权限继承用户组织权限。
2. 事实输出默认脱敏策略与审计留痕。
3. 技能创建与发布采用 RBAC 分级。
4. 审计链路包含：请求内容、技能调用、数据域、导出文件、发送记录。

## 17. 非功能需求（NFR）

1. 对话解析响应 P95 <= 3s。
2. 执行受理 2s 内返回 `executionId`。
3. 导出任务状态可追踪。
4. 引用完整性不足时禁止输出“确定性策略结论”。

## 18. 成功指标（KPI）

### 18.1 产品指标

1. 对话发起数。
2. 对话转执行率。
3. 辩论场景使用率。
4. 导出与邮件交付完成率。
5. 订阅留存率（7/30 天）。

### 18.2 质量指标

1. 引用覆盖率。
2. 低置信度拦截准确率。
3. 执行失败自动修复率。
4. 冲突检测准确率。

### 18.3 生态指标

1. Skill Draft 生成数。
2. Skill 审批通过率。
3. Skill 上线后调用成功率。
4. 回测使用率与回测后策略采纳率。

## 19. 里程碑规划

### M1（2 周）

1. 对话执行闭环（复杂分析场景）。
2. 计划确认与引用门禁。
3. 对话联动导出中心。

### M2（2 周）

1. 多智能体辩论场景产品化（模板 + 参数面板）。
2. 裁判策略可配置。
3. 期货与持仓数据接入增强。

### M3（2 周）

1. 邮件分发能力上线。
2. Capability Gap 与 Skill Draft 流程上线。
3. 沙箱测试与审批入口上线。

### M4（2 周）

1. 订阅任务中心上线（创建/暂停/恢复/重跑）。
2. 策略回测模块上线（收益、回撤、胜率）。
3. 冲突消解规则中心上线。

## 20. 验收标准（UAT）

1. 用户可通过一段自然语言完成“多源分析 -> 结论 -> 建议 -> 导出”。
2. 用户可触发“辩论 -> 裁判 -> 结论 -> PDF 生成”。
3. 用户可发起“发送到我的邮箱”并看到投递状态。
4. 系统可识别能力缺口并生成 Skill Draft。
5. 未审批技能不得在生产会话中调用。
6. 用户可对同一结论发起回测并获得可解释评分。
7. 用户可将会话设置为订阅并自动收到周期报告。
8. 冲突数据场景下，系统可输出冲突说明与降级建议。

## 21. 风险与应对

1. 风险：建议偏激导致误用。
   - 对策：风险偏好模板 + 强制风险声明 + REVIEW_ONLY 回退。
2. 风险：外部 API 不稳定。
   - 对策：缓存、超时、降级与来源标注。
3. 风险：技能扩展失控。
   - 对策：Draft-沙箱-审批-发布四段式治理。
4. 风险：订阅噪音过高导致用户疲劳。
   - 对策：频率上限、静默时段、异常触发优先。
5. 风险：回测被误解为收益承诺。
   - 对策：强制展示回测假设、费用模型与免责声明。

## 22. 待产品确认项

1. 菜单命名：`对话助手` 或 `智能研究员`。
2. 辩论默认角色模板（建议 4 角色 + 1 裁判）。
3. 邮件发送渠道优先级（SMTP / 企业邮箱网关）。
4. 低置信度阈值（建议 `< 0.6` 禁止 BUY/SELL）。
5. “能力缺口自动提 skill 草稿”是否默认开启。

---

## 附录 A：与现有系统对齐策略

1. 优先复用既有工作流执行、辩论执行、报告导出模块。
2. 对话层仅做“上层编排”，不替代底层执行引擎。
3. 所有新 DTO 与 schema 统一放入 `packages/types`。
4. 邮件能力以新增 Delivery Skill 方式接入，不破坏现有 notify 节点兼容。
