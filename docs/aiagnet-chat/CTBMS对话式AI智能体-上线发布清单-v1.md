# CTBMS 对话式 AI 智能体上线发布清单 v1.0

## 1. 发布目标

- 确保对话式 Agent 核心链路可用：
  - 多轮会话
  - 计划确认与执行
  - 结果查询
  - 导出与邮件投递

## 2. 发布前检查

### 2.1 代码与测试

在仓库根目录执行：

```bash
pnpm agent:pre-release
```

通过标准：

1. `@packages/types` 构建通过。
2. `prisma db push` 成功。
3. `workflow:type-check:split` 全通过。
4. `test:e2e:agent-suite` 全通过。

### 2.2 环境变量

必需项：

1. `DATABASE_URL`

建议项：

1. `MAIL_DELIVERY_WEBHOOK_URL`（启用邮件投递）
2. `WORKFLOW_AGENT_STRICT_MODE`（严格模式）
3. AI 相关密钥（按当前模型供应商配置）

### 2.3 数据库检查

1. 确认存在以下表：
   - `ConversationSession`
   - `ConversationTurn`
   - `ConversationPlan`
2. 确认 `ExportTask` 表可正常读写。

## 3. 发布开关策略

建议按阶段开启：

1. 先开对话主入口（仅内部用户）。
2. 再开辩论能力。
3. 最后开邮件交付能力。

推荐开关：

1. `AGENT_COPILOT_ENABLED`
2. `AGENT_DEBATE_ENABLED`
3. `AGENT_DELIVERY_EMAIL_ENABLED`

## 4. 上线后冒烟验证

### 4.1 主链路冒烟

1. 新建会话。
2. 发送普通分析问题。
3. 确认计划并执行。
4. 查询结果，确认有 `facts/analysis/actions`。

### 4.2 导出与投递冒烟

1. 触发导出（PDF/JSON 任一）。
2. 检查下载链接可访问。
3. 触发邮件投递，确认状态为 `SENT` 或返回可诊断错误码。

### 4.3 辩论冒烟

1. 发送辩论类问题。
2. 确认生成 `DEBATE_PLAN`。
3. 执行后检查存在辩论节点执行记录。

## 5. 监控与告警

重点观测：

1. `CONV_EXECUTION_TRIGGER_FAILED` 出现频率。
2. `CONV_EXPORT_TASK_NOT_READY` 与 `CONV_EXPORT_TASK_NOT_FOUND` 比例。
3. 邮件投递失败率。
4. 对话执行耗时 P95。

## 6. 回滚策略

### 6.1 快速回滚（推荐）

1. 关闭 `AGENT_COPILOT_ENABLED`。
2. 如有必要同步关闭辩论与邮件开关。
3. 保留数据表，不做破坏性回滚。

### 6.2 服务降级

1. 保留会话查询能力。
2. 暂停 `plan/confirm` 与 `deliver/email` 出口。
3. 给前端统一提示“系统维护中”。

## 7. 发布记录模板

- 发布版本：
- 发布时间：
- 发布人：
- 开启开关：
- 冒烟结果：
- 已知问题：
- 回滚记录（如有）：
