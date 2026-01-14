# AI API 集成配置指南

本文档将指导您如何将 `aiService.ts` 中的 Mock 服务替换为真实的 Gemini AI API 调用。

## 1. 获取 API Key

1.  访问 [Google AI Studio](https://aistudio.google.com/)。
2.  点击 **Get API key** 创建一个新的 API 密钥。

## 2. 配置环境变量

在 `apps/web` 目录下：

1.  复制 `.env.example` 为 `.env`：
    ```bash
    cp .env.example .env
    ```
2.  在 `.env` 文件中填入您的 API Key：
    ```text
    VITE_GOOGLE_GENAI_API_KEY=AIzaSy...您的真实Key...
    ```

## 3. 安装依赖

如果您尚未安装 Gemini SDK，请执行：

```bash
pnpm --filter web add @google/genai
```

## 4. 修改 Service 代码

打开 `apps/web/src/features/enterprise/services/aiService.ts`，进行以下修改：

1.  **关闭 Mock 模式**：
    ```typescript
    const IS_MOCK_MODE = false; 
    ```

2.  **引入 SDK 并初始化**：
    在文件顶部添加：
    ```typescript
    import { GoogleGenAI } from "@google/genai";
    
    // 初始化 SDK (注意: 前端调用存在 Key 暴露风险，生产环境建议通过后端 api 转发)
    const genAI = new GoogleGenAI(import.meta.env.VITE_GOOGLE_GENAI_API_KEY);
    ```

3.  **实现 API 调用逻辑**：
    找到 `optimizeLogisticsRoute` 等函数中的 "Real API Implementation Example" 部分，取消注释并启用代码。示例：

    ```typescript
    // 示例：替换 Mock 逻辑
    if (!IS_MOCK_MODE) {
        // 获取模型
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        
        // 发送 Prompt
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // 解析 JSON 结果
        // 注意：建议在 Prompt 中强制要求 JSON 格式，并增加 try-catch 处理解析错误
        return JSON.parse(text);
    }
    ```

## 5. 验证

启动项目 (`pnpm dev:web`)，在界面点击“生成分析报告”或“AI 智能路线优化”，查看 chrome network 面板，确认请求是否成功发送到 Google API。

---

> **安全提示**：
> 当前方案为前端直接调用（Client-side），API Key 会暴露在浏览器端。
> **生产环境强烈建议**：
> 1. 在 `apps/api` (NestJS) 创建一个 Proxy Controller。
> 2. 将 Key 存储在后端的 `.env` 中。
> 3. 前端请求后端接口，后端再请求 Gemini API。
