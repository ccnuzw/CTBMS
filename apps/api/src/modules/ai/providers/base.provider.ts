export interface AIRequestOptions {
  modelName: string;
  apiKey: string;
  apiUrl?: string;
  wireApi?: string; // [NEW] 'responses' | 'chat'
  authType?: 'bearer' | 'api-key' | 'custom' | 'none';
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  pathOverrides?: Record<string, string>;
  modelFetchMode?: 'official' | 'manual' | 'custom';
  allowUrlProbe?: boolean;
  allowCompatPathFallback?: boolean;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  timeoutMs?: number;
  maxRetries?: number;
  images?: {
    base64: string;
    mimeType: string;
  }[];
  tools?: AIToolDefinition[]; // [NEW] optional tool definitions
}

export interface AIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>; // JSON Schema
  };
}

export interface AIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: AIToolCall[];
  tool_call_id?: string;
  name?: string; // used for tool messages sometimes
}

export interface AIChatResponse {
  content: string | null;
  tool_calls?: AIToolCall[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface IAIProvider {
  /**
   * 生成 AI 响应 (Legacy simple string interface)
   * @param systemPrompt 系统提示词
   * @param userPrompt 用户提示词
   * @param options 请求配置选项
   */
  generateResponse(
    systemPrompt: string,
    userPrompt: string,
    options: AIRequestOptions,
  ): Promise<string>;

  /**
   * 生成 AI 会话响应，支持 Tool Calling 和多轮历史
   * @param messages 多轮消息结构
   * @param options 请求配置选项
   */
  generateChat?(
    messages: AIMessage[],
    options: AIRequestOptions,
  ): Promise<AIChatResponse>;

  /**
   * 测试连接有效性
   * @param options 请求配置选项
   */
  testConnection(options: AIRequestOptions): Promise<{
    success: boolean;
    message: string;
    modelId: string;
    response?: string;
    error?: string;
    authMode?: string;
    pathUsed?: string;
  }>;

  /**
   * 获取可用模型列表
   * @param options 请求配置选项
   */
  getModels(options: AIRequestOptions): Promise<{ models: string[]; activeUrl?: string }>;

  /**
   * 文本重排 (Rerank)
   * 将候选文档依据与 Query 的相关性重新打分并排序
   * @param query 用户查询
   * @param documents 候选文档列表
   * @param options 请求配置选项
   */
  rerank?(
    query: string,
    documents: string[],
    options: AIRequestOptions,
  ): Promise<{ index: number; score: number }[]>;
}
