export interface AIRequestOptions {
  modelName: string;
  apiKey: string;
  apiUrl?: string;
  authType?: 'bearer' | 'api-key' | 'custom' | 'none';
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  pathOverrides?: Record<string, string>;
  modelFetchMode?: 'official' | 'manual' | 'custom';
  allowUrlProbe?: boolean;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  timeoutMs?: number;
  maxRetries?: number;
  images?: {
    base64: string;
    mimeType: string;
  }[];
}

export interface IAIProvider {
  /**
   * 生成 AI 响应
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
   * 测试连接有效性
   * @param options 请求配置选项
   */
  testConnection(options: AIRequestOptions): Promise<{
    success: boolean;
    message: string;
    modelId: string;
    response?: string;
    error?: string;
  }>;

  /**
   * 获取可用模型列表
   * @param options 请求配置选项
   */
  getModels(options: AIRequestOptions): Promise<{ models: string[]; activeUrl?: string }>;
}
