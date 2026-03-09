# CTBMS 对话式 AI 智能体文档索引 v1.0

## 1. 产品与范围

1. 产品需求文档（PRD）：`docs/aiagnet-chat/CTBMS对话式AI智能体-产品需求文档-PRD-v1.md`
2. 对话原生产品蓝图（v2）：`docs/aiagnet-chat/CTBMS对话原生智能体-产品蓝图-v2.md`
3. 自由对话万能助手产品设计（v1）：`docs/aiagnet-chat/CTBMS自由对话万能助手-产品设计-v1.md`
4. 自由对话改造升级落地计划（v1）：`docs/aiagnet-chat/CTBMS自由对话智能助手-改造升级落地计划-v1.md`
5. 对话产品文档治理与落地执行计划（v1）：`docs/aiagnet-chat/CTBMS对话产品文档治理与落地执行计划-v1.md`
6. 对话能力-功能菜单路由映射表（v1）：`docs/aiagnet-chat/CTBMS对话能力-功能菜单路由映射表-v1.md`
7. 对话主线周检清单（v1）：`docs/aiagnet-chat/CTBMS对话主线周检清单-v1.md`
8. 对话主线 E2E 门禁用例（v1）：`docs/aiagnet-chat/CTBMS对话主线E2E门禁用例-v1.md`
9. 对话主线周检记录（2026-03-06）：`docs/aiagnet-chat/CTBMS对话主线周检清单-2026-03-06.md`
10. 对话主线执行看板（US-503/504/601/602）：`docs/aiagnet-chat/CTBMS对话主线执行看板-US503-602-2026-03-06.md`
11. 对话主线 US-504 UI 验收脚本：`docs/aiagnet-chat/CTBMS对话主线US-504-UI验收脚本-v1.md`
12. 对话主线 US-504 UI 验收记录（2026-03-06）：`docs/aiagnet-chat/CTBMS对话主线US-504-UI验收记录-2026-03-06.md`
13. 开发启动清单：`docs/aiagnet-chat/CTBMS对话式AI智能体-开发启动清单-v1.md`
14. 上线发布清单：`docs/aiagnet-chat/CTBMS对话式AI智能体-上线发布清单-v1.md`

## 2. 技术设计

1. 技术设计说明（TDD）：`docs/aiagnet-chat/CTBMS对话式AI智能体-技术设计说明-TDD-v1.md`
2. 接口字段规范（API）：`docs/aiagnet-chat/CTBMS对话式AI智能体-接口字段定义-API规范-v1.md`
3. 数据表草案（Prisma DDL）：`docs/aiagnet-chat/CTBMS对话式AI智能体-数据表设计草案-PrismaDDL-v1.md`
4. 前端状态流与页面结构：`docs/aiagnet-chat/CTBMS对话式AI智能体-前端状态流与页面结构-v1.md`
5. 自由对话施工标准与规范（v1）：`docs/aiagnet-chat/CTBMS自由对话万能助手-施工标准与规范-v1.md`
6. 自由对话施工任务分解 WBS（v1）：`docs/aiagnet-chat/CTBMS自由对话万能助手-施工任务分解-WBS-v1.md`

## 2.1 底座标准

1. 底座标准总览（v1）：`docs/aiagnet-chat/CTBMS自由对话万能助手-底座标准总览-v1.md`
2. 工作流标准（v1）：`docs/aiagnet-chat/CTBMS自由对话万能助手-底座标准-工作流-v1.md`
3. Skills 标准（v1）：`docs/aiagnet-chat/CTBMS自由对话万能助手-底座标准-Skills-v1.md`
4. 参数与规则标准（v1）：`docs/aiagnet-chat/CTBMS自由对话万能助手-底座标准-参数与规则-v1.md`
5. 数据源标准（v1）：`docs/aiagnet-chat/CTBMS自由对话万能助手-底座标准-数据源-v1.md`
6. 风控标准（v1）：`docs/aiagnet-chat/CTBMS自由对话万能助手-底座标准-风控-v1.md`
7. 输出与交付标准（v1）：`docs/aiagnet-chat/CTBMS自由对话万能助手-底座标准-输出与交付-v1.md`
8. 质量与治理标准（v1）：`docs/aiagnet-chat/CTBMS自由对话万能助手-底座标准-质量与治理-v1.md`

## 3. 质量与治理

1. 错误码规范：`docs/aiagnet-chat/CTBMS对话式AI智能体-错误码规范-v1.md`
2. 对话原生 UAT 自动验收报告：`docs/aiagnet-chat/CTBMS对话原生智能体-UAT自动验收报告-v2.md`
3. 监控与告警基线：`docs/aiagnet-chat/CTBMS对话原生智能体-监控与告警基线-v2.md`
4. 灰度与回滚演练记录：`docs/aiagnet-chat/CTBMS对话原生智能体-灰度与回滚演练记录-v2.md`
5. 上线门禁总结：`docs/aiagnet-chat/CTBMS对话原生智能体-上线门禁总结-v2.md`

## 4. 当前实现状态（摘要）

1. 会话主链路：已落地（sessions/turns/plan/confirm/result）
2. 辩论链路：已落地（DEBATE_PLAN + e2e）
3. 导出与邮件链路：已落地（export + deliver/email + e2e）
4. 前端对话页：已落地（`/workflow/copilot`）
5. 一键预发布验收：已落地（`pnpm agent:pre-release`）

## 5. 推荐阅读顺序

1. PRD
2. 对话产品文档治理与落地执行计划（v1）
3. 对话能力-功能菜单路由映射表（v1）
4. 对话原生产品蓝图（v2）
5. 自由对话万能助手产品设计（v1）
6. 自由对话改造升级落地计划（v1）
7. 自由对话施工标准与规范（v1）
8. 自由对话施工任务分解 WBS（v1）
9. 底座标准总览（v1）
10. 工作流/Skills/参数规则/数据源/风控/输出治理标准（v1）
11. TDD
12. API 规范
13. 对话主线周检清单（v1）
14. 对话主线周检记录（最新）
15. 对话主线 E2E 门禁用例（v1）
16. 对话主线执行看板（US-503/504/601/602）
17. 对话主线 US-504 UI 验收脚本
18. 对话主线 US-504 UI 验收记录（最新）
19. 开发启动清单
20. 错误码规范
21. 上线发布清单
