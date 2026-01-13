# 样式指南与约定

## 1. 通用规范

- **格式化**: Prettier 是唯一的真理。
  - 单引号 (Single quotes)。
  - 尾随逗号 (Trailing commas)。
- **命名规范**:
  - **文件名**: `kebab-case.ts` (例如: `user-profile.ts`)。
  - **React 组件**: `PascalCase.tsx` (例如: `UserProfile.tsx`)。
  - **类 (Classes)**: `PascalCase` (例如: `UserService`)。
  - **变量/函数**: `camelCase` (例如: `fetchUserData`)。
  - **常量**: `UPPER_SNAKE_CASE` (例如: `MAX_RETRY_COUNT`)。

## 2. 前端 (React)

### 2.1 项目结构 (参考 Feature-Sliced Design)
```
src/
  features/        # 领域特定功能 (例如: auth, dashboard)
    components/    # 功能作用域组件
    hooks/         # 功能作用域 Hooks
    api/           # 功能作用域 API 调用
  components/      # 共享/哑 UI 组件 (按钮, 布局)
  hooks/           # 共享 Hooks
  utils/           # 共享工具函数
```

### 2.2 组件模式
- **函数式组件**: 使用 `const Component = () => {}` 语法。
- **Props**: 解构 Props。定义严格的 Interfaces。
- **导出**: 优先使用命名导出 (Named Exports) 而非默认导出，以便于重构和自动导入。

### 2.3 样式 (CSS)
- **Ant Design**: 使用 Token System `themeConfig` 配置全局样式。
- **覆盖样式**: 必要时使用 `createStyles` (antd-style) 或 CSS Modules。避免行内样式 (Inline Styles)。
- **Tailwind**: 如启用，需遵守 Utility Class 排序规范 (prettier-plugin-tailwindcss)。

## 3. 后端 (NestJS)

### 3.1 结构
- **Modules**: 将相关逻辑 (Controller, Service, Entity) 组织进 Modules。
- **DTOs**: 所有输入必须有严格的 Zod DTOs。例如 `create-user.dto.ts`。
- **Entities**: 与数据库 Schema 保持一致。

### 3.2 逻辑流
- **Controller**: 路由处理, DTO 校验, HTTP 响应映射。
- **Service**: 业务逻辑。通过 Prisma 调用数据库。
- **Repository/Prisma**: 直接数据库访问 (如果逻辑复杂可抽象一层)。

## 4. 测试
- **单元测试**: `.spec.ts` 与源文件同级放置。
- **E2E 测试**: 统一放在 `test/` 目录。
