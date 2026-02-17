# 智能体工作流 UX 改进提案（第二版）

> 文档用途：作为“节点属性配置面板可视化改造”任务规划基线。
> 适用范围：`apps/web/src/features/workflow-studio/canvas` 与相关 `workflow-agent-center` 复用组件。
> 目标用户：业务分析师、流程运营、低代码实施顾问。

---

## 1. 改造目标与边界

### 1.1 核心目标

1. 将节点配置默认路径从“文本/JSON 输入”改为“可视化操作优先”。
2. 将节点配置时的关键错误（字段名拼错、类型不匹配、表达式写错）前置到编辑阶段。
3. 在不破坏现有 DSL 兼容性的前提下完成渐进式升级。

### 1.2 非目标（本轮不做）

1. 不重构工作流执行引擎。
2. 不变更现有 DSL 的核心结构（`nodes/edges/config/runtimePolicy`）。
3. 不移除专家模式 JSON，仅下沉到低频入口。

---

## 2. 当前节点属性面板问题（聚焦现状）

参考现有实现：

- `apps/web/src/features/workflow-studio/canvas/PropertyPanel.tsx`
- `apps/web/src/features/workflow-studio/canvas/ExpressionEditor.tsx`
- `apps/web/src/features/workflow-studio/canvas/VariableSelector.tsx`
- `apps/web/src/features/workflow-studio/canvas/node-forms/*.tsx`

### 2.1 关键痛点

1. 输入映射仍偏“表达式输入框”心智，视觉引导不足。
2. 参数覆盖采用 `key/value` 行编辑，缺少类型感知和参数字典约束。
3. 运行时策略暴露毫秒、重试等工程参数，业务含义弱。
4. 节点配置在通用兜底场景仍回落到 Key-Value/JSON 文本编辑。
5. 连线条件与节点入参校验反馈割裂，用户难形成闭环。

### 2.2 可复用资产（减少重复建设）

以下组件已具备可视化能力，应优先复用到节点面板：

- `StructuredPromptBuilder.tsx`
- `OutputSchemaBuilder.tsx`
- `VisualGuardrailsBuilder.tsx`
- `VisualToolPolicyBuilder.tsx`

---

## 3. 设计原则（全面可视化）

1. 可见即可配：有配置必有控件，不要求记忆字段名。
2. 直接操作优先：拖拽、选择、开关、滑块优先于文本输入。
3. 约束即引导：控件与后端元数据联动，减少无效输入。
4. 渐进披露：业务视图默认简化，增强/专家视图承载高级能力。
5. 即时反馈：配置时实时显示类型校验、数据来源、影响范围。

---

## 4. 节点属性面板 V2 信息架构

将右侧面板重构为 5 个可视化分区（Tab/分段均可）：

1. `概览`：节点名称、状态、节点模板、说明。
2. `输入`：可视化字段映射、默认值、空值策略、来源血缘。
3. `能力`：节点业务能力配置（Prompt、输出结构、工具、防护等）。
4. `运行`：运行策略预设卡、性能/稳定性滑块、错误路由。
5. `校验与预览`：实时校验清单、样例输入试跑、输出预览。

> `源码(JSON)` 仅在专家视图显示，入口位于“更多操作”。

---

## 5. 核心改进建议（本轮新增）

### 5.1 输入映射：从表达式输入升级为“映射画布”

1. 每个入参展示为一行卡片：字段名、类型、必填标记、说明。
2. 值来源改为三选一控件：`上游字段` / `常量` / `表达式(高级)`。
3. 选择 `上游字段` 时使用级联树（节点->字段）+ 类型兼容提示。
4. 增加“批量自动映射”按钮：按同名字段自动绑定并标记差异。
5. 每行支持“空值策略胶囊按钮”：报错 / 默认 / 跳过。

建议落地文件：

- 新增 `apps/web/src/features/workflow-studio/canvas/property-panel/InputMappingMatrix.tsx`
- 替换 `PropertyPanel.tsx` 中输入映射段落。

### 5.2 参数覆盖：从 Key-Value 改为“参数字典绑定”

1. 覆盖项来源于参数中心字典（编码、类型、默认值、描述）。
2. 选择参数后按类型渲染控件（数字、布尔、枚举、JSON 对象编辑器）。
3. 提供“继承差异视图”：显示节点覆盖与流程默认值对比。
4. 禁止重复 key，提交前做冲突检查与缺失项检查。

建议落地文件：

- 新增 `apps/web/src/features/workflow-studio/canvas/property-panel/ParameterOverrideBuilder.tsx`
- 对接 `workflow-parameter-center` 查询接口。

### 5.3 节点能力配置：复用 Agent Center 可视化组件

针对 `single-agent`、`judge-agent`、`debate-round` 等智能体节点：

1. Prompt 配置接入 `StructuredPromptBuilder`。
2. 输出结构接入 `OutputSchemaBuilder`。
3. 安全规则接入 `VisualGuardrailsBuilder`。
4. 工具策略接入 `VisualToolPolicyBuilder`。

建议落地文件：

- 更新 `apps/web/src/features/workflow-studio/canvas/node-forms/SingleAgentForm.tsx`
- 更新 `apps/web/src/features/workflow-studio/canvas/node-forms/JudgeAgentForm.tsx`
- 在 `formRegistry.ts` 中注册增强版表单。

### 5.4 运行策略：从工程参数改为“业务语义预设”

1. 预设卡片改为业务语言：`低延迟` / `标准` / `高可靠`。
2. 展示预设效果摘要：预计耗时、重试强度、失败处理方式。
3. 自定义模式保留高级参数，但默认折叠。
4. 增加“风险提示”：例如高重试会放大调用成本。

建议落地文件：

- `apps/web/src/features/workflow-studio/canvas/PropertyPanel.tsx`

### 5.5 校验闭环：配置即校验

1. 面板底部实时展示字段级校验（类型不兼容、必填缺失、引用无效）。
2. 错误项支持“定位并修复”（点击跳到对应字段）。
3. 提供样例输入试跑（不落库），预览该节点输出结构。

建议联动：

- 前端 `graphValidation.ts`
- 后端 `workflow-dsl-validator.ts`

---

## 6. 任务拆解（可直接建需求单）

### 6.1 前端任务（P0）

1. 重构 `PropertyPanel.tsx` 为分区化容器（概览/输入/能力/运行/校验）。
2. 新建 `InputMappingMatrix`，完成字段映射三模式与批量自动映射。
3. 新建 `ParameterOverrideBuilder`，支持参数字典驱动的类型化编辑。
4. SingleAgent/JudgeAgent 表单接入结构化 Prompt、输出结构、Guardrails、工具策略组件。
5. 保留 JSON 专家入口，但默认隐藏到“更多操作”。

### 6.2 后端任务（P0）

1. 提供节点表单元数据接口（字段类型、必填、枚举、说明、默认值）。
2. 提供参数字典查询接口（供覆盖项绑定）。
3. 提供字段映射校验接口（可复用 DSL validator 能力，返回字段级错误）。

### 6.3 前后端联调任务（P1）

1. 统一字段类型枚举（string/number/boolean/object/array）。
2. 统一错误码与错误定位信息（字段路径 + 节点 ID）。
3. 补充 UI telemetry（映射成功率、配置耗时、回退 JSON 比例）。

### 6.4 测试任务（P1）

1. 单测：映射逻辑、参数覆盖类型转换、预设切换一致性。
2. 组件测试：核心表单交互和错误提示渲染。
3. E2E：从新建节点到可运行流程的完整配置路径。

---

## 7. 里程碑计划（建议 3 个迭代）

### Iteration 1（1 周）基础框架

1. PropertyPanel 分区化改造。
2. 输入映射矩阵（上游字段/常量模式）。
3. 运行策略业务预设卡。

### Iteration 2（1 周）能力面板可视化

1. 接入结构化 Prompt 与输出结构定义。
2. 接入可视化 Guardrails/ToolPolicy。
3. 参数覆盖字典化编辑器。

### Iteration 3（1 周）校验与闭环

1. 实时字段校验和错误定位。
2. 样例输入试跑与输出预览。
3. 指标埋点与体验验收。

---

## 8. 验收标准（Definition of Done）

### 8.1 功能验收

1. 业务视图下，用户完成常见节点配置无需手写 JSON。
2. 输入映射支持上游字段选择、常量输入、表达式高级模式。
3. 参数覆盖支持类型化控件，不允许重复参数编码。
4. 智能体节点支持结构化 Prompt 与可视化输出结构。

### 8.2 体验验收

1. 新用户完成单节点配置时间较现状下降 40% 以上。
2. 首次配置过程中的字段错误率下降 50% 以上。
3. 进入 JSON 模式的会话占比低于 15%。

### 8.3 质量验收

1. `pnpm lint`、`pnpm type-check` 全量通过。
2. 关键交互 E2E 用例通过。
3. 旧 DSL 加载/编辑/保存无回归。

---

## 9. 风险与应对

1. 风险：节点类型多导致表单建设成本高。
   应对：优先覆盖高频节点，低频节点暂用 schema-driven 通用表单。
2. 风险：可视化与 DSL 序列化不一致。
   应对：建立双向快照测试（UI state <-> DSL）。
3. 风险：功能增加导致面板过重。
   应对：按视图等级渐进展示，并做懒加载。

---

## 10. 立即执行清单（本周）

1. 产出 `PropertyPanel V2` 交互稿与组件树。
2. 建立 P0 需求单（前端 5 项、后端 3 项、联调 3 项）。
3. 先在 `single-agent` 节点做端到端试点，跑通可视化配置全链路。
4. 通过试点数据复盘后，再扩展到 `judge-agent` 与 `debate-round`。

---

## 11. 落地进度快照（截至 2026-02-17）

### 11.1 已完成（前三批）

1. 属性面板分区化（概览/输入/能力/运行/校验）。
2. 输入映射矩阵（上游字段/常量/表达式 + 自动映射 + 空值策略）。
3. 参数覆盖字典化编辑器（类型化控件 + 模式切换）。
4. 智能体节点能力表单可视化增强（Single/Judge/Debate）。
5. 后端 `preview-node` 接口与前端试跑面板联调（样例输入 -> 节点预览）。

### 11.2 本次补充（第三批增强）

1. 节点试跑返回字段级类型信息：`actualType`、`typeCompatible`。
2. 预览面板支持自动试跑（防抖触发）与最近试跑时间提示。
3. 校验结果拆分为“节点问题 + 全局问题”两类展示。
4. 预览表格支持“定位”操作，快速回跳到输入映射页签。
5. 预览端接入执行引擎变量解析器，支持 `{{scope.path}}`、`{{...| default: ...}}` 的真实求值，并对纯数字算术表达式做即时计算。
6. 增加 UI telemetry 事件埋点（试跑触发、成功/失败、自动开关、定位点击）。
7. 新增 `preview-node` API e2e 用例（覆盖表达式求值、默认值回退、无法解析与不支持表达式场景）。
8. 预览面板新增“试跑埋点统计（当前浏览器）”可视化摘要，支持汇总抽屉查看全节点统计、JSON 导出与一键清空。
9. 画布工具栏新增“埋点”全局入口，支持时间范围过滤（24h/7d/30d/全部）与失败原因分组。
10. 总览支持失败原因点击筛选节点，并支持一键清空全部节点埋点统计。
11. 总览新增失败率 Top N 节点摘要，并支持从汇总面板一键定位到画布节点。

### 11.3 第三批收口建议

1. 补齐前端自动化测试：预览面板组件交互测试（当前环境无法安装 Vitest/Testing Library 依赖，待网络与包源恢复后接入）。

### 11.4 本次补充（第四批增强）

1. 全局埋点总览支持实时刷新：抽屉打开后自动监听试跑埋点事件，无需手动刷新即可看到统计变化。
2. 总览筛选增强：增加“一键重置筛选”与“当前筛选标签”可视化展示，支持按维度快速取消筛选。
3. 失败原因分析增强：在失败原因标签筛选基础上，新增失败原因占比可视化进度条，便于快速识别主要失败来源。
4. 总览明细表增强：支持分页与字段排序（节点、触发/成功/失败、成功率、更新时间），提升大规模节点排查效率。
5. 节点定位增强：支持“行点击定位 + 按钮定位”双入口，并记录定位埋点，形成从统计到画布的闭环操作。
6. 节点内“统计汇总”抽屉与全局面板体验对齐：补齐时间范围/关键词/失败原因/仅当前节点筛选、实时刷新、分页排序与导出携带筛选上下文。
7. 节点内“统计汇总”抽屉已打通画布定位：支持行点击/按钮双入口定位任意节点，便于在局部调试场景下直接跳转修复。
8. 全局埋点总览新增失败趋势图（按快照更新时间日聚合），并与现有筛选联动，支持快速观察失败变化趋势与主因分布。

## 12. 附：建议优先改造文件清单

- `apps/web/src/features/workflow-studio/canvas/PropertyPanel.tsx`
- `apps/web/src/features/workflow-studio/canvas/ExpressionEditor.tsx`
- `apps/web/src/features/workflow-studio/canvas/VariableSelector.tsx`
- `apps/web/src/features/workflow-studio/canvas/node-forms/SingleAgentForm.tsx`
- `apps/web/src/features/workflow-studio/canvas/node-forms/JudgeAgentForm.tsx`
- `apps/web/src/features/workflow-studio/canvas/node-forms/formRegistry.ts`
- `apps/web/src/features/workflow-studio/canvas/nodeTypeRegistry.ts`
- `apps/api/src/modules/workflow-definition/workflow-dsl-validator.ts`
