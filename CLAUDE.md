# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Engineering Guidelines
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

Engineering Rules

> **Version**: 3.0.0 (Monorepo Standard)
> **Enforcement**: Strict. Violations will result in rejected PRs.

## 1. 🏗️ 技术栈清单 (Tech Stack)

所有开发活动必须限制在以下技术范围内。

| 领域 | 核心技术 | 关键库/工具 | 版本/备注 |
| :--- | :--- | :--- | :--- |
| **Monorepo** | **Turborepo** | `pnpm` (Workspace) | **强制 pnpm** |
| **Language** | **TypeScript** | Strict Mode | v5.0+ |
| **Frontend** | **React** | Vite, React Router 6 | v18+ |
| **UI System** | **Ant Design 5** | **ProComponents** (Table/Form) | Token-based styling |
| **State (FE)** | **TanStack Query** | Zustand (Client Global) | v5+ |
| **Backend** | **NestJS** | Express, RxJS | v10+ |
| **Database** | **PostgreSQL** | **Prisma ORM** | Latest |
| **Validation** | **Zod** | `zod`, `nestjs-zod` | Unified Schema |

---

## 2. 🗺️ 项目目录结构 (Directory Structure)

我们采用 **Monorepo** 结构。前端采用 **Feature-based** 架构，后端采用 **Modular** 架构。

```text
/
├── apps
│   ├── web  (Frontend: React + Vite)
│   │   ├── src
│   │   │   ├── components      # 🧩 通用原子组件 (Button, Input封装)
│   │   │   ├── features        # 📦 业务模块 (核心架构)
│   │   │   │   └── [feature]   # e.g., "auth", "users"
│   │   │   │       ├── api.ts          # 该模块的 React-Query hooks
│   │   │   │       ├── components/     # 该模块独有的 UI 组件
│   │   │   │       ├── routes/         # 该模块的路由定义
│   │   │   │       └── types.ts        # 仅限前端使用的类型
│   │   │   ├── hooks           # 🪝 通用 Hooks (useDebounce, etc.)
│   │   │   ├── layouts         # 🖼️ 全局布局 (Sidebar, Header)
│   │   │   ├── providers       # 🛡️ React Context Providers
│   │   │   ├── routes          # 🚦 路由入口
│   │   │   └── theme           # 🎨 Ant Design Token 配置 (themeConfig.ts)
│   │   └── package.json
│   │
│   └── api  (Backend: NestJS)
│       ├── src
│       │   ├── common          # 🌐 全局守卫, 拦截器, 过滤器
│       │   ├── config          # ⚙️ 环境变量配置
│       │   ├── prisma          # 💾 全局 PrismaModule (@Global)
│       │   │   ├── prisma.module.ts
│       │   │   ├── prisma.service.ts
│       │   │   └── index.ts
│       │   ├── modules         # 🧱 业务模块 (一个功能 = 一个模块)
│       │   │   └── [module]    # e.g., "users", "market-category"
│       │   │       ├── dto/            # 使用 createZodDto 封装
│       │   │       ├── *.controller.ts # 路由处理
│       │   │       ├── *.service.ts    # 业务逻辑
│       │   │       ├── *.module.ts     # 依赖注入
│       │   │       └── index.ts        # 模块导出
│       │   └── main.ts         # 入口文件
│       ├── prisma              # Prisma Schema 目录
│       │   └── schema.prisma
│       └── package.json
│
├── packages
│   ├── types                   # 🤝【核心】前后端共享的 Zod Schemas & TS Types
│   ├── tsconfig                # 🛠️ 共享 TS 配置
│   └── eslint-config           # 🧹 共享 Lint 配置
│
├── package.json (Root)
└── pnpm-workspace.yaml
---

## 3. 🛡️ 全局开发法则 (Global Rules)

### 3.1 依赖管理
*   **PM**: 严禁使用 `npm` 或 `yarn`。**必须使用 `pnpm`**。
*   **安装**:
    *   根目录/工具库: `pnpm add -w -D <pkg>`
    *   前端: `pnpm --filter web add <pkg>`
    *   后端: `pnpm --filter api add <pkg>`
*   **无隐式依赖**: 所有使用的包必须在对应的 `package.json` 中显式声明。

### 3.2 TypeScript 铁律
*   **No Any**: 严禁使用 `any`。使用 `unknown` 或具体的 Interface。
*   **单一事实来源**:
    *   所有跨端数据结构（User, Product, Order）必须在 `packages/types` 中定义。
    *   后端负责定义 Zod Schema，导出 TypeScript 类型给前端使用。

---

## 4. 🖥️ 前端法则 (Frontend: apps/web)

### 4.1 样式与 UI (The "No CSS" Rule)
*   **Token 优先**: 严禁硬编码颜色（如 `#1890ff`）。必须使用 `theme.useToken()`。
*   **布局组件**: 使用 `<Flex>`, `<Space>`, `<Row>`, `<Col>` 代替 CSS 布局。
*   **禁止全局 CSS**: 仅允许在 `App.css` 中重置极少量的基础样式。组件样式必须通过 `style={{ ... }}` (配合 Token) 或 `emotion`/`css-modules` 解决。

### 4.2 组件构建
*   **ProComponents**:
    *   管理后台的**表格**必须用 `ProTable`。
    *   管理后台的**表单**必须用 `ProForm` / `ModalForm` / `DrawerForm`。
    *   禁止手写 Filter, Pagination, Loading 逻辑。
*   **Feature-Sliced**: 业务组件必须放在 `src/features/<feature-name>` 下，不要把所有东西都堆在全局 `components` 里。

### 4.3 数据获取
*   **TanStack Query**:
    *   ❌ 禁止在 useEffect 中手动 fetch 数据。
    *   ✅ 必须封装为 Custom Hook (e.g., `useUserList`) 使用 `useQuery` 或 `useMutation`。

---

## 5. ⚙️ 后端法则 (Backend: apps/api)

### 5.1 架构分层
*   **Controller**:
    *   ❌ **禁止业务逻辑**。
    *   ✅ 仅负责：验证 DTO -> 调用 Service -> 返回结果。
*   **Service**:
    *   ✅ 负责所有业务判断、数据库交互、异常抛出。
*   **Prisma**:
    *   ❌ 禁止在 Controller 层直接调用 `prisma.*`。

### 5.2 验证 (Validation)
*   **Zod DTO**:
    *   所有 Controller 的 Payload 必须通过 Zod Schema 验证（使用 `nestjs-zod`）。
    *   Schema 尽量复用 `packages/types` 中的定义。

### 5.3 错误处理
*   **HttpException**:
    *   必须抛出 NestJS 标准异常 (e.g., `new BadRequestException('Invalid ID')`)。
    *   ❌ 禁止 `console.log` 错误后不做处理。

### 5.4 模块拆分原则
*   **高内聚**: 一个模块只负责一个业务领域。
*   **低耦合**: 模块间通过 `exports` 暴露 Service，禁止直接导入其他模块的内部文件。
*   **PrismaModule 特例**: 作为全局基础设施，放在 `src/prisma/` 而非 `src/modules/`。

示例：
*   ✅ `market-category/`, `market-tag/`, `market-info/` (分开)
*   ❌ `market-info/` 包含 category + tag + info (合并)
---

## 6. 📝 命名规范 (Naming Convention)

| 类型 | 规则 | 示例 |
| :--- | :--- | :--- |
| **React 组件文件** | PascalCase | `UserProfile.tsx` |
| **NestJS 文件** | kebab-case | `auth.controller.ts` |
| **普通 TS 文件** | camelCase | `dateUtils.ts` |
| **目录 (React)** | camelCase | `features/auth` |
| **变量/函数** | camelCase | `getUserInfo` |
| **Interface/Type** | PascalCase | `UserResponse` |

---

遵守此规则是代码合并的前提。

Project Style Guide

> **Scope**: Code Formatting, Naming Conventions, UI Design Tokens
> **Tools**: Prettier, ESLint, Ant Design Token System
> **Enforcement**: `husky` (pre-commit) & IDE Save Actions

## 1. 🤖 自动化格式化 (Automated Formatting)

我们不通过人工审查缩进或分号。所有格式化问题由 **Prettier** 解决。

### 1.1 Prettier 配置 (`.prettierrc`)
项目根目录必须包含以下配置，这是**绝对标准**：

```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "quoteProps": "as-needed",
  "jsxSingleQuote": false,
  "trailingComma": "all",
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

### 1.2 Import 排序 (Import Sorting)
为了保持文件头部整洁，必须遵循以下 Import 顺序（通过 `eslint-plugin-simple-import-sort` 强制）：

1.  **React / NestJS 核心库** (`react`, `@nestjs/*`)
2.  **第三方库** (`lodash`, `axios`, `antd`)
3.  **内部 Monorepo 包** (`@repo/types`, `@repo/utils`)
4.  **项目绝对路径引用** (`@/features`, `@/components`)
5.  **父级/同级相对路径** (`../`, `./`)
6.  **样式/资源文件** (`./styles.css`, `.png`)

---

## 2. 🔠 命名与语义规约 (Naming & Semantics)

命名必须精确、无歧义，并且能反映变量的内容。

### 2.1 文件与目录命名
| 实体 | 格式 | 示例 | 规则说明 |
| :--- | :--- | :--- | :--- |
| **React 组件** | PascalCase | `SubmitButton.tsx` | 与组件名保持一致 |
| **Hook** | camelCase | `useAuth.ts` | 必须以 `use` 开头 |
| **NestJS 类文件** | kebab-case | `auth.controller.ts` | `<name>.<type>.ts` |
| **普通工具函数** | camelCase | `formatDate.ts` | |
| **常量文件** | camelCase | `appConstants.ts` | |

### 2.2 代码标识符命名
*   **Boolean 变量**: 必须加前缀。
    *   ✅ `isLoading`, `hasError`, `canSubmit`, `shouldRetry`
    *   ❌ `loading`, `error`, `submit` (这些像名词)
*   **常量**: 全大写，下划线分隔。
    *   ✅ `MAX_RETRY_COUNT = 3`
*   **接口/类型 (Interface/Type)**:
    *   使用 `PascalCase`。
    *   ❌ **禁止**使用 `I` 前缀 (如 `IUser` 是过时的写法，直接用 `User`)。
    *   Props 定义命名为：`<ComponentName>Props` (e.g., `ButtonProps`)。

---

## 3. 💅 UI 视觉设计规约 (Visual Design System)

本项目执行 **Design-Token-First** 策略。我们不写硬编码的 CSS，我们使用 Ant Design 的 Design Token。

### 3.1 🚫 魔法数值 (Magic Numbers)
代码中严禁出现无解释的数字或颜色代码。

*   **颜色**:
    *   ❌ `color: '#F5222D'`
    *   ✅ `color: token.colorError` (从 `theme.useToken()` 获取)
*   **间距 (Spacing)**:
    *   遵循 **8px 栅格系统**。
    *   ❌ `margin: 13px`
    *   ✅ `margin: 16px` (或者使用 `<Space size="middle" />`)
*   **圆角 (Radius)**:
    *   ✅ `borderRadius: token.borderRadiusLG`

### 3.2 布局 (Layout)
*   **Flexbox 优先**:
    *   优先使用 Ant Design 的 `<Flex>` 或 `<Space>` 组件进行一维布局。
    *   优先使用 `<Row>` / `<Col>` 进行二维网格布局。
*   **间距控制**:
    *   使用 `gap` 属性控制元素间距，而不是给每个子元素加 `margin-right`。

### 3.3 样式写法优先级
当必须自定义样式时，优先级如下：

1.  **Ant Design Props**: `<Space align="center">`
2.  **Design Tokens (CSS-in-JS)**: `const { token } = theme.useToken(); <div style={{ color: token.colorPrimary }}>`
3.  **CSS Modules (极少使用)**: `.module.css` (仅限于复杂的动画或伪类操作)
4.  **Inline Style (禁止)**: `style={{ marginTop: 20 }}` (除非用于动态计算的坐标)

---

## 4. 🧱 组件代码结构 (Component Structure)

React 组件文件的内部代码顺序必须保持一致，以便于阅读。

```typescript
// 1. Imports
import { useState } from 'react';
import { theme } from 'antd';
// ...

// 2. Types/Interfaces
interface UserCardProps {
  name: string;
  active?: boolean;
}

// 3. Component Definition
export const UserCard = ({ name, active = false }: UserCardProps) => {
  // 3.1 Hooks (Theme, Router, Redux, etc.)
  const { token } = theme.useToken();

  // 3.2 State (useState)
  const [expanded, setExpanded] = useState(false);

  // 3.3 Queries (React Query)
  const { data } = useUserQuery();

  // 3.4 Derived State (useMemo)
  const highlightColor = useMemo(() => active ? token.colorPrimary : token.colorText, [active, token]);

  // 3.5 Effects (useEffect) - try to minimize usage

  // 3.6 Event Handlers
  const handleClick = () => setExpanded(!expanded);

  // 3.7 Render
  return (
    <div style={{ borderColor: highlightColor }} onClick={handleClick}>
      {name}
    </div>
  );
};
```

---

## 5. 📝 注释规约 (Comments)

*   **原则**: 代码应当自解释。如果代码需要大量注释，说明代码写得烂。
*   **When to comment**:
    *   **WHY**: 解释“为什么”要这么写（特别是奇怪的逻辑或 workaround）。
    *   **Complex Regex**: 必须解释正则表达式的用途。
*   **JSDoc**:
    *   `packages/utils` 下的公共函数**必须**包含 JSDoc（描述参数、返回值、示例）。
    *   组件的 Props 如果含义模糊，必须加注释。

---

**End of Style Guide.**

Vertical Slice Development Rules

Vertical Slice Development Rules

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

Responsive Design Rules

> **Core Philosophy**:  **"Configuration over Media Queries"**.
> 我们优先使用 Ant Design 的 Grid 系统和 JS Hooks 处理响应式，尽量减少手写 `@media` CSS 代码。

## 1. 📐 断点标准 (Breakpoints Truth)

严禁在 CSS 中发明自定义的断点像素值（如 `768px`, `480px`）。
必须严格遵循 Ant Design 的标准断点系统：

| Breakpoint | Pixel Range | Device Category | 行为描述 |
| :--- | :--- | :--- | :--- |
| **xs** | `< 576px` | **Mobile (Portrait)** | 单列布局，隐藏次要信息，汉堡菜单 |
| **sm** | `≥ 576px` | **Mobile (Landscape)** | 宽松的单列布局 |
| **md** | `≥ 768px` | **Tablet** | 双列/混合布局，Sidebar 可折叠 |
| **lg** | `≥ 992px` | **Desktop** | 标准 Dashboard 布局 |
| **xl** | `≥ 1200px` | **Wide Desktop** | 内容居中或更宽的展示区 |
| **xxl** | `≥ 1600px` | **Large Screen** | 高密度信息展示 |

---

## 2. 🧩 布局策略 (Layout Strategy)

### 2.1 Grid System First (栅格优先)
绝大多数布局问题应通过 `<Row>` 和 `<Col>` 的响应式属性解决，而不是写 CSS。

*   **❌ Bad (CSS Media Queries)**:
    ```css
    .my-card { width: 100%; }
    @media (min-width: 768px) { .my-card { width: 50%; } }
    ```

*   **✅ Good (AntD Grid)**:
    ```tsx
    <Row gutter={[16, 16]}>
      {/* 手机全宽(24)，平板半宽(12)，桌面1/3宽(8)，超大屏1/4宽(6) */}
      <Col xs={24} md={12} lg={8} xxl={6}>
        <Card>Content</Card>
      </Col>
    </Row>
    ```

### 2.2 间距响应式 (Responsive Gutter)
不要写死的 margin/padding。使用 `gutter` 数组或 `gap`。

*   **✅ Good**: `<Row gutter={[16, 24]}>` (水平间距 16px，垂直间距 24px)
*   **✅ Good**: `<Space direction="vertical" size={screens.md ? 'large' : 'small'}>`

---

## 3. ⚛️ 逻辑响应式 (Logic Adaptation)

对于布局结构发生根本变化的情况（例如：桌面端显示表格，移动端显示卡片列表），使用 **`useBreakpoint`** 钩子，而不是 CSS `display: none`。

> **Why?** CSS `display: none` 仍然会渲染 DOM，影响性能。JS 条件渲染更干净。

```tsx
import { Grid } from 'antd';

const MyComponent = () => {
  const screens = Grid.useBreakpoint(); // { md: true, lg: true, ... }

  // 还没挂载或计算完成前，避免布局抖动，可以给个默认值
  if (!screens.md) {
    // Mobile View: Show List
    return <MobileListView data={data} />;
  }

  // Desktop View: Show Table
  return <DesktopTableView data={data} />;
};
```

---

## 4. 📱 移动端交互细节 (Mobile UX Details)

### 4.1 触控区域 (Touch Targets)
移动端的点击目标（按钮、图标）必须足够大。
*   **最小高度**: `44px` (Apple Human Interface Guidelines)。
*   **Ant Design**: 在移动端视图下，尽量使用 `size="large"` 的 Input 和 Button，或者确保 Padding 足够。

### 4.2 表格处理 (Tables on Mobile)
**绝对禁止**在手机竖屏上强行展示横向滚动的宽表格。
*   **策略 A**: 隐藏非关键列 (`responsive: ['md']` in AntD Columns)。
*   **策略 B**: 转换为卡片视图 (Card View)。
*   **策略 C**: 使用 Ant Design ProTable 的 `cardProps` 属性。

### 4.3 抽屉与模态框 (Drawer vs Modal)
*   **Desktop**: 优先使用 `<Modal>` 处理表单/详情。
*   **Mobile**: 优先使用 `<Drawer height="80%">` (底部弹出的半屏浮层) 或全屏 Drawer。
    *   *Code Guideline*: 封装一个 `ResponsiveModal` 组件，根据 `screens.xs` 自动切换 Modal 或 Drawer。

---

## 5. 🎨 样式细节 (Styling nuances)

### 5.1 字体与排版
*   移动端标题应适当缩小，避免换行过多。
*   使用 Ant Design Token 的 `fontSizeHeading*` 系统，不要硬编码 px。

### 5.2 安全区域 (Safe Areas)
如果是做 PWA 或嵌入 WebView，必须考虑刘海屏和底部 Home Bar。

```css
/* Global CSS or Layout Container */
padding-top: env(safe-area-inset-top);
padding-bottom: env(safe-area-inset-bottom);
```

---

## 6. ✅ 响应式检查清单 (Checklist)

在提交代码前，必须进行以下测试：

1.  [ ] **缩放测试**: 浏览器宽度缩小到 `375px` (iPhone SE/X)，布局是否崩坏？
2.  [ ] **水平溢出**: 页面底部是否出现了非预期的横向滚动条？(通常是 `width: 100vw` 或固定 `width` 导致的)。
3.  [ ] **手指友好**: 按钮是否好点？是否会被误触？
4.  [ ] **键盘遮挡**: 在移动端输入时，Input 是否被软键盘遮挡？
5.  [ ] **Hover 态**: 确保不依赖 `:hover` 逻辑展示关键信息（手机没有 Hover）。

---

**End of Responsive Rules.**