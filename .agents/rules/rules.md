---
trigger: always_on
---

# 🏛️ Antigravity Engineering Guidelines
> **Project**: Enterprise Full-Stack System
> **Tech Stack**: Turborepo, pnpm, React (Ant Design), NestJS, Prisma
> **Version**: 2.0.0 (Strict Enforcement)

本文件定义了本项目的工程标准。在代码审查（Code Review）中，任何违反本规约的代码都将被拒绝合并。

---

## 1. 核心架构原则 (Core Architecture)

### 1.1 单一事实来源 (Single Source of Truth)
- **类型定义**: 所有跨端的数据结构（User, Order等）必须在 `packages/types` 中定义。前端和后端只能引用，不能各自为战。
- **数据库**: `schema.prisma` 是数据库结构的唯一真理。禁止手动修改数据库表结构。
- **设计风格**: 前端 UI 的所有颜色、间距、字号必须来源于 `themeConfig.ts` 中的 Ant Design Token。

### 1.2 高内聚低耦合 (High Cohesion, Low Coupling)
- **一个功能 = 一个模块**: 禁止将多个不相关功能塞入同一个模块。
- **模块间通信**: 通过 `exports` 暴露 Service，禁止直接导入其他模块的内部文件。
- **全局基础设施**: PrismaModule 等基础设施模块放在 `src/` 根目录，不属于业务模块目录。

### 1.3 依赖管理 (Dependency Management)
- **包管理器**: **严格强制使用 `pnpm`**。
- **依赖安装**:
  - 全局/开发依赖: `pnpm add -w -D <pkg>`
  - 前端依赖: `pnpm --filter web add <pkg>`
  - 后端依赖: `pnpm --filter api add <pkg>`
- **版本控制**: `package.json` 中的依赖版本号必须固定（移除 `^` 或 `~` 前缀），确保所有环境构建一致。

---

## 2. 目录结构规范 (Directory Structure)

### 2.1 结构总览
```text
/
├── apps
│   ├── web (Frontend Application)
│   └── api (Backend Application)
└── packages
    ├── types (Shared Zod Schemas & TS Interfaces)
    ├── tsconfig (Base TS Configurations)
    └── utils (Shared Pure Functions)
```

### 2.2 前端结构 (apps/web) - Feature-Based
采用 **功能模块化 (Feature-based)** 结构，将业务逻辑高内聚。

- **`src/features/`**: 核心业务目录。每个子目录代表一个业务领域（如 `auth`, `users`）。
  - `components/`: 该功能专用的 UI 组件。
  - `api/`: 该功能的 API 请求定义。
  - `hooks/`: 该功能的自定义 Hooks。
  - `routes/`: 该功能的路由定义。
- **`src/components/`**: 仅存放**非业务**的通用 UI 组件（如封装好的 `CopyButton`, `Loader`）。
- **`src/theme/`**: 存放 Ant Design 的 `themeConfig` 和全局样式重置。

### 2.3 后端结构 (apps/api) - Modular
遵循 NestJS 官方模块化标准。

- **`src/modules/`**: 业务模块目录（如 `AuthModule`, `UserModule`）。
  - `*.controller.ts`: 处理路由和 DTO 转换。
  - `*.service.ts`: 核心业务逻辑。
  - `*.module.ts`: 依赖注入配置。
- **`src/common/`**: 全局守卫、拦截器、过滤器、装饰器。

---

## 3. 前端开发规范 (Ant Design System)

### 3.1 样式与主题 (Styling) - **Zero CSS Policy**
为了维护长期的可维护性，我们执行 **"零 CSS"** 策略（特殊情况除外）。

1.  **禁止硬编码颜色**:
    *   ❌ `color: '#1890ff'`
    *   ✅ `const { token } = theme.useToken(); color: token.colorPrimary`
2.  **布局组件优先**:
    *   使用 `<Flex>`, `<Space>`, `<Row/Col>`, `<Divider>` 代替手写 `margin/padding`。
    *   示例: `<Flex gap="small" vertical>...</Flex>` 代替 `display: flex; flex-direction: column; gap: 8px;`。
3.  **样式覆盖**:
    *   如果必须覆盖 AntD 组件样式，优先使用 `ConfigProvider` 的 `componentToken`。
    *   如果必须写 CSS，仅允许使用 **CSS Modules** 或 **Emotion (CSS-in-JS)**，严禁全局 CSS。

### 3.2 组件构建 (Component Design)
1.  **ProComponents 强制令**:
    *   **管理后台场景**必须优先使用 Ant Design Pro Components。
    *   表格: `ProTable` (禁止手写 Filter/Pagination 逻辑)。
    *   表单: `ProForm`, `ModalForm`, `DrawerForm`。
    *   详情: `ProDescriptions`。
2.  **逻辑抽离 (Headless)**:
    *   UI 组件（`.tsx`）原则上只负责渲染。
    *   一旦组件代码超过 150 行，必须将状态管理、数据请求、事件处理抽离到 `use[Feature]ViewModel.ts` 中。

### 3.3 状态管理 (State Management)
1.  **服务器状态 (Server State)**:
    *   必须使用 **TanStack Query (React Query)**。
    *   禁止在组件内使用 `useEffect` + `fetch/axios` 手动管理加载状态。
2.  **客户端全局状态 (Client State)**:
    *   使用 **Zustand**。
    *   仅用于存放“全局 UI 状态”（如 Sidebar 折叠）或“跨页面会话数据”。

---

## 4. 后端开发规范 (NestJS)

### 4.1 架构分层职责
1.  **Controller**: "交通警察"。只负责接收 HTTP 请求，验证 DTO，调用 Service，返回结果。**禁止包含任何业务判断（if/else）**。
2.  **Service**: "业务核心"。负责业务逻辑计算、调用数据库、调用第三方服务。
3.  **Repository/Prisma**: "数据存取"。禁止在 Controller 层直接调用 Prisma。

### 4.2 数据验证 (Validation)
1.  **Zod 驱动**:
    *   所有 DTO (Data Transfer Object) 必须定义在 `packages/types` 中，使用 Zod Schema。
    *   后端使用 `ZodValidationPipe` 进行运行时校验。
2.  **显式返回**:
    *   Service 和 Controller 的方法必须显式声明 TS 返回类型，禁止隐式推导。

### 4.3 错误处理
*   禁止使用 `console.log` 处理错误。
*   必须抛出 NestJS 内置的 HTTP 异常 (e.g., `new BadRequestException('...')`)。
*   使用全局 `AllExceptionsFilter` 统一捕获并格式化错误响应。

### 4.4 全局模块 (Global Modules)
*   **PrismaModule**:
    *   放在 `src/prisma/` 而非业务模块目录
    *   使用 `@Global()` 装饰器，全局可用
    *   所有 Service 通过依赖注入使用 [PrismaService]
    *   ❌ 禁止 `new PrismaClient()` 或直接导入 `PrismaClient`

### 4.5 模块结构规范
每个业务模块必须遵循以下结构：
```text
<module-name>/
├── dto/
│   ├── index.ts
│   ├── create-xxx.dto.ts
│   └── update-xxx.dto.ts
├── xxx.controller.ts
├── xxx.service.ts
├── xxx.module.ts
└── index.ts

---

## 5. 代码质量与命名规范 (Coding Standards)

### 5.1 命名约定
| 对象 | 命名风格 | 示例 |
| :--- | :--- | :--- |
| **React 组件文件** | PascalCase | `UserProfile.tsx` |
| **NestJS 文件** | kebab-case | `user-profile.controller.ts` |
| **变量/函数** | camelCase | `getUserData`, `isLoading` |
| **常量** | UPPER_SNAKE_CASE | `MAX_RETRY_LIMIT` |
| **Zod Schema** | PascalCase + Schema | `UserLoginSchema` |
| **Type/Interface** | PascalCase | `UserLoginRequest` |

### 5.2 TypeScript 严格规约
1.  **No Any**: 全局禁止使用 `any`。如果遇到极其复杂的类型体操，必须使用 `unknown` 并配合类型守卫（Type Guard），或者添加 `// eslint-disable-next-line @typescript-eslint/no-explicit-any` 并附带解释。
2.  **非空断言**: 慎用 `!`。仅在 100% 确定该值存在的上下文中（如刚刚校验过）使用。

### 5.3 注释
*   **自文档化代码**优于注释。如果代码逻辑复杂到需要大量注释，请重构代码。
*   **JSDoc**: 仅对公共 util 函数、复杂的业务逻辑方法强制要求 JSDoc 注释。