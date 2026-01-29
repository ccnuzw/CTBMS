
# ⚔️  Engineering Rules

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