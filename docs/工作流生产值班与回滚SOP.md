# 工作流生产值班与回滚 SOP

本 SOP 用于工作流能力上线后的值班排障、灰度观察与回滚执行。

## 1. 发布前检查清单

在发布窗口开始前逐项确认：

1. `main` 分支 CI 通过，且 `Workflow Smoke` 门禁为绿色。
2. 已执行：
   - `pnpm type-check`
   - `pnpm workflow:smoke:gate`
   - `pnpm workflow:execution:baseline:gate -- --days=7 --report-file=../../logs/workflow-execution-baseline-report.json`
   - `pnpm workflow:execution:baseline:report:validate -- --report-file=logs/workflow-execution-baseline-report.json --summary-json-file=logs/workflow-execution-baseline-validation.json --require-gate-pass --require-gate-evaluated`
   - `pnpm workflow:execution:baseline:reference -- --mode=ensure --current-report=logs/workflow-execution-baseline-report.json --reference-report=logs/workflow-execution-baseline-reference.json --summary-json-file=logs/workflow-execution-baseline-reference-operation.json`
   - `pnpm workflow:execution:baseline:trend -- --current-report=logs/workflow-execution-baseline-report.json --reference-report=logs/workflow-execution-baseline-reference.json --summary-json-file=logs/workflow-execution-baseline-trend.json --require-reference`
   - `pnpm workflow:execution:baseline:reference -- --mode=promote --current-report=logs/workflow-execution-baseline-report.json --reference-report=logs/workflow-execution-baseline-reference.json --summary-json-file=logs/workflow-execution-baseline-reference-operation.json`
   - `pnpm workflow:ci:step-summary -- --execution-baseline-report-file=logs/workflow-execution-baseline-report.json --execution-baseline-validation-file=logs/workflow-execution-baseline-validation.json --execution-baseline-reference-operation-file=logs/workflow-execution-baseline-reference-operation.json --execution-baseline-trend-file=logs/workflow-execution-baseline-trend.json > logs/workflow-ci-step-summary.md`
   - `pnpm workflow:ci:step-summary:validate -- --summary-file=logs/workflow-ci-step-summary.md --summary-json-file=logs/workflow-ci-step-summary-validation.json`
3. 数据库迁移已评审，确认采用前向修复策略，无手工回滚依赖。
4. 值班人、回滚负责人、业务通知群已明确。
5. 趋势阈值配置已确认：`config/workflow-execution-baseline-thresholds.json`（必要时再用 CLI 参数临时覆盖）。
6. 若本机 `pnpm type-check` 因 turbo/keychain 异常失败，改用：`pnpm workflow:drill:staging:precheck:fast`（分包 type-check 快通道）。

## 2. 灰度观察清单（发布后 30~60 分钟）

优先观察以下指标：

1. 执行成功率：`successRate`
2. 失败率：`failedRate`
3. 取消率：`canceledRate`
4. 超时率：`timeoutRate`
5. 延迟：`latencyMs.p95`

建议命令：

```bash
pnpm workflow:execution:baseline -- --days=1 --report-file=../../logs/workflow-execution-baseline-post-release.json
pnpm workflow:execution:baseline:report:validate -- --report-file=logs/workflow-execution-baseline-post-release.json --summary-json-file=logs/workflow-execution-baseline-post-release-validation.json --require-gate-evaluated
pnpm workflow:execution:baseline:reference -- --mode=ensure --current-report=logs/workflow-execution-baseline-post-release.json --reference-report=logs/workflow-execution-baseline-reference.json --summary-json-file=logs/workflow-execution-baseline-reference-operation.json
pnpm workflow:execution:baseline:trend -- --current-report=logs/workflow-execution-baseline-post-release.json --reference-report=logs/workflow-execution-baseline-reference.json --summary-json-file=logs/workflow-execution-baseline-post-release-trend.json --require-reference
```

判定建议：

1. 若 `timeoutRate`、`failedRate` 明显高于发布前基线，优先触发降级或回滚。
2. 若 `latencyMs.p95` 超阈值且持续 10 分钟以上，触发回滚评估。

## 3. 故障分级与动作

1. P0（大面积不可用）：
   - 立即回滚应用到上一个稳定版本。
   - 暂停新变更发布。
2. P1（核心链路显著退化）：
   - 先执行流量降级。
   - 同步进行回滚准备，15 分钟内无法恢复则回滚。
3. P2（可接受退化）：
   - 保持观察。
   - 通过前向修复补丁处理。

## 4. 回滚执行步骤

```bash
# 1) 切回稳定版本
git fetch --all --tags
git checkout <last-stable-tag-or-commit>

# 2) 重建并启动
docker compose -f docker-compose-full.yml up -d --build

# 3) 查看状态与日志
docker compose -f docker-compose-full.yml ps
docker compose -f docker-compose-full.yml logs -f --tail=200 api
```

数据库要求：

1. 不直接回退历史迁移文件。
2. 发现 schema 兼容问题时，采用 forward-fix 迁移补丁。
3. 用 `prisma migrate status` 确认状态一致。

## 5. 回滚后验收模板

按顺序执行：

```bash
pnpm workflow:drill:rollback:verify
```

若需执行“预检 + 回滚验收”整套演练：

```bash
pnpm workflow:drill:staging:full
```

演练结束后可查看总报告：

1. `logs/workflow-drill-staging-full-summary.md`
2. `logs/workflow-drill-staging-full-summary.json`
3. `logs/workflow-drill-staging-closeout.md`
4. `logs/workflow-drill-staging-closeout.json`

如需在上线前强制校验 CI 实跑证据（链接+结论）：

```bash
pnpm workflow:drill:staging:closeout -- --ci-run-url=<workflow-run-url> --ci-run-conclusion=SUCCESS --require-ci-run-url --require-ci-run-success
```

若需拆分执行：

```bash
pnpm workflow:smoke:gate
pnpm workflow:execution:baseline:gate -- --days=1 --report-file=../../logs/workflow-execution-baseline-post-rollback.json
pnpm workflow:execution:baseline:report:validate -- --report-file=logs/workflow-execution-baseline-post-rollback.json --summary-json-file=logs/workflow-execution-baseline-post-rollback-validation.json --require-gate-evaluated
pnpm workflow:execution:baseline:reference -- --mode=ensure --current-report=logs/workflow-execution-baseline-post-rollback.json --reference-report=logs/workflow-execution-baseline-reference.json --summary-json-file=logs/workflow-execution-baseline-reference-operation.json
pnpm workflow:execution:baseline:trend -- --current-report=logs/workflow-execution-baseline-post-rollback.json --reference-report=logs/workflow-execution-baseline-reference.json --summary-json-file=logs/workflow-execution-baseline-post-rollback-trend.json --require-reference
```

验收记录模板（可直接复制）：

```md
## 回滚验收记录

- 回滚时间：
- 回滚版本：
- 执行人：
- 复核人：
- workflow:smoke:gate：通过 / 失败
- 执行基线报告：logs/workflow-execution-baseline-post-rollback.json
- 基线校验报告：logs/workflow-execution-baseline-post-rollback-validation.json
- 基线趋势报告：logs/workflow-execution-baseline-post-rollback-trend.json
- successRate：
- failedRate：
- timeoutRate：
- latencyMs.p95：
- 结论：恢复完成 / 继续观察 / 需进一步处理
```

## 6. 交接模板（值班换班）

```md
## 工作流值班交接

- 交接时间：
- 交班人：
- 接班人：
- 当前状态：稳定 / 观察中 / 故障中
- 最近一次发布版本：
- 最近一次基线报告：
- 未完成事项：
  - [ ]
  - [ ]
- 风险提示：
  - [ ]
```
