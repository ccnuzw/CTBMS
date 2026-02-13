# 工作流发布 Definition of Launch 验收模板

## 1. 发布基本信息

- 发布日期：
- 发布环境：
- 发布负责人：
- 目标分支/提交：
- 回滚负责人：

## 2. 模式与使用方式覆盖

- [ ] `LINEAR` 至少 1 条流程在目标环境可运行并可回放
- [ ] `DAG` 至少 1 条流程在目标环境可运行并可回放
- [ ] `DEBATE` 至少 1 条流程在目标环境可运行并可回放
- [ ] `HEADLESS` 配置可用
- [ ] `COPILOT` 配置可用
- [ ] `ON_DEMAND` 配置可用

## 3. 治理与追溯

- [ ] 参数/规则/Agent/流程版本化发布能力可用
- [ ] 发布审计记录可查询（含发布人、发布时间、版本）
- [ ] 执行实例可追溯到 workflowVersion
- [ ] 用户隔离越权回归通过

## 4. 质量门禁

- [ ] `pnpm workflow:smoke:gate` 通过
- [ ] `pnpm workflow:quality:gate` 通过
- [ ] `pnpm workflow:reports:validate` 通过
- [ ] `pnpm workflow:execution:baseline:gate` 通过
- [ ] `pnpm workflow:execution:baseline:report:validate` 通过

## 5. SLA 与性能

- [ ] `ON_DEMAND` P95 <= 30s（附报告路径）
- [ ] 线性执行成功率 >= 99%
- [ ] DAG 执行成功率 >= 98%
- [ ] 回放可用率 >= 99.5%

报告路径：

- smoke 报告：
- quality gate 报告：
- execution baseline 报告：
- execution baseline validation 报告：
- execution baseline trend 报告：

## 6. Debate 导出与证据链

- [ ] Debate 结果可导出 PDF/Word
- [ ] 证据链包含：原文片段、指标快照、规则命中
- [ ] 风险阻断/降级字段在回放中可见

## 7. 灰度与止损

- [ ] A/B 实验配置可执行
- [ ] 自动止损阈值生效（默认 `badCaseThreshold=0.2`）
- [ ] 失败实验可快速下线并保留审计轨迹

## 8. 回滚演练

- [ ] 已执行 `pnpm workflow:drill:rollback:verify`
- [ ] 回滚后 smoke 通过
- [ ] 回滚后 baseline 趋势未异常漂移
- [ ] 回滚 RTO 记录完成

## 9. 上线结论

- 验收结论：`READY_TO_PROMOTE` / `BLOCKED`
- 阻塞项（如有）：
- 放量策略：
- 观察窗口与告警人：
