这是一份严格的**垂直切片开发流程规约 (Vertical Slice Rules)**。

请将其保存为 **`WORKFLOW_RULES.md`**。这将是我们后续开发每一个新功能（Feature）时必须严格遵守的"施工图纸"。

---

# 🍰 Antigravity Vertical Slice Development Rules

> **Core Philosophy**: **"Don't build layers, build features."**
> 我们不横向开发（比如一次性写完所有数据库表），而是纵向切片。每一个切片（Slice）都是一个完整的功能单元，从数据库到底层 UI，开发完即可交付验证。

## 🚫 黄金法则 (The Golden Rule)
**Strict Type Sharing**: 后端 DTO 和前端 Interface **严禁**手动重复定义。必须且只能通过 `packages/types` 共享。如果后端改了字段，前端必须在编译时报错。

---

## 🏗️ 架构原则 (Architecture Principles)

### 高内聚低耦合 (High Cohesion, Low Coupling)

1.  **全局 PrismaModule (`apps/api/src/prisma/`)**:
    *   统一管理数据库连接，使用 `@Global()` 装饰器。
    *   所有模块通过依赖注入使用 `PrismaService`，**禁止**直接 `new PrismaClient()`。

2.  **一个功能 = 一个模块**:
    *   每个业务功能应拆分为独立模块（如 `market-category/`, `market-tag/`）。
    *   **禁止**将多个不相关功能塞入同一个模块。

3.  **模块结构标准**:
    ```
    apps/api/src/modules/<module-name>/
    ├── dto/
    │   ├── index.ts
    │   ├── create-xxx.dto.ts
    │   └── update-xxx.dto.ts
    ├── xxx.controller.ts
    ├── xxx.service.ts
    ├── xxx.module.ts
    └── index.ts
    ```

4.  **模块导出规范**:
    *   每个模块应有 `index.ts` 导出公共 API。
    *   如果其他模块需要某 Service，必须在 Module 的 `exports` 中声明。

---

## Phase 1: 💎 定义事实来源 (Define Source of Truth)

在写任何业务逻辑代码之前，先定义数据结构。

1.  **Database Schema (`apps/api`)**:
    *   修改 `prisma/schema.prisma`。
    *   运行 Migration: `pnpm --filter api db:migrate`。
2.  **Shared Types (`packages/types`)**:
    *   在 `packages/types/src` 中新建或更新 Zod Schema。
    *   **Input**: 定义 Request DTO (e.g., `CreateUserSchema`).
    *   **Output**: 定义 Response Model (e.g., `UserResponseSchema`).
    *   导出 TS 类型: `export type CreateUserDto = z.infer<typeof CreateUserSchema>;`
    *   运行 Build: `pnpm --filter types build`。

> **Definition of Done**: 运行 `pnpm build` 无报错，且 `node_modules` 中能看到最新的类型定义。

---

## Phase 2: ⚙️ 后端核心实现 (Backend Core)

利用 Phase 1 定义的类型构建 API。

1.  **创建模块目录**:
    *   在 `apps/api/src/modules/` 下创建新模块目录。
    *   创建 `dto/`, `index.ts`, `*.module.ts`, `*.service.ts`, `*.controller.ts`。

2.  **DTO Classes (`dto/`)**:
    *   使用 `createZodDto` 封装 Schema：
        ```typescript
        import { CreateUserSchema } from '@packages/types';
        import { createZodDto } from 'nestjs-zod';
        
        export class CreateUserRequest extends createZodDto(CreateUserSchema) { }
        ```
    *   创建 `dto/index.ts` 导出所有 DTO 类。

3.  **Service Layer**:
    *   注入 `PrismaService`（来自全局 PrismaModule）。
    *   实现业务逻辑，入参出参使用 Shared Types。
        ```typescript
        constructor(private prisma: PrismaService) { }
        ```

4.  **Controller Layer**:
    *   **禁止业务逻辑**: Controller 只负责接收请求、调用 Service、返回结果。
    *   **Validation**: 全局 `ZodValidationPipe` 自动校验 DTO 类参数。
        ```typescript
        @Post()
        create(@Body() dto: CreateUserRequest) {
            return this.service.create(dto);
        }
        ```

5.  **Module 注册**:
    *   在 `*.module.ts` 中注册 Controller 和 Service。
    *   在 `app.module.ts` 中导入新模块。

> **Definition of Done**: 使用 Swagger 或 Postman 调用接口，数据能正确写入数据库且校验逻辑生效。

---

## Phase 3: 🌉 前端契约与钩子 (The Bridge)

在画 UI 之前，先打通数据管道。

1.  **API Client (`apps/web/src/api`)**:
    *   编写 Axios 请求函数。
    *   **泛型约束**: `axios.post<UserResponse>('/users', data)`。这里的类型来自 `packages/types`。
2.  **React Query Hooks (`apps/web/src/features/*/api`)**:
    *   封装 `useQuery` (读) 和 `useMutation` (写)。
    *   处理 `onSuccess` (如：创建成功后自动刷新列表)。

> **Definition of Done**: 在控制台调用 Hook 或简单打印，能获取到后端数据。

---

## Phase 4: 🎨 UI 实现与交互 (UI Realization)

最后一步，画界面。

1.  **Components**:
    *   使用 Ant Design 组件构建界面。
    *   遵循 **Responsive Rules** (移动端适配)。
2.  **Integration**:
    *   将 Phase 3 的 Hooks 绑定到组件上。
    *   **Loading State**: 必须处理 `isLoading` / `isPending` 状态。
    *   **Error Handling**: 必须处理 `isError` 状态。

> **Definition of Done**: 界面可交互，能在浏览器中完成完整的业务流程。

---

## 📝 垂直切片检查清单 (Slice Checklist)

每个功能分支合并前，请自检：

- [ ] **Architecture**: 模块是否独立？是否注入了 `PrismaService`？
- [ ] **Schema**: `packages/types` 已更新且 build 成功？
- [ ] **Backend**: API 能正常工作，且对非法输入返回了 400 错误？
- [ ] **Frontend Bridge**: Request/Response 类型是否直接引用了共享包？
- [ ] **UI/UX**: Loading 状态有了吗？手机端看了一眼吗？
- [ ] **Clean Code**: 没有 `any` 类型，没有 console.log 残留。

---

**End of Workflow Rules.**