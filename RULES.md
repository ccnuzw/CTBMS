# 工程规约与指南

> "代码被阅读的次数远多于被编写的次数。"

## 1. 架构与结构

### 1.1 Monorepo 策略
- **工具链**: Turborepo + pnpm workspaces。
- **严格边界**:
  - `apps/*`: 可执行应用程序（可部署）。
  - `packages/*`: 共享库（可发布/内部使用）。
- **依赖流向**: Apps 依赖 Packages。Packages **严禁**依赖 Apps。

### 1.2 技术栈
- **前端**: React 18, Vite, Ant Design 5, Zustand, TanStack Query。
- **后端**: NestJS, Prisma, Postgres, Zod。
- **语言**: TypeScript (必须开启 Strict Mode)。

## 2. Git 工作流

- **分支策略**:
  - `main`: 生产就绪代码 (Production-ready)。
  - `dev`: 集成开发分支。
  - `feat/xxx`: 独立功能分支。
  - `fix/xxx`: Bug 修复分支。
- **提交信息**: 遵循 Conventional Commits 规范。
  - `feat: add user login` (新增功能)
  - `fix: resolve hydration error` (修复 Bug)
  - `chore: update dependencies` (杂项/依赖)
  - `refactor: simplify auth logic` (重构)

## 3. 编码规范

### 3.1 TypeScript
- **严禁 `any`**: 使用 `unknown` 或具体类型。仅在绝对必要时使用 `// @ts-expect-error`（极少情况）。
- **严格空值检查**: 必须开启。显式处理 `null` 和 `undefined`。
- **Interfaces vs Types**: 对象/形状优先使用 `interface`（可扩展），联合类型/原始类型使用 `type`。但在本项目中，为了保持一致性，也可统一偏好 `type`。

### 3.2 错误处理
- **后端**: 使用全局过滤器 (Global Filters)。不要在 Controller 中随意使用 try-catch；除非需要特定恢复逻辑，否则让异常冒泡到过滤器。
- **前端**: 使用 Error Boundaries 和 Query 特定的错误处理机制。

### 3.3 状态管理 (前端)
- **服务端状态**: 使用 TanStack Query。**严禁**将 API 数据放入全局 Store (Zustand/Redux)。
- **客户端状态**: 使用 Zustand 管理 UI 状态（模态框、主题、复杂的过滤器）。
- **表单状态**: 使用 React Hook Form 或 AntD Form。

## 4. 性能与安全
- **懒加载**: 默认按路由进行代码分割 (Code Splitting)。
- **数据清洗**: 所有输入在处理前必须经过校验 (Zod)。
- **机密信息**: **严禁**提交 `.env` 文件。

## 5. 审查与质量
- **自我审查**: 开发者在请求 Review 前必须先自我审查 PR。
- **CI 检查**: Lint, Test, 和 Build 必须全部通过。

## 6. 前端可访问性与弹窗焦点
- **Modal/ModalForm 必须自动聚焦**: 统一使用 `useModalAutoFocus` 处理弹窗打开后的焦点转移，避免 `aria-hidden` 警告。
- **首字段标记**: 在弹窗表单内给首个输入添加 `fieldProps={autoFocusFieldProps}`，并将表单内容包在 `div ref={containerRef}` 下。
- **特定控件聚焦**: 若需要聚焦到特定控件（如 `Select`），使用 `focusRef` 直接绑定到该控件。
- **避免禁用聚焦**: 不要随意设置 `autoFocusFirstInput={false}`，除非有明确原因。
