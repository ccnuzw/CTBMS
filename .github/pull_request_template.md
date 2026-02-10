## Summary

<!-- 说明这次改动做了什么、为什么做 -->

## Related Issue

<!-- 关联需求/缺陷/任务编号，没有可写 N/A -->

## Scope

- [ ] `apps/api`
- [ ] `apps/web`
- [ ] `packages/types`
- [ ] `docs`

## Checklist

- [ ] 已执行 `pnpm lint`
- [ ] 已执行 `pnpm type-check`
- [ ] 涉及工作流执行/筛选/风控逻辑时，已执行 `pnpm workflow:smoke`
- [ ] 涉及工作流筛选组合逻辑变更时，已执行 `pnpm workflow:smoke:extended`
- [ ] 涉及工作流筛选 API 契约变更时，已执行 `pnpm workflow:smoke:gate`
- [ ] 涉及 `risk-gate` 规则契约变更时，已执行 `pnpm workflow:risk-gate:contract:smoke`
- [ ] 涉及 `risk-gate` 执行性能路径变更时，已执行 `pnpm workflow:perf:risk-gate:gate`
- [ ] 涉及工作流门禁脚本/CI 变更时，已执行 `pnpm workflow:reports:validate`
- [ ] 涉及历史风控摘要修复时，已执行 `pnpm workflow:backfill:risk-summary:dry-run`
- [ ] 已补充或更新相关测试（单测/集成/冒烟）
- [ ] 已更新文档（若行为、命令或运维流程发生变化）

## Verification

<!-- 粘贴本地或 CI 关键命令与结果摘要 -->

## Screenshots / Recording

<!-- UI 改动请附截图或录屏，没有可写 N/A -->
