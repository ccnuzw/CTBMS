# CTBMS 对话式 AI 智能体文档索引 v1.0

## 1. 产品与范围

1. 产品需求文档（PRD）：`docs/aiagnet-chat/CTBMS对话式AI智能体-产品需求文档-PRD-v1.md`
2. 对话原生产品蓝图（v2）：`docs/aiagnet-chat/CTBMS对话原生智能体-产品蓝图-v2.md`
3. 开发启动清单：`docs/aiagnet-chat/CTBMS对话式AI智能体-开发启动清单-v1.md`
4. 上线发布清单：`docs/aiagnet-chat/CTBMS对话式AI智能体-上线发布清单-v1.md`

## 2. 技术设计

1. 技术设计说明（TDD）：`docs/aiagnet-chat/CTBMS对话式AI智能体-技术设计说明-TDD-v1.md`
2. 接口字段规范（API）：`docs/aiagnet-chat/CTBMS对话式AI智能体-接口字段定义-API规范-v1.md`
3. 数据表草案（Prisma DDL）：`docs/aiagnet-chat/CTBMS对话式AI智能体-数据表设计草案-PrismaDDL-v1.md`
4. 前端状态流与页面结构：`docs/aiagnet-chat/CTBMS对话式AI智能体-前端状态流与页面结构-v1.md`

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
2. TDD
3. API 规范
4. 开发启动清单
5. 错误码规范
6. 上线发布清单
