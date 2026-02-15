# 工作流 Staging 演练记录模板

用于在发布前对工作流能力进行 staging 演练，并沉淀可复盘记录。

## 1. 演练基本信息

- 演练日期：
- 演练环境：staging
- 演练负责人：
- 参与人：
- 目标版本（commit/tag）：
- 演练窗口（开始~结束）：

## 2. 演练目标

1. 验证 workflow 主链路（定义/发布/执行/时间线/审计）可用。
2. 验证权限边界（触发人/owner/outsider）符合预期。
3. 验证质量门禁与基线报告可稳定输出。
4. 验证回滚流程可在规定时间内完成。

## 3. 演练前准备检查

1. staging 数据库可用，迁移状态正常。
2. staging 已部署待演练版本。
3. 值班沟通群已建立并明确回滚负责人。
4. 历史稳定版本可快速切换。

## 4. 预检查命令（建议顺序执行）

```bash
pnpm workflow:drill:staging:precheck
```

说明：该命令串行执行 `type-check`、`workflow:smoke:gate`、`workflow:execution:baseline:gate`、`workflow:execution:baseline:report:validate`、`workflow:execution:baseline:reference(ensure)`、`workflow:execution:baseline:trend(require-reference)`、`workflow:execution:baseline:reference(promote)`。

若本机存在 turbo/keychain 环境问题，可使用不依赖 turbo 的快通道命令：

```bash
pnpm workflow:drill:staging:precheck:fast
```

如需执行“预检 + 回滚验收”整套演练：

```bash
pnpm workflow:drill:staging:full
```

说明：该命令会额外生成并校验以下产物：
1. `logs/workflow-ci-step-summary.md`
2. `logs/workflow-ci-step-summary-validation.json`
3. `logs/workflow-drill-staging-full-summary.md`
4. `logs/workflow-drill-staging-full-summary.json`
5. `logs/workflow-drill-staging-closeout.md`
6. `logs/workflow-drill-staging-closeout.json`

如需补录 CI 实跑证据并输出最终收口结论：

```bash
pnpm workflow:drill:staging:closeout -- --ci-run-url=<workflow-run-url> --ci-run-conclusion=SUCCESS --require-ci-run-url --require-ci-run-success
```

如需拆分执行：

```bash
pnpm type-check
pnpm workflow:smoke:gate
pnpm workflow:execution:baseline:gate -- --days=7 --report-file=../../logs/workflow-execution-baseline-staging-drill.json
pnpm workflow:execution:baseline:report:validate -- --report-file=logs/workflow-execution-baseline-staging-drill.json --summary-json-file=logs/workflow-execution-baseline-staging-drill-validation.json --require-gate-pass --require-gate-evaluated
pnpm workflow:execution:baseline:reference -- --mode=ensure --current-report=logs/workflow-execution-baseline-staging-drill.json --reference-report=logs/workflow-execution-baseline-reference.json --summary-json-file=logs/workflow-execution-baseline-reference-operation.json
pnpm workflow:execution:baseline:trend -- --current-report=logs/workflow-execution-baseline-staging-drill.json --reference-report=logs/workflow-execution-baseline-reference.json --summary-json-file=logs/workflow-execution-baseline-staging-trend.json --require-reference
pnpm workflow:execution:baseline:reference -- --mode=promote --current-report=logs/workflow-execution-baseline-staging-drill.json --reference-report=logs/workflow-execution-baseline-reference.json --summary-json-file=logs/workflow-execution-baseline-reference-operation.json
```

## 5. 演练步骤记录

### 5.1 功能链路演练

- [ ] 定义创建/版本发布成功
- [ ] 发布审计查询正确
- [ ] 执行触发成功
- [ ] timeline 查询与筛选正确
- [ ] 失败分类筛选正确（TIMEOUT/CANCELED/EXECUTOR）

记录：

```md
- case:
- 输入：
- 期望：
- 实际：
- 结论：通过 / 失败
```

### 5.2 权限边界演练

- [ ] outsider 不可取消 owner 执行
- [ ] outsider 不可重跑 owner 失败实例
- [ ] outsider 不可查看 owner 执行详情/时间线
- [ ] owner 可查看并管理自身流程执行

### 5.3 指标与门禁演练

- [ ] `workflow:execution:baseline:gate` 产出报告
- [ ] `workflow:execution:baseline:report:validate` 产出 validation 报告
- [ ] `workflow:execution:baseline:reference -- --mode=ensure/promote` 产出 reference operation 报告
- [ ] `workflow:execution:baseline:trend` 产出趋势对比报告（有参考基线时可判定回归）
- [ ] 报告字段完整（rates/latency/gate）
- [ ] CI Step Summary 包含 `Workflow Execution Baseline`、`Workflow Execution Baseline Validation`、`Workflow Execution Baseline Reference Operation`、`Workflow Execution Baseline Trend` 区块
- [ ] `workflow:ci:step-summary:validate` 校验通过（`missingSections=0`）
- [ ] `workflow:drill:staging:full:summary` 状态为 `SUCCESS`
- [ ] `workflow:drill:staging:closeout` 状态为 `SUCCESS` 且 `Release Decision=READY_TO_PROMOTE`

## 6. 回滚演练记录（必填）

执行命令：

```bash
git checkout <last-stable-tag-or-commit>
docker compose -f docker-compose-full.yml up -d --build
pnpm workflow:drill:rollback:verify
```

记录模板：

```md
- 回滚开始时间：
- 回滚完成时间：
- RTO（分钟）：
- 回滚后 smoke：通过 / 失败
- 回滚后 baseline 报告：
- 回滚后 successRate：
- 回滚后 failedRate：
- 回滚后 timeoutRate：
- 回滚结论：通过 / 失败
```

## 7. 问题与改进项

```md
1. 问题：
   - 影响范围：
   - 根因判断：
   - 临时措施：
   - 长期修复：
   - 负责人：
   - 计划完成日期：
```

## 8. 演练结论

- 是否满足上线条件：是 / 否
- 若“否”，阻塞项：
- 下次复演计划日期：
