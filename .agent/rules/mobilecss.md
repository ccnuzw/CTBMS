---
trigger: always_on
---

# 📱 Antigravity Responsive Design Rules

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