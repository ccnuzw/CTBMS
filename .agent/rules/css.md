---
trigger: always_on
---

# 🎨 Antigravity Project Style Guide

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