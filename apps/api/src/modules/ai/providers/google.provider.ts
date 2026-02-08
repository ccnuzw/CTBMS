import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { Logger } from '@nestjs/common';
import { IAIProvider, AIRequestOptions } from './base.provider';

export class GoogleProvider implements IAIProvider {
  private readonly logger = new Logger(GoogleProvider.name);

  private buildRequestOptions(options: AIRequestOptions): { baseUrl?: string } {
    return options.apiUrl ? { baseUrl: options.apiUrl } : {};
  }

  private buildHeaders(options: AIRequestOptions): Record<string, string> | undefined {
    // 'custom' is not a valid auth mode for standard headers logic, so we fallback to 'api-key' or ignore it
    const authType = options.authType === 'custom' ? 'api-key' : (options.authType || 'api-key');
    return this.buildHeadersForAuthMode(options, authType);
  }

  private buildHeadersForAuthMode(
    options: AIRequestOptions,
    authMode: 'x-goog-api-key' | 'bearer' | 'x-api-key' | 'api-key' | 'none' | 'query',
  ): Record<string, string> | undefined {
    const headers: Record<string, string> = { ...(options.headers || {}) };

    if (authMode === 'x-goog-api-key' && options.apiKey) {
      headers['x-goog-api-key'] = options.apiKey;
    }

    if (authMode === 'bearer' && options.apiKey && !headers.Authorization) {
      headers.Authorization = `Bearer ${options.apiKey}`;
    }

    if (authMode === 'x-api-key' && options.apiKey) {
      headers['x-api-key'] = options.apiKey;
    }

    if (authMode === 'api-key' && options.apiKey) {
      headers['api-key'] = options.apiKey;
    }

    return Object.keys(headers).length ? headers : undefined;
  }

  private resolveAuthModes(options: AIRequestOptions): Array<'x-goog-api-key' | 'bearer' | 'x-api-key' | 'query' | 'api-key' | 'none'> {
    if (options.authType === 'bearer') return ['bearer'];
    if (options.authType === 'api-key') return ['query', 'x-goog-api-key'];
    if (options.authType === 'none') return ['none'];
    return ['x-goog-api-key', 'bearer', 'x-api-key', 'query'];
  }

  private buildBaseUrl(options: AIRequestOptions): string {
    return options.apiUrl ? options.apiUrl.replace(/\/+$/, '') : 'https://generativelanguage.googleapis.com/v1beta';
  }

  private resolveModelListPaths(baseUrl: string, options: AIRequestOptions): string[] {
    const override = options.pathOverrides?.models;
    if (override) return [override];

    const normalizedBase = baseUrl.replace(/\/+$/, '');
    const endsWithV1beta = normalizedBase.endsWith('/v1beta');
    if (endsWithV1beta) return ['/models'];

    return ['/v1beta/models', '/models'];
  }

  private buildUrl(path: string, options: AIRequestOptions, authMode?: 'x-goog-api-key' | 'bearer' | 'x-api-key' | 'api-key' | 'none' | 'query'): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      const url = new URL(path);
      if (options.queryParams) {
        for (const [key, value] of Object.entries(options.queryParams)) {
          if (value !== undefined && value !== null && String(value).length > 0) {
            url.searchParams.set(key, String(value));
          }
        }
      }

      if (authMode === 'query' && options.apiKey) {
        url.searchParams.set('key', options.apiKey);
      }

      return url.toString();
    }

    const baseUrl = this.buildBaseUrl(options);
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${baseUrl}${normalizedPath}`);

    if (options.queryParams) {
      for (const [key, value] of Object.entries(options.queryParams)) {
        if (value !== undefined && value !== null && String(value).length > 0) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    if (authMode === 'query' && options.apiKey) {
      url.searchParams.set('key', options.apiKey);
    }

    return url.toString();
  }

  private resolveGenerateContentPath(options: AIRequestOptions): string {
    if (options.pathOverrides?.generateContent) return options.pathOverrides.generateContent;
    const baseUrl = this.buildBaseUrl(options);
    if (baseUrl.endsWith('/v1beta')) {
      return `/models/${options.modelName}:generateContent`;
    }
    return `/v1beta/models/${options.modelName}:generateContent`;
  }

  private shouldUseRest(options: AIRequestOptions): boolean {
    return Boolean(options.apiUrl || options.headers || options.queryParams || options.pathOverrides || options.authType === 'custom');
  }

  private async generateByRest(
    systemPrompt: string,
    userPrompt: string,
    options: AIRequestOptions,
  ): Promise<{ content: string; authMode?: string; pathUsed?: string }> {
    const authModes = this.resolveAuthModes(options);
    const contentParts = [
      { text: `${systemPrompt}\n\n${userPrompt}` },
      ...(options.images || []).map((img) => ({
        inlineData: {
          mimeType: img.mimeType,
          data: img.base64,
        },
      })),
    ];

    const generationConfig = options.apiUrl
      ? undefined
      : {
        maxOutputTokens: options.maxTokens ?? 8192,
        temperature: options.temperature ?? 0.3,
        topP: options.topP,
      };

    const body = {
      contents: [
        {
          role: 'user',
          parts: contentParts,
        },
      ],
      ...(generationConfig ? { generationConfig } : {}),
    };

    const primaryPath = this.resolveGenerateContentPath(options);
    const fallbackPath = primaryPath.includes('/v1beta/models/')
      ? `/models/${options.modelName}:generateContent`
      : `/v1beta/models/${options.modelName}:generateContent`;

    const pathsToTry = primaryPath === fallbackPath ? [primaryPath] : [primaryPath, fallbackPath];

    let lastError: Error | undefined;

    for (const authMode of authModes) {
      const headers = this.buildHeadersForAuthMode(options, authMode);
      for (const path of pathsToTry) {
        const url = this.buildUrl(path, options, authMode);
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(headers || {}),
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          lastError = new Error(`Gemini REST call failed: ${response.status} ${errorText}`);
          if (response.status === 401 || response.status === 403) {
            break;
          }
          if (response.status === 404 || response.status === 405) {
            continue;
          }
          throw lastError;
        }

        const data = await response.json() as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };

        const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
        return { content: text, authMode, pathUsed: path };
      }
    }

    throw lastError || new Error('Gemini REST call failed');
  }

  async generateResponse(
    systemPrompt: string,
    userPrompt: string,
    options: AIRequestOptions,
  ): Promise<string> {
    if (this.shouldUseRest(options)) {
      try {
        const result = await this.generateByRest(systemPrompt, userPrompt, options);
        return result.content;
      } catch (error) {
        this.logger.warn('Gemini REST fallback failed, retrying with SDK', error);
      }
    }
    const genAI = new GoogleGenerativeAI(options.apiKey);

    const requestOptions = this.buildRequestOptions(options);

    const model = genAI.getGenerativeModel(
      {
        model: options.modelName,
        generationConfig: {
          maxOutputTokens: options.maxTokens ?? 8192,
          temperature: options.temperature ?? 0.3,
          topP: options.topP,
        },
      },
      requestOptions,
    );

    const parts: Part[] = [
      { text: `${systemPrompt}\n\n${userPrompt}` } as Part,
    ];

    if (options.images?.length) {
      for (const img of options.images) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.base64,
          },
        } as Part);
      }
    }

    try {
      const result = await model.generateContent(parts);
      const response = await result.response;
      return response.text();
    } catch (error) {
      this.logger.error('Google Gemini API call failed', error);
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
      if (this.shouldUseRest(options)) {
        const result = await this.generateByRest('Hello', 'Are you working?', options);
        return {
          success: true,
          message: 'Google Gemini 连接测试成功',
          modelId: options.modelName,
          response: result.content.substring(0, 100),
          authMode: result.authMode,
          pathUsed: result.pathUsed,
        };
      }
      const genAI = new GoogleGenerativeAI(options.apiKey);
      const requestOptions = this.buildRequestOptions(options);

      const model = genAI.getGenerativeModel(
        { model: options.modelName },
        requestOptions,
      );

      const result = await model.generateContent('Hello');
      const response = await result.response;

      return {
        success: true,
        message: 'Google Gemini 连接测试成功',
        modelId: options.modelName,
        response: response.text().substring(0, 100),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Google Gemini 连接失败: ${msg}`,
        modelId: options.modelName,
        error: msg,
      };
    }
  }

  async getModels(_options: AIRequestOptions): Promise<{ models: string[]; activeUrl?: string }> {
    if (_options.modelFetchMode === 'manual') {
      return { models: [], activeUrl: _options.apiUrl };
    }

    if (_options.modelFetchMode === 'custom' && !_options.pathOverrides?.models) {
      return { models: [], activeUrl: _options.apiUrl };
    }

    if (_options.modelFetchMode === 'official' || _options.modelFetchMode === 'custom' || !_options.modelFetchMode) {
      const baseUrl = this.buildBaseUrl(_options);
      const paths = this.resolveModelListPaths(baseUrl, _options);
      const authModes = this.resolveAuthModes(_options);

      for (const authMode of authModes) {
        const headers = this.buildHeadersForAuthMode(_options, authMode);
        for (const path of paths) {
          try {
            const url = this.buildUrl(path, _options, authMode);
            const response = await fetch(url, { headers: headers || undefined });
            if (!response.ok) {
              const errorText = await response.text();
              if (response.status === 401 || response.status === 403) {
                break;
              }
              throw new Error(`Gemini model list failed: ${response.status} ${errorText}`);
            }

            const data = await response.json() as { models?: Array<{ name?: string }> };
            const models = (data.models || [])
              .map((model) => model.name || '')
              .filter(Boolean)
              .map((name) => name.replace(/^models\//, ''))
              .sort();

            if (models.length > 0) {
              return { models, activeUrl: _options.apiUrl };
            }
          } catch (error) {
            this.logger.warn(`Failed to fetch Gemini models via REST: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }

    return {
      models: [
        'gemini-2.0-flash',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemini-1.0-pro',
        'gemini-pro',
        'gemini-pro-vision',
      ],
    };
  }
}
