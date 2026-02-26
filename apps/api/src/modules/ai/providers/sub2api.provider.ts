import { Logger } from '@nestjs/common';
import { IAIProvider, AIRequestOptions, AIMessage, AIChatResponse } from './base.provider';

type Sub2ApiToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

type Sub2ApiChatResponse = {
  output?: Array<{ content?: string | null; tool_calls?: Sub2ApiToolCall[] }>;
  choices?: Array<{ message?: { content?: string | null; tool_calls?: Sub2ApiToolCall[] } }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export class Sub2ApiProvider implements IAIProvider {
  private readonly logger = new Logger(Sub2ApiProvider.name);

  private normalizeBaseUrl(apiUrl?: string): string {
    let baseUrl = (apiUrl || 'https://sub2api.526566.xyz').replace(/\/+$/, '');

    // Guard against endpoint URLs being stored as base URL.
    // e.g. .../v1/models, .../v1/chat/completions, .../v1/responses
    baseUrl = baseUrl.replace(/\/chat\/completions$/, '');
    baseUrl = baseUrl.replace(/\/completions$/, '');
    baseUrl = baseUrl.replace(/\/responses$/, '');
    baseUrl = baseUrl.replace(/\/models$/, '');

    return baseUrl;
  }

  private buildHeaders(options: AIRequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (options.apiKey) {
      // Default to Bearer, but allow overrides via options
      if (options.authType === 'api-key') {
        headers['api-key'] = options.apiKey;
      } else {
        // Default to Bearer for sub2api (compatible with OpenAI)
        headers['Authorization'] = `Bearer ${options.apiKey}`;
      }
    }
    return headers;
  }

  private getEndpoint(options: AIRequestOptions, type: 'chat' | 'models'): string {
    const baseUrl = this.normalizeBaseUrl(options.apiUrl);

    // Wire API: responses (Codex protocol)
    const wireApi = options.wireApi || 'chat'; // default to chat if not specified? or rely on user config

    if (type === 'models') {
      // Models endpoint seems standard /v1/models based on probes
      if (baseUrl.endsWith('/v1')) return `${baseUrl}/models`;
      return `${baseUrl}/v1/models`;
    }

    if (type === 'chat') {
      // [IMPORTANT] Specialized handling for 'responses' protocol
      if (wireApi === 'responses') {
        // Usually /v1/responses or /responses
        // Based on probes, /v1/responses gives 503 (exists), /responses gives 503 (exists)
        // We'll try /v1/responses first as it's more standard for v1 prefix users
        if (baseUrl.endsWith('/v1')) return `${baseUrl}/responses`;
        return `${baseUrl}/v1/responses`;
      }

      // Default OpenAI-compatible chat
      if (baseUrl.endsWith('/v1')) return `${baseUrl}/chat/completions`;
      return `${baseUrl}/v1/chat/completions`;
    }

    throw new Error(`Unknown endpoint type: ${type}`);
  }

  private toResponsesInput(messages: Array<{ role: string; content: string }>) {
    return messages.map((m) => ({
      role: m.role,
      content: [{ type: 'input_text', text: m.content }],
    }));
  }

  private extractResponsesContent(data: unknown): string {
    if (!data || typeof data !== 'object') return '';
    const typed = data as {
      output_text?: string;
      output?: Array<{
        content?: string | Array<{ type?: string; text?: string }>;
      }>;
      choices?: Array<{ message?: { content?: string } }>;
    };

    if (typed.output_text && typed.output_text.length > 0) {
      return typed.output_text;
    }

    const chunks: string[] = [];
    for (const item of typed.output || []) {
      if (typeof item.content === 'string') {
        chunks.push(item.content);
        continue;
      }
      if (Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part && typeof part.text === 'string' && part.text.length > 0) {
            chunks.push(part.text);
          }
        }
      }
    }

    if (chunks.length > 0) {
      return chunks.join('\n');
    }

    return typed.choices?.[0]?.message?.content || '';
  }

  async generateResponse(
    systemPrompt: string,
    userPrompt: string,
    options: AIRequestOptions,
  ): Promise<string> {
    const url = this.getEndpoint(options, 'chat');
    const headers = this.buildHeaders(options);

    const wireApi = options.wireApi || 'chat';

    let body: Record<string, unknown>;

    if (wireApi === 'responses') {
      // OpenAI Responses Protocol
      body = {
        model: options.modelName,
        input: this.toResponsesInput([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ]),
        max_output_tokens: options.maxTokens,
        temperature: options.temperature,
        top_p: options.topP,
        stream: false,
      };
    } else {
      // Standard OpenAI
      body = {
        model: options.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        top_p: options.topP,
      };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Sub2API Error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as {
        output?: Array<{ content?: string }>;
        choices?: Array<{ message?: { content?: string } }>;
      };

      if (wireApi === 'responses') {
        return this.extractResponsesContent(data);
      }

      // Standard
      return data.choices?.[0]?.message?.content || '';
    } catch (error) {
      this.logger.error('Sub2API generation failed', error);
      throw error;
    }
  }

  async generateChat(messages: AIMessage[], options: AIRequestOptions): Promise<AIChatResponse> {
    const url = this.getEndpoint(options, 'chat');
    const headers = this.buildHeaders(options);

    // Map messages to OpenAI format (Sub2API is typically OpenAI-compatible)
    const openAiMessages = messages.map((msg) => {
      const baseMsg: Record<string, unknown> = {
        role: msg.role,
        content: msg.content || '',
      };

      if (msg.role === 'tool') {
        baseMsg.tool_call_id = msg.tool_call_id || '';
      } else if (msg.role === 'assistant') {
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          baseMsg.tool_calls = msg.tool_calls;
          // 如果存在 tool_calls，大多数标准的 OpenAI 兼容网关可以接受 content = null
          if (!msg.content) {
            baseMsg.content = null;
          }
        }
      } else if (msg.role === 'user' && msg.name) {
        baseMsg.name = msg.name;
      }

      return baseMsg;
    });

    const body: Record<string, unknown> = {
      model: options.modelName,
      messages: openAiMessages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 8192,
      top_p: options.topP,
      tools: options.tools,
    };

    if (options.wireApi === 'responses') {
      body.input = this.toResponsesInput(
        messages
          .filter((m) => m.role === 'system' || m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role, content: m.content || '' })),
      );
      body.max_output_tokens = options.maxTokens ?? 8192;
      body.stream = false;
      delete body.messages;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Sub2API Chat Error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as Sub2ApiChatResponse;

      if (options.wireApi === 'responses') {
        return {
          content: this.extractResponsesContent(data) || null,
          tool_calls: data.output?.[0]?.tool_calls,
        };
      }

      const choiceMessage = data.choices?.[0]?.message;
      return {
        content: choiceMessage?.content || null,
        tool_calls: choiceMessage?.tool_calls,
        usage: data.usage
          ? {
              prompt_tokens: data.usage.prompt_tokens,
              completion_tokens: data.usage.completion_tokens,
              total_tokens: data.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      this.logger.error('Sub2API generateChat failed', error);
      throw error;
    }
  }

  async testConnection(options: AIRequestOptions): Promise<{
    success: boolean;
    message: string;
    modelId: string;
    response?: string;
    error?: string;
    authMode?: string;
    pathUsed?: string;
  }> {
    const wireApi = options.wireApi || 'chat';
    const url = this.getEndpoint(options, 'chat');

    try {
      const headers = this.buildHeaders(options);
      const body =
        wireApi === 'responses'
          ? {
              model: options.modelName,
              input: this.toResponsesInput([{ role: 'user', content: 'Hello' }]),
              max_output_tokens: 10,
              stream: false,
            }
          : {
              model: options.modelName,
              messages: [{ role: 'user', content: 'Hello' }],
              max_tokens: 10,
            };

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();

        // Special handling for known 503 from sub2api
        if (response.status === 503 && errorText.includes('No available accounts')) {
          return {
            success: false,
            message: `Sub2API 服务端资源耗尽 (503): ${errorText}`,
            modelId: options.modelName,
            error: errorText,
            pathUsed: url,
          };
        }

        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as {
        output?: Array<{ content?: string }>;
        choices?: Array<{ message?: { content?: string } }>;
      };
      let content = '';

      if (wireApi === 'responses') {
        content = this.extractResponsesContent(data);
      } else {
        content = data.choices?.[0]?.message?.content || '';
      }

      return {
        success: true,
        message: 'Sub2API 连接成功',
        modelId: options.modelName,
        response: content || 'OK',
        pathUsed: url,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Sub2API 连接失败: ${msg}`,
        modelId: options.modelName,
        error: msg,
        pathUsed: url,
      };
    }
  }

  async getModels(options: AIRequestOptions): Promise<{ models: string[]; activeUrl?: string }> {
    // Use standard models endpoint usually
    const url = this.getEndpoint(options, 'models');
    try {
      const headers = this.buildHeaders(options);
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);

      const data = (await response.json()) as { data?: Array<{ id: string }> };
      const models = (data.data || []).map((m) => m.id).sort();

      return { models, activeUrl: this.normalizeBaseUrl(options.apiUrl) };
    } catch (error) {
      this.logger.error('Sub2API getModels failed', error);
      throw error;
    }
  }

  async rerank(
    query: string,
    documents: string[],
    options: AIRequestOptions,
  ): Promise<{ index: number; score: number }[]> {
    const baseUrl = (options.apiUrl || 'https://api.siliconflow.cn/v1').replace(/\/+$/, '');
    const url = `${baseUrl}/rerank`;

    try {
      const headers = this.buildHeaders(options);
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: options.modelName,
          query: query,
          texts: documents,
          top_n: documents.length,
          return_documents: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Rerank Error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as {
        results?: Array<{ index: number; relevance_score: number }>;
      };

      if (!data.results) {
        return [];
      }

      return data.results.map((r) => ({
        index: r.index,
        score: r.relevance_score,
      }));
    } catch (error) {
      this.logger.error('Rerank API call failed', error);
      return [];
    }
  }
}
