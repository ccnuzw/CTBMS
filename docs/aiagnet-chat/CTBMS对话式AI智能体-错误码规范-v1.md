# CTBMS 对话式 AI 智能体错误码规范 v1.0

## 1. 目标

- 前后端统一使用 `code + message` 返回错误。
- 前端优先根据 `code` 做稳定提示，`message` 作为兜底展示。

## 2. 返回格式

```json
{
  "statusCode": 400,
  "code": "CONV_PLAN_ID_MISMATCH",
  "message": "计划ID与版本不匹配，请刷新后重试"
}
```

## 3. 会话模块错误码

### 3.1 资源与权限

- `CONV_SESSION_NOT_FOUND`：会话不存在或无权限访问（404）
- `CONV_RESULT_NOT_FOUND`：会话结果不可见或执行实例不可见（404）

### 3.2 计划确认

- `CONV_PLAN_VERSION_NOT_FOUND`：计划版本不存在（400）
- `CONV_PLAN_ALREADY_CONFIRMED`：计划已确认执行（400）
- `CONV_PLAN_ID_MISMATCH`：计划ID与版本不匹配（400）
- `CONV_WORKFLOW_NOT_BINDABLE`：计划未绑定可执行流程（400）
- `CONV_EXECUTION_TRIGGER_FAILED`：执行触发失败（400）

### 3.3 导出与投递

- `CONV_EXPORT_EXECUTION_NOT_FOUND`：没有可导出的执行实例（400）
- `CONV_EXPORT_TASK_NOT_FOUND`：导出任务不存在或无权限访问（400）
- `CONV_EXPORT_TASK_NOT_READY`：导出任务尚未完成，不可投递邮件（400）
- `CONV_DELIVERY_TARGET_REQUIRED`：投递目标缺失（邮箱或渠道 target）（400）

### 3.4 订阅

- `CONV_SUB_PLAN_NOT_FOUND`：未找到可订阅计划（400）
- `CONV_SUB_NOT_FOUND`：订阅不存在或无权限访问（404）
- `CONV_SCHEDULE_SUB_NOT_FOUND`：自然语言调度时未找到可操作订阅（400）

### 3.5 回测

- `CONV_BACKTEST_EXECUTION_NOT_FOUND`：未找到可回测执行实例（400）
- `CONV_BACKTEST_NOT_FOUND`：回测任务不存在或无权限访问（404）
- `CONV_BACKTEST_RUN_FAILED`：回测执行失败（400）

### 3.6 Skill Draft

- `SKILL_DRAFT_NOT_FOUND`：Skill Draft 不存在或无权限访问（404）

### 3.7 资产复用

- `CONV_ASSET_NOT_FOUND`：会话资产不存在或无权限访问（404）

### 3.8 Runtime Grant

- `SKILL_RUNTIME_GRANT_NOT_FOUND`：运行时授权不存在或无权限访问（404）
- `SKILL_RUNTIME_GRANT_INACTIVE`：运行时授权已失效（400）
- `SKILL_RUNTIME_GRANT_EXPIRED`：运行时授权已过期（400）

### 3.9 Skill 审批治理

- `SKILL_REVIEWER_CONFLICT`：高风险草稿不能由创建者本人审批通过（400）
- `SKILL_HIGH_RISK_REVIEW_REQUIRED`：高风险草稿必须由非创建者审批后发布（400）

### 3.10 对话调度

- `CONV_SCHEDULE_SUB_NOT_FOUND`：自然语言调度未找到目标订阅（400）

## 4. 前端映射策略

- 优先使用 `code` 映射中文提示，确保稳定。
- 若 `code` 未识别，展示后端 `message`。
- 若 `message` 不可用，展示页面兜底提示。

## 5. 迭代建议

- 下一阶段补充：
  - 冲突消解错误码（`CONV_CONFLICT_*`）
