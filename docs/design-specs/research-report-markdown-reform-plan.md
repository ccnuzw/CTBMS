# 📄 智能研报 Markdown 改造实施方案 (纯净版)

## 1. 项目背景与目标
当前智能研报工作台使用 HTML 富文本存储内容。为彻底解决数据噪音和样式问题，将**全量重构**为 **Markdown** 格式。
**本方案不考虑对旧 HTML 数据的兼容**，旨在建立一个纯净的、AI 友好的研报系统。

### 核心目标
1.  **数据纯净**：研报内容仅支持 Markdown 格式，彻底摒弃 HTML 标签噪音。
2.  **重构升级**：前端编辑器和渲染引擎全量更新，不再保留旧版代码。
3.  **数据重置**：更新 Seed 数据源，确保所有初始数据均为标准 Markdown。
4.  **智能采集**：集成 PDF -> Markdown 转换链路。

---

## 2. 总体架构设计

### 2.1 业务流程变更
*   **录入端**：`Tiptap` 编辑器强制开启 Markdown 模式，仅输出 Markdown 文本。
*   **存储端**：数据库 `rawContent` 字段仅存储 Markdown 字符串。
*   **展示端**：`ResearchReportDetailPage` 仅使用 `MarkdownRenderer` 渲染，移除 `dangerouslySetInnerHTML`。
*   **初始化**：`prisma/seed` 脚本中的研报数据全部重写为 Markdown 格式。

### 2.2 核心技术栈
*   **编辑器**: `Tiptap` + `tiptap-markdown`。
*   **渲染器**: `react-markdown` + `remark-gfm` + `Ant Design Token`。
*   **PDF 解析**: `pdf-parse` + `LLM` (用于智能清洗)。

---

## 3. 详细实施步骤

### 阶段一：基础设施与数据重置 (Infrastructure & Seed)
1.  **依赖引入**
    *   前端：`tiptap-markdown`, `react-markdown`。
    *   后端：`pdf-parse`。
2.  **Seed 数据重构**
    *   修改 `apps/api/prisma/seed-research-reports.ts`。
    *   将所有预置的 HTML 研报内容替换为高质量的 Markdown 文本（包含标题、列表、表格）。

### 阶段二：前端全量重构 (Frontend Refactor)
1.  **编辑器升级 (`TiptapEditor`)**
    *   配置为 **Markdown Only** 模式。
    *   确保从 `value` 属性加载 Markdown，`onChange` 输出 Markdown。
2.  **研报创建页 (`ResearchReportCreatePage`)**
    *   适配新版编辑器。
    *   集成 "上传 PDF -> 自动填充 Markdown" 功能。
3.  **详情页重写 (`ResearchReportDetailPage`)**
    *   移除所有 HTML 渲染逻辑。
    *   实现 `MarkdownRenderer` 组件，定制 "Premium Design" 样式。

### 阶段三：后端服务 (Backend Service)
1.  **PDF 解析服务 (`PdfToMarkdownService`)**
    *   实现 PDF 文本提取与 AI 清洗接口。
2.  **清理旧逻辑**
    *   检查 Service 层是否有处理 HTML 字符串的残留逻辑，予以移除或简化。

---

## 4. 风险评估

| 风险点 | 应对策略 |
| :--- | :--- |
| **开发环境旧数据报错** | 告知开发者需运行 `pnpm db:reset` 重置数据库，因为旧 HTML 数据在新渲染器下可能显示源码或乱码。 |
| **PDF 表格还原度** | 依赖 LLM 的表格理解能力，提供编辑器内手动微调功能。 |

## 5. 预期成果
*   ✅ **代码更简洁**：移除了 HTML/Markdown 双模兼容逻辑。
*   ✅ **数据更纯净**：数据库中 100% 为 Markdown，利于向量化和搜索。
*   ✅ **体验更统一**：所有研报（无论是新建的还是 Seed 的）视觉风格完全一致。

---

> **批准建议**：该方案符合当前开发阶段需求，能够快速建立高质量基线。建议立即执行并重置数据库。
