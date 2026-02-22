# 📄 智能研报工作台 Markdown 转型与可行性分析报告

## 1. 背景与目标
当前智能研报工作台采用 **富文本 (HTML)** 格式存储和编辑研报。用户提出希望转型为 **Markdown** 格式，以提升检索效率并为 AI Agent 工作流提供更高质量的数据源。同时涉及 PDF 智能转 Markdown 的需求。

本报告对该转型进行对比分析、可行性评估，并提供实施路径建议。

---

## 2. HTML vs. Markdown 对比分析

| 维度 | 富文本 (HTML) | Markdown | 结论 |
| :--- | :--- | :--- | :--- |
| **数据纯净度** | ⚠️ **低**。包含大量 `<span>`, `<div>`, `style` 标签，不仅仅是内容，还有大量样式噪音。 | ✅ **高**。仅包含语义符号 (`#`, `*`, `-`)，专注于内容结构。 | Markdown 更优 |
| **AI/RAG 友好度** | ⚠️ **差**。HTML 标签会占用 Token；RAG 切片 (Chunking) 容易切断闭合标签导致上下文错乱。 | ✅ **优**。Token 密度高；按标题/段落切片自然且语义完整；LLM 对 Markdown 的理解能力极强。 | Markdown 完胜 |
| **检索效率** | 🔸 **中**。可以通过全文检索，但样式标签会干扰关键词匹配权重。 | ✅ **高**。纯文本检索，无噪音干扰；Header 结构有助于生成层级索引。 | Markdown 更优 |
| **排版灵活性** | ✅ **高**。支持任意颜色、字体、复杂布局。 | 🔸 **中**。受限于 Markdown 语法，但可通过 CSS 统一渲染出高质量、风格一致的 UI (Premium Design)。 | HTML 灵活，但 Markdown 更规范 |
| **编辑体验** | ✅ **所见即所得 (WYSIWYG)**。 | ✅ **所见即所得** (通过 Tiptap 等现代编辑器可实现类似 Word 的体验，底层存 Markdown)。 | 体验相当 |

### 🎯 核心结论
对于 **"智能体工作流"** 和 **"高质量数据源"** 这一目标，**Markdown 是绝对的更优解**。它将非结构化的视觉信息转化为半结构化的语义信息，极大地降低了下游 AI 处理的复杂度。

---

## 3. 可行性分析 (Feasibility Study)

### 3.1 前端编辑器 (Frontend Editor)
*   **现状**: 使用 `TiptapEditor` (基于 ProseMirror)。
*   **方案**: Tiptap 官方提供 `tiptap-markdown` 扩展，支持直接导入/导出 Markdown。
*   **工作量**: **低**。安装扩展，配置序列化/反序列化逻辑即可。现有 UI 组件基本无需大改。

### 3.2 PDF 转 Markdown (PDF to Markdown Pipeline)
*   **现状**: 简单的文本提取 + 换行符处理。
*   **方案**: 引入 **"OCR + LLM"** 或 **"Native PDF Parsing + LLM"** 流程。
    1.  **解析**: 使用 `pdf-parse` (已存在依赖) 提取原始文本。
    2.  **重组**: 对于复杂布局（多栏、表格），需要利用多模态大模型 (GPT-4o / Gemini 1.5 Pro) 或专用库 (LlamaParse) 进行 "Layout Aware Parsing"。
    3.  **清洗**: 调用当前已集成的 AI 模型，Prompt: *"将以下识别的文本重组为标准 Markdown，保留标题层级和表格结构"*。
*   **工作量**: **中**。需要编写新的后端 Service 方法处理转换逻辑。

### 3.3 数据存储与迁移 (Storage & Migration)
*   **现状**: `MarketIntel.rawContent` (Text) 存储 HTML。
*   **方案**:
    *   新数据直接存 Markdown。
    *   旧数据：编写脚本使用 `turndown` 库将存量 HTML 转换为 Markdown。
*   **兼容性**: 数据库字段类型兼容 (String/Text)。建议增加 `contentFormat` 枚举字段以区分版本。
*   **工作量**: **低**。

### 3.4 前端渲染 (Rendering)
*   **现状**: `dangerouslySetInnerHTML` 渲染 HTML。
*   **方案**: 使用 `react-markdown` (已存在依赖) + `rehype-raw` (可选) + `Tailwind Typography` / `Ant Design Token CSS`。
*   **优势**: 可以统一控制所有研报的字号、行高、颜色，实现用户要求的 "Premium Design"，避免旧数据中参差不齐的内联样式破坏美感。
*   **工作量**: **中**。需要定制 Markdown 渲染组件的样式。

---

## 4. 实施路径建议 (Implementation Plan)

### 第一阶段：基础设施升级
1.  **依赖安装**: 前端安装 `tiptap-markdown`，后端安装 `turndown` (用于迁移)。
2.  **Schema 更新**:
    *   在 `ResearchReport` 或 `MarketIntel` 表中添加 `contentFormat` 字段 (`HTML` | `MARKDOWN`，默认为 `MARKDOWN` 为新标准)。
3.  **编辑器改造**: 升级 `TiptapEditor` 组件，支持传入 Markdown prop 并输出 Markdown。

### 第二阶段：智能导入流程
1.  **PDF 转换 API**: 开发 `POST /api/market-intel/convert-to-markdown` 接口。
    *   接收文件 -> 解析文本 -> LLM 结构化清洗 -> 返回 Markdown。
2.  **前端集成**: 在研报创建页的 "上传文档" 环节，对接该 API，将转换后的 Markdown 填入编辑器。

### 第三阶段：展示与迁移
1.  **渲染组件**: 开发 `MarkdownRenderer` 组件，应用 Ant Design 风格的高级排版样式。
2.  **数据清洗**: 运行后台脚本，将历史 HTML 研报转换为 Markdown (可选，或仅对新研报启用)。

---

## 5. 最终建议
**强烈建议执行此转型**。这不仅解决了 AI 数据源质量问题，还能通过统一渲染层大幅提升阅读端的一致性和美观度，符合 "Premium Design" 的要求。
