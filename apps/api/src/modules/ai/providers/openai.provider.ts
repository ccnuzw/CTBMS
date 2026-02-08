import { OpenAI } from 'openai';
import { Logger } from '@nestjs/common';
import { IAIProvider, AIRequestOptions } from './base.provider';

export class OpenAIProvider implements IAIProvider {
  private readonly logger = new Logger(OpenAIProvider.name);

  private buildHeaders(options: AIRequestOptions): Record<string, string> | undefined {
    const authType = options.authType === 'custom' ? 'bearer' : (options.authType || 'bearer');
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

  private resolveAuthModes(options: AIRequestOptions): Array<'bearer' | 'x-api-key' | 'api-key' | 'none'> {
    if (options.authType === 'bearer') return ['bearer'];
    if (options.authType === 'api-key') return ['api-key'];
    if (options.authType === 'none') return ['none'];
    return ['bearer', 'x-api-key', 'api-key'];
  }

  private async fetchModelsDirect(apiUrl: string | undefined, options: AIRequestOptions): Promise<string[]> {
    const baseUrl = (apiUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/models`, {
      headers: this.buildHeaders(options),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${response.status} ${errorText}`);
    }
    const data = await response.json() as { data?: Array<{ id?: string }> };
    return (data.data || []).map((model) => model.id || '').filter(Boolean);
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

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
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

    const data = await response.json() as { choices?: Array<{ text?: string }> };
    return data.choices?.[0]?.text || '';
  }

  private async callWithCompatFallback(
    baseUrl: string,
    options: AIRequestOptions,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    prompt: string,
  ): Promise<{ content: string; authMode?: string; pathUsed?: string }> {
    const primaryBase = baseUrl.replace(/\/+$/, '');
    const authModes = this.resolveAuthModes(options);

    const parseStatus = (message: string): number | undefined => {
      const match = message.match(/^(\d{3})\b/);
      return match ? Number(match[1]) : undefined;
    };

    let lastError: Error | undefined;

    for (const authMode of authModes) {
      try {
        const content = await this.callChatCompletionFetch(primaryBase, options, messages, authMode);
        return { content, authMode, pathUsed: '/chat/completions' };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const status = parseStatus(msg);
        lastError = error instanceof Error ? error : new Error(msg);

        if ((status === 401 || status === 403) && authModes.length > 1) {
          continue;
        }

        if (options.allowCompatPathFallback && (status === 404 || status === 405)) {
          try {
            const content = await this.callCompletionFetch(primaryBase, options, prompt, authMode);
            return { content, authMode, pathUsed: '/completions' };
          } catch (fallbackError) {
            const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            const fallbackStatus = parseStatus(fallbackMsg);
            if ((fallbackStatus === 401 || fallbackStatus === 403) && authModes.length > 1) {
              continue;
            }
            lastError = fallbackError instanceof Error ? fallbackError : new Error(fallbackMsg);
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
      if (options.allowCompatPathFallback) {
        const fallback = await this.callWithCompatFallback(options.apiUrl || 'https://api.openai.com/v1', options, messages, `${systemPrompt}\n\n${userPrompt}`);
        return fallback.content;
      }
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
      if (options.allowCompatPathFallback) {
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
          const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
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
    try {
      const models = await this.fetchModels(options.apiUrl, options);
      return { models, activeUrl: options.apiUrl };
    } catch (error) {
      this.logger.warn(`Failed to fetch models from default URL: ${error instanceof Error ? error.message : String(error)}`);

      try {
        const models = await this.fetchModelsDirect(options.apiUrl, options);
        return { models, activeUrl: options.apiUrl };
      } catch (directError) {
        this.logger.warn(`Direct fetch fallback failed: ${directError instanceof Error ? directError.message : String(directError)}`);
      }

      // Probing logic
      if (options.apiUrl && options.allowUrlProbe !== false) {
        const variations = this.getUrlVariations(options.apiUrl);
        for (const url of variations) {
          if (url === options.apiUrl) continue; // Already tried
          try {
            this.logger.log(`Probing model URL: ${url}`);
            const models = await this.fetchModels(url, options);
            this.logger.log(`Successfully found models at ${url}`);
            return { models, activeUrl: url };
          } catch (e) {
            try {
              const models = await this.fetchModelsDirect(url, options);
              if (models.length > 0) {
                return { models, activeUrl: url };
              }
            } catch (directError) {
              this.logger.warn(`Direct fetch failed for ${url}: ${directError instanceof Error ? directError.message : String(directError)}`);
            }
            continue;
          }
        }
      }

      this.logger.error('OpenAI List Models failed after retries', error);
      // Fallback to basic models if list fails
      return { models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'] };
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

  private async fetchModels(apiUrl: string | undefined, options: AIRequestOptions): Promise<string[]> {
    const client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: apiUrl || 'https://api.openai.com/v1',
      timeout: options.timeoutMs ? Math.min(options.timeoutMs, 10000) : 10000, // shorter timeout for probing
      maxRetries: 0, // No internal retries, we handle it
      dangerouslyAllowBrowser: true,
      defaultHeaders: this.buildHeaders(options),
    });

    const response = await client.models.list();
    return response.data
      .filter((model) => {
        const id = model.id.toLowerCase();
        return (
            id.includes('gpt') ||
            id.includes('deepseek') ||
            id.includes('claude') ||
            id.includes('gemini') ||
            id.includes('qwen') ||
            id.includes('hunyuan') ||
            id.includes('spark') ||
            id.includes('doubao') ||
            id.includes('yi-') ||
            id.includes('chatglm') ||
            id.includes('minimax')
        );
      })
      .map((model) => model.id)
      .sort();
  }

  private createClient(options: AIRequestOptions): OpenAI {
    return new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.apiUrl || 'https://api.openai.com/v1',
      timeout: options.timeoutMs || 30000,
      maxRetries: options.maxRetries ?? 3,
      defaultHeaders: this.buildHeaders(options),
    });
  }
}
