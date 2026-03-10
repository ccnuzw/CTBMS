import { OpenAI } from 'openai';
import { Logger } from '@nestjs/common';
import { IAIProvider, AIRequestOptions, AIMessage, AIChatResponse } from './base.provider';

export class OpenAIProvider implements IAIProvider {
  private readonly logger = new Logger(OpenAIProvider.name);

  private toMs(seconds: number | undefined, fallbackMs: number, maxMs?: number): number {
    const baseMs =
      typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
        ? seconds * 1000
        : fallbackMs;
    return typeof maxMs === 'number' ? Math.min(baseMs, maxMs) : baseMs;
  }

  private isRetriableStatus(status: number): boolean {
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
  }

  private isRetriableErrorMessage(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('fetch failed') ||
      normalized.includes('econnreset') ||
      normalized.includes('etimedout') ||
      normalized.includes('socket hang up') ||
      normalized.includes('ssl') ||
      normalized.includes('tls')
    );
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private shouldForceCompatFallback(errorMessage: string): boolean {
    const normalized = errorMessage.toLowerCase();
    return (
      normalized.includes('unsupported legacy protocol') ||
      (normalized.includes('/v1/chat/completions') && normalized.includes('/v1/responses'))
    );
  }

  private isOfficialOpenAIBase(apiUrl?: string): boolean {
    if (!apiUrl) return true;
    const normalized = apiUrl.replace(/\/+$/, '').toLowerCase();
    return normalized === 'https://api.openai.com/v1' || normalized.startsWith('https://api.openai.com/v1/');
  }

  private buildHeaders(options: AIRequestOptions): Record<string, string> | undefined {
    const authType = options.authType === 'custom' ? 'bearer' : options.authType || 'bearer';
    return this.buildHeadersForAuthMode(options, authType);
  }

  private buildHeadersForAuthMode(
    options: AIRequestOptions,
    authMode: 'bearer' | 'api-key' | 'x-api-key' | 'none',
  ): Record<string, string> | undefined {
    const headers: Record<string, string> = { ...(options.headers || {}) };

    if (authMode === 'api-key' && options.apiKey) {
      headers['api-key'] = options.apiKey;
    }

    if (authMode === 'x-api-key' && options.apiKey) {
      headers['x-api-key'] = options.apiKey;
    }

    if (authMode === 'bearer' && options.apiKey && !headers.Authorization) {
      headers.Authorization = `Bearer ${options.apiKey}`;
    }

    return Object.keys(headers).length ? headers : undefined;
  }

  private resolveAuthModes(
    options: AIRequestOptions,
  ): Array<'bearer' | 'x-api-key' | 'api-key' | 'none'> {
    if (options.authType === 'bearer') return ['bearer', 'x-api-key', 'api-key'];
    if (options.authType === 'api-key') return ['api-key', 'x-api-key', 'bearer'];
    if (options.authType === 'none') return ['none'];
    return ['bearer', 'x-api-key', 'api-key'];
  }

  private buildModelListUrl(apiUrl: string | undefined, options: AIRequestOptions): string {
    const baseUrl = (apiUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const modelsPath = options.pathOverrides?.models;

    let url: URL;
    if (modelsPath) {
      if (modelsPath.startsWith('http://') || modelsPath.startsWith('https://')) {
        url = new URL(modelsPath);
      } else {
        const normalizedPath = modelsPath.startsWith('/') ? modelsPath : `/${modelsPath}`;
        url = new URL(`${baseUrl}${normalizedPath}`);
      }
    } else {
      url = new URL(`${baseUrl}/models`);
    }

    if (options.queryParams) {
      for (const [key, value] of Object.entries(options.queryParams)) {
        if (value !== undefined && value !== null && String(value).length > 0) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  private async fetchModelsDirect(
    apiUrl: string | undefined,
    options: AIRequestOptions,
    authMode?: 'bearer' | 'api-key' | 'x-api-key' | 'none',
  ): Promise<string[]> {
    const url = this.buildModelListUrl(apiUrl, options);
    const response = await fetch(url, {
      headers: authMode
        ? this.buildHeadersForAuthMode(options, authMode)
        : this.buildHeaders(options),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${response.status} ${errorText}`);
    }
    const data = (await response.json()) as { data?: Array<{ id?: string }> };
    return (data.data || [])
      .map((model) => model.id || '')
      .filter(Boolean)
      .sort();
  }

  private async callChatCompletionFetch(
    baseUrl: string,
    options: AIRequestOptions,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    authMode: 'bearer' | 'api-key' | 'x-api-key' | 'none',
  ): Promise<string> {
    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.buildHeadersForAuthMode(options, authMode) || {}),
      },
      body: JSON.stringify({
        model: options.modelName,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 8192,
        top_p: options.topP,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content || '';
  }

  private async callCompletionFetch(
    baseUrl: string,
    options: AIRequestOptions,
    prompt: string,
    authMode: 'bearer' | 'api-key' | 'x-api-key' | 'none',
  ): Promise<string> {
    const url = `${baseUrl.replace(/\/+$/, '')}/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.buildHeadersForAuthMode(options, authMode) || {}),
      },
      body: JSON.stringify({
        model: options.modelName,
        prompt,
        max_tokens: options.maxTokens ?? 8192,
        temperature: options.temperature ?? 0.3,
        top_p: options.topP,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { choices?: Array<{ text?: string }> };
    return data.choices?.[0]?.text || '';
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

  /**
   * Normalise ChatCompletions-style tools to Responses API flat format.
   *
   * ChatCompletions: { type: "function", function: { name, description, parameters } }
   * Responses:       { type: "function", name, description, parameters }
   *
   * Reference: sub2api normalizeCodexTools().
   */
  private normalizeToolsForResponses(
    tools?: AIRequestOptions['tools'],
  ): Array<Record<string, unknown>> | undefined {
    if (!tools || tools.length === 0) return undefined;

    return tools.map((tool) => {
      const flatTool: Record<string, unknown> = { type: 'function' };

      if ('name' in tool && typeof (tool as Record<string, unknown>).name === 'string') {
        return tool as unknown as Record<string, unknown>;
      }

      if (tool.function) {
        flatTool.name = tool.function.name;
        if (tool.function.description) {
          flatTool.description = tool.function.description;
        }
        if (tool.function.parameters) {
          flatTool.parameters = tool.function.parameters;
        }
      }

      return flatTool;
    });
  }

  private async callResponsesFetch(
    baseUrl: string,
    options: AIRequestOptions,
    prompt: string,
    authMode: 'bearer' | 'api-key' | 'x-api-key' | 'none',
  ): Promise<string> {
    const url = `${baseUrl.replace(/\/+$/, '')}/responses`;
    const retries = Math.max(0, options.maxRetries ?? 2);

    const primaryBody: Record<string, unknown> = {
      model: options.modelName,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: prompt }],
        },
      ],
      max_output_tokens: options.maxTokens ?? 8192,
      temperature: options.temperature ?? 0.3,
      top_p: options.topP,
      stream: false,
      tools: this.normalizeToolsForResponses(options.tools),
    };

    const tryRequest = async (body: Record<string, unknown>): Promise<string> => {
      let lastError = '';
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(this.buildHeadersForAuthMode(options, authMode) || {}),
            },
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            const errorText = await response.text();
            lastError = `${response.status} ${errorText}`;

            if (attempt < retries && this.isRetriableStatus(response.status)) {
              await this.sleep(350 * (attempt + 1));
              continue;
            }
            throw new Error(lastError);
          }

          const data = await response.json();
          return this.extractResponsesContent(data);
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          if (attempt < retries && this.isRetriableErrorMessage(lastError)) {
            await this.sleep(350 * (attempt + 1));
            continue;
          }
          throw error;
        }
      }
      throw new Error(lastError || 'Responses call failed');
    };

    try {
      return await tryRequest(primaryBody);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // Some compatible gateways still prefer simple string input.
      if (/^400\b/.test(msg)) {
        return tryRequest({
          ...primaryBody,
          input: prompt,
        });
      }
      throw error;
    }
  }

  /**
   * Extract tool_calls from Responses API output items (function_call type).
   */
  private extractResponsesToolCalls(
    data: unknown,
  ): Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const typed = data as {
      output?: Array<{
        type?: string;
        id?: string;
        call_id?: string;
        name?: string;
        arguments?: string;
        tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
      }>;
    };
    if (!typed.output) return undefined;

    const toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = [];
    for (const item of typed.output) {
      if (item.tool_calls) {
        toolCalls.push(...item.tool_calls);
        continue;
      }
      if (item.type === 'function_call' && item.name) {
        toolCalls.push({
          id: item.call_id || item.id || `call_${toolCalls.length}`,
          type: 'function',
          function: {
            name: item.name,
            arguments: item.arguments || '{}',
          },
        });
      }
    }
    return toolCalls.length > 0 ? toolCalls : undefined;
  }

  private async callWithCompatFallback(
    baseUrl: string,
    options: AIRequestOptions,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    prompt: string,
  ): Promise<{ content: string; authMode?: string; pathUsed?: string }> {
    const primaryBase = baseUrl.replace(/\/+$/, '');
    const authModes = this.resolveAuthModes(options);
    const preferResponses = options.wireApi === 'responses';

    const parseStatus = (message: string): number | undefined => {
      const match = message.match(/^(\d{3})\b/);
      return match ? Number(match[1]) : undefined;
    };

    let lastError: Error | undefined;

    for (const authMode of authModes) {
      if (preferResponses) {
        try {
          const content = await this.callResponsesFetch(primaryBase, options, prompt, authMode);
          return { content, authMode, pathUsed: '/responses' };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          const status = parseStatus(msg);
          lastError = error instanceof Error ? error : new Error(msg);
          if ((status === 401 || status === 403) && authModes.length > 1) {
            continue;
          }
        }
      }

      try {
        const content = await this.callChatCompletionFetch(
          primaryBase,
          options,
          messages,
          authMode,
        );
        return { content, authMode, pathUsed: '/chat/completions' };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const status = parseStatus(msg);
        lastError = error instanceof Error ? error : new Error(msg);

        if ((status === 401 || status === 403) && authModes.length > 1) {
          continue;
        }

        if (
          options.allowCompatPathFallback !== false &&
          (status === 400 || status === 404 || status === 405)
        ) {
          const compatOrder = preferResponses
            ? (['responses', 'completions'] as const)
            : (['completions', 'responses'] as const);

          let recovered = false;
          for (const endpoint of compatOrder) {
            try {
              if (endpoint === 'completions') {
                const content = await this.callCompletionFetch(primaryBase, options, prompt, authMode);
                return { content, authMode, pathUsed: '/completions' };
              }
              const content = await this.callResponsesFetch(primaryBase, options, prompt, authMode);
              return { content, authMode, pathUsed: '/responses' };
            } catch (fallbackError) {
              const fallbackMsg =
                fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
              const fallbackStatus = parseStatus(fallbackMsg);
              if ((fallbackStatus === 401 || fallbackStatus === 403) && authModes.length > 1) {
                recovered = true;
                break;
              }
              lastError = fallbackError instanceof Error ? fallbackError : new Error(fallbackMsg);
            }
          }

          if (recovered) {
            continue;
          }
        }

        if (!preferResponses) {
          try {
            const content = await this.callResponsesFetch(primaryBase, options, prompt, authMode);
            return { content, authMode, pathUsed: '/responses' };
          } catch (responsesError) {
            const fallbackMsg =
              responsesError instanceof Error ? responsesError.message : String(responsesError);
            const fallbackStatus = parseStatus(fallbackMsg);
            if ((fallbackStatus === 401 || fallbackStatus === 403) && authModes.length > 1) {
              continue;
            }
            lastError = responsesError instanceof Error ? responsesError : new Error(fallbackMsg);
          }
        }

        break;
      }
    }

    throw lastError || new Error('OpenAI API call failed');
  }

  async generateResponse(
    systemPrompt: string,
    userPrompt: string,
    options: AIRequestOptions,
  ): Promise<string> {
    const client = this.createClient(options);

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: options.images?.length
          ? [
            { type: 'text', text: userPrompt },
            ...options.images.map((img) => ({
              type: 'image_url' as const,
              image_url: {
                url: `data:${img.mimeType};base64,${img.base64}`,
              },
            })),
          ]
          : userPrompt,
      },
    ];

    try {
      const response = await client.chat.completions.create({
        model: options.modelName,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 8192,
        top_p: options.topP,
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      this.logger.error('OpenAI API call failed', error);
      const msg = error instanceof Error ? error.message : String(error);
      const shouldFallback =
        options.allowCompatPathFallback !== false ||
        !this.isOfficialOpenAIBase(options.apiUrl) ||
        this.shouldForceCompatFallback(msg);
      if (shouldFallback) {
        const fallback = await this.callWithCompatFallback(
          options.apiUrl || 'https://api.openai.com/v1',
          options,
          messages,
          `${systemPrompt}\n\n${userPrompt}`,
        );
        return fallback.content;
      }
      throw error;
    }
  }

  async generateChat(messages: AIMessage[], options: AIRequestOptions): Promise<AIChatResponse> {
    const client = this.createClient(options);

    const openAiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = messages.map(
      (msg) => {
        if (msg.role === 'tool') {
          return {
            role: 'tool',
            content: msg.content || '',
            tool_call_id: msg.tool_call_id || '',
          } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
        } else if (msg.role === 'assistant') {
          return {
            role: 'assistant',
            content: msg.content,
            tool_calls: msg.tool_calls as
              | OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]
              | undefined,
          } as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam;
        } else if (msg.role === 'system') {
          return {
            role: 'system',
            content: msg.content || '',
          } as OpenAI.Chat.Completions.ChatCompletionSystemMessageParam;
        } else {
          return {
            role: 'user',
            content: msg.content || '',
            name: msg.name,
          } as OpenAI.Chat.Completions.ChatCompletionUserMessageParam;
        }
      },
    );

    const requestPayload: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: options.modelName,
      messages: openAiMessages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 8192,
      top_p: options.topP,
      tools: options.tools as OpenAI.Chat.Completions.ChatCompletionTool[] | undefined,
    };

    try {
      const response = await client.chat.completions.create(requestPayload);

      const responseMessage = response.choices[0]?.message;
      const toolCalls = responseMessage?.tool_calls?.flatMap((toolCall, index) => {
        if (toolCall.type !== 'function') {
          return [];
        }
        return [
          {
            id: toolCall.id || `call_${index}`,
            type: 'function' as const,
            function: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            },
          },
        ];
      });
      return {
        content: responseMessage?.content || null,
        tool_calls: toolCalls?.length ? toolCalls : undefined,
        usage: response.usage
          ? {
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
          }
          : undefined,
      };
    } catch (error) {
      this.logger.error('OpenAI generateChat failed', error);
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
    try {
      const client = this.createClient(options);
      const response = await client.chat.completions.create({
        model: options.modelName,
        messages: [{ role: 'user', content: 'Hello, are you working?' }],
        max_tokens: 50,
      });

      return {
        success: true,
        message: 'OpenAI 连接测试成功',
        modelId: options.modelName,
        response: response.choices[0]?.message?.content || '',
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const shouldFallback =
        options.allowCompatPathFallback !== false ||
        !this.isOfficialOpenAIBase(options.apiUrl) ||
        this.shouldForceCompatFallback(msg);
      if (shouldFallback) {
        try {
          const response = await this.callWithCompatFallback(
            options.apiUrl || 'https://api.openai.com/v1',
            options,
            [{ role: 'user', content: 'Hello, are you working?' }],
            'Hello, are you working?',
          );
          return {
            success: true,
            message: 'OpenAI 连接测试成功 (fallback)',
            modelId: options.modelName,
            response: response.content || '',
            authMode: response.authMode,
            pathUsed: response.pathUsed,
          };
        } catch (fallbackError) {
          const fallbackMsg =
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          return {
            success: false,
            message: `OpenAI 连接失败: ${msg}`,
            modelId: options.modelName,
            error: fallbackMsg,
          };
        }
      }
      return {
        success: false,
        message: `OpenAI 连接失败: ${msg}`,
        modelId: options.modelName,
        error: msg,
      };
    }
  }

  async getModels(options: AIRequestOptions): Promise<{ models: string[]; activeUrl?: string }> {
    if (options.modelFetchMode === 'manual') {
      return { models: [], activeUrl: options.apiUrl };
    }

    if (options.modelFetchMode === 'custom' && !options.pathOverrides?.models) {
      return { models: [], activeUrl: options.apiUrl };
    }

    const shouldPreferDirect =
      options.modelFetchMode === 'custom' || Boolean(options.pathOverrides?.models);
    const authModes = this.resolveAuthModes(options);
    const fetchModelsDirectWithAuthFallback = async (url: string | undefined): Promise<string[]> => {
      let lastError: unknown;
      for (const authMode of authModes) {
        try {
          return await this.fetchModelsDirect(url, options, authMode);
        } catch (error) {
          lastError = error;
          continue;
        }
      }
      throw (lastError instanceof Error ? lastError : new Error(String(lastError)));
    };

    try {
      const models = shouldPreferDirect
        ? await fetchModelsDirectWithAuthFallback(options.apiUrl)
        : await this.fetchModels(options.apiUrl, options);
      return { models, activeUrl: options.apiUrl };
    } catch (error) {
      this.logger.warn(
        `Failed to fetch models from default URL: ${error instanceof Error ? error.message : String(error)}`,
      );

      try {
        const models = await fetchModelsDirectWithAuthFallback(options.apiUrl);
        return { models, activeUrl: options.apiUrl };
      } catch (directError) {
        this.logger.warn(
          `Direct fetch fallback failed: ${directError instanceof Error ? directError.message : String(directError)}`,
        );
      }

      // Probing logic
      const hasAbsoluteModelPath =
        (options.pathOverrides?.models || '').startsWith('http://') ||
        (options.pathOverrides?.models || '').startsWith('https://');

      if (options.apiUrl && options.allowUrlProbe !== false && !hasAbsoluteModelPath) {
        const variations = this.getUrlVariations(options.apiUrl);
        for (const url of variations) {
          if (url === options.apiUrl) continue; // Already tried
          try {
            this.logger.log(`Probing model URL: ${url}`);
            if (!shouldPreferDirect) {
              const models = await this.fetchModels(url, options);
              this.logger.log(`Successfully found models at ${url}`);
              return { models, activeUrl: url };
            }
          } catch (e) {
            void e;
          }
          try {
            const models = await fetchModelsDirectWithAuthFallback(url);
            if (models.length > 0) {
              return { models, activeUrl: url };
            }
          } catch (directError) {
            this.logger.warn(
              `Direct fetch failed for ${url}: ${directError instanceof Error ? directError.message : String(directError)}`,
            );
          }
        }
      }

      this.logger.error('OpenAI List Models failed after retries', error);
      throw error;
    }
  }

  private getUrlVariations(originalUrl: string): string[] {
    const urls = new Set<string>();
    const trimmed = originalUrl.replace(/\/+$/, '');

    // 1. Original
    urls.add(trimmed);

    // 2. Common suffixes
    urls.add(`${trimmed}/v1`);
    urls.add(`${trimmed}/v1beta`);
    urls.add(`${trimmed}/api/v1`);
    urls.add(`${trimmed}/api`);

    // 3. If original has /v1 or /v1beta, try base
    if (trimmed.endsWith('/v1')) {
      urls.add(trimmed.slice(0, -3));
    }
    if (trimmed.endsWith('/v1beta')) {
      urls.add(trimmed.slice(0, -7));
    }

    return Array.from(urls);
  }

  private async fetchModels(
    apiUrl: string | undefined,
    options: AIRequestOptions,
  ): Promise<string[]> {
    const client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: apiUrl || 'https://api.openai.com/v1',
      timeout: this.toMs(options.timeoutSeconds, 10000, 10000), // shorter timeout for probing
      maxRetries: 0, // No internal retries, we handle it
      dangerouslyAllowBrowser: true,
      defaultHeaders: this.buildHeaders(options),
    });

    const response = await client.models.list();
    return response.data.map((model) => model.id).sort();
  }

  private createClient(options: AIRequestOptions): OpenAI {
    return new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.apiUrl || 'https://api.openai.com/v1',
      timeout: this.toMs(options.timeoutSeconds, 30000),
      maxRetries: options.maxRetries ?? 3,
      defaultHeaders: this.buildHeaders(options),
    });
  }
}
