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

### 3.4 订阅

- `CONV_SUB_PLAN_NOT_FOUND`：未找到可订阅计划（400）
- `CONV_SUB_NOT_FOUND`：订阅不存在或无权限访问（404）

### 3.5 回测

- `CONV_BACKTEST_EXECUTION_NOT_FOUND`：未找到可回测执行实例（400）
- `CONV_BACKTEST_NOT_FOUND`：回测任务不存在或无权限访问（404）
- `CONV_BACKTEST_RUN_FAILED`：回测执行失败（400）

## 4. 前端映射策略

- 优先使用 `code` 映射中文提示，确保稳定。
- 若 `code` 未识别，展示后端 `message`。
- 若 `message` 不可用，展示页面兜底提示。

## 5. 迭代建议

- 下一阶段补充：
  - 冲突消解错误码（`CONV_CONFLICT_*`）
