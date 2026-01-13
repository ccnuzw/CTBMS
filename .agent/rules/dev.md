---
trigger: always_on
---

# 🍰 Antigravity Vertical Slice Development Rules

> **完整规约请参见项目根目录 [WORKFLOW_RULES.md](cci:7://file:///Users/mac/Progame/CTBMS/WORKFLOW_RULES.md:0:0-0:0)**

## 🚫 黄金法则 (The Golden Rule)
**Strict Type Sharing**: 后端 DTO 和前端 Interface **严禁**手动重复定义。必须且只能通过 `packages/types` 共享。

## 🏗️ 架构核心原则

1.  **全局 PrismaModule** (`src/prisma/`): 使用 `@Global()` 装饰器，统一管理数据库连接。
2.  **一个功能 = 一个模块**: 禁止将多个不相关功能塞入同一个模块。
3.  **DTO 使用 createZodDto**: 基于 `packages/types` 的 Zod Schema 创建。
4.  **Service 注入 PrismaService**: 禁止直接 `new PrismaClient()`。

## 📋 开发流程

1.  **Phase 1**: 定义 Prisma Schema + 共享 Zod Types
2.  **Phase 2**: 后端模块 (dto/ + service + controller + module)
3.  **Phase 3**: 前端 API Hooks (React Query)
4.  **Phase 4**: UI 组件 (Ant Design)

---

**End of Dev Rules. 详细规约见 `WORKFLOW_RULES.md`。**