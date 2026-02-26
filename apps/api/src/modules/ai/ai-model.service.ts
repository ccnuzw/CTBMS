import { Injectable, Logger } from '@nestjs/common';
import { AIProvider } from '@packages/types';
import { AIModelConfig } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { AIProviderFactory } from './providers/provider.factory';
import { AIRequestOptions } from './providers/base.provider';

@Injectable()
export class AIModelService {
  private readonly logger = new Logger(AIModelService.name);
  public readonly apiKey: string;
  public readonly apiUrl: string;
  public readonly modelId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly aiProviderFactory: AIProviderFactory,
  ) {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    this.apiUrl = process.env.GEMINI_API_URL || '';
    this.modelId = process.env.GEMINI_MODEL_ID || 'gemini-pro';
  }

  async getSystemModelConfig(): Promise<{
    provider: AIProvider;
    modelId: string;
    apiKey: string;
    apiUrl?: string;
  } | null> {
    const aiConfig = await this.configService.getDefaultAIConfig();
    const provider = (aiConfig?.provider as AIProvider) || 'google';
    const modelId = aiConfig?.modelName || this.modelId;
    const apiKey = this.resolveApiKey(aiConfig, this.apiKey);
    const apiUrl = this.resolveApiUrl(aiConfig, this.apiUrl) || undefined;

    if (!apiKey) {
      return null;
    }

    return {
      provider,
      modelId,
      apiKey,
      apiUrl,
    };
  }

  public resolveApiKey(
    config?: AIModelConfig | null,
    fallback?: string,
    override?: string,
  ): string {
    if (override) return override;
    if (config?.apiKey) return config.apiKey;
    if (config?.apiKeyEnvVar) {
      const envValue = process.env[config.apiKeyEnvVar];
      if (envValue) return envValue;
    }
    return fallback || '';
  }

  public resolveApiUrl(
    config?: AIModelConfig | null,
    fallback?: string,
    override?: string,
  ): string {
    if (override) return override;
    return config?.apiUrl || fallback || '';
  }

  public resolveRecord(value?: unknown): Record<string, string> | undefined {
    if (!value || typeof value !== 'object') return undefined;
    return value as Record<string, string>;
  }

  public buildTestHint(
    provider: AIProvider,
    apiUrl?: string,
    errorMessage?: string,
  ): string | undefined {
    if (!errorMessage) return undefined;
    const message = errorMessage.toLowerCase();
    const url = apiUrl || '';

    if (provider === 'google') {
      if (message.includes('404') && url.includes('/v1beta')) {
        return 'Gemini 兼容网关在 /v1beta 下常用的生成路径是 /models/{model}:generateContent，而不是 /v1beta/models/...';
      }
      if (message.includes('invalid_argument')) {
        return '请确保请求体包含 role 字段（contents: [{ role: "user", parts: [...] }])，并尽量保持精简。';
      }
      if (message.includes('401')) {
        return '鉴权失败：优先使用 x-goog-api-key 或 Bearer，避免使用 api-key 头。';
      }
    }

    if (provider === 'openai') {
      if (message.includes('405') && url.endsWith('/v1')) {
        return '该网关可能不接受 /v1 前缀的二次拼接，请使用 /chat/completions 或 /completions。';
      }
      if (message.includes('401')) {
        return '鉴权失败：优先使用 Authorization: Bearer 或 x-api-key。';
      }
    }

    return undefined;
  }

  /**
   * 测试 AI 连接
   */
  async testConnection(configKey: string = 'DEFAULT'): Promise<{
    success: boolean;
    message: string;
    apiUrl?: string;
    modelId?: string;
    provider?: string;
    response?: string;
    error?: string;
    hint?: string;
    authMode?: string;
    pathUsed?: string;
  }> {
    // [NEW] Get Configuration from DB for testing
    const aiConfig = await this.prisma.aIModelConfig.findUnique({ where: { configKey } });
    // Fallback to defaults if no config found (legacy behavior)
    const currentApiKey = this.resolveApiKey(aiConfig, this.apiKey);
    const currentApiUrl = this.resolveApiUrl(aiConfig, this.apiUrl);
    const currentModelId = aiConfig?.modelName || this.modelId;
    const providerType = (aiConfig?.provider as AIProvider) || 'google';

    if (!currentApiKey) {
      return { success: false, message: 'API Key 未配置', provider: providerType };
    }

    try {
      const provider = this.aiProviderFactory.getProvider(providerType);
      const options: AIRequestOptions = {
        modelName: currentModelId,
        apiKey: currentApiKey,
        apiUrl: currentApiUrl || undefined,
        authType: aiConfig?.authType as AIRequestOptions['authType'],
        headers: this.resolveRecord(aiConfig?.headers),
        queryParams: this.resolveRecord(aiConfig?.queryParams),
        pathOverrides: this.resolveRecord(aiConfig?.pathOverrides),
        wireApi: this.resolveRecord(aiConfig?.pathOverrides)?.['wireApi'], // [NEW] Extract wireApi
        modelFetchMode: aiConfig?.modelFetchMode as AIRequestOptions['modelFetchMode'],
        allowUrlProbe: aiConfig?.allowUrlProbe ?? undefined,
        allowCompatPathFallback: aiConfig?.allowCompatPathFallback ?? undefined,
        timeoutSeconds: aiConfig?.timeoutSeconds ?? undefined,
        maxRetries: aiConfig?.maxRetries ?? undefined,
      };

      const result = await provider.testConnection(options);

      return {
        success: result.success,
        message: result.message,
        apiUrl: currentApiUrl,
        modelId: result.modelId,
        provider: providerType,
        response: result.response,
        error: result.error,
        hint: this.buildTestHint(providerType, currentApiUrl, result.error || result.message),
        authMode: result.authMode,
        pathUsed: result.pathUsed,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('AI Connection test error', error);
      return {
        success: false,
        message: `连接错误: ${errorMessage}`,
        apiUrl: currentApiUrl,
        modelId: currentModelId,
        provider: providerType,
        error: errorMessage,
        hint: this.buildTestHint(providerType, currentApiUrl, errorMessage),
      };
    }
  }

  /**
   * 直接测试指定模型是否可用（不保存配置）
   */
  async testModelDirect(payload: {
    provider: AIProvider;
    modelName: string;
    apiKey?: string;
    apiUrl?: string;
    authType?: AIRequestOptions['authType'];
    headers?: Record<string, string>;
    queryParams?: Record<string, string>;
    pathOverrides?: Record<string, string>;
    modelFetchMode?: AIRequestOptions['modelFetchMode'];
    allowUrlProbe?: boolean;
    allowCompatPathFallback?: boolean;
    timeoutSeconds?: number;
    maxRetries?: number;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  }): Promise<{
    success: boolean;
    message: string;
    apiUrl?: string;
    modelId?: string;
    provider?: string;
    response?: string;
    error?: string;
    hint?: string;
    authMode?: string;
    pathUsed?: string;
  }> {
    const providerType = payload.provider || 'google';
    const currentApiKey = payload.apiKey || this.apiKey;
    const currentApiUrl = payload.apiUrl || this.apiUrl;
    const modelName = payload.modelName || this.modelId;

    if (!currentApiKey) {
      return { success: false, message: 'API Key 未配置', provider: providerType };
    }

    try {
      const provider = this.aiProviderFactory.getProvider(providerType);
      const options: AIRequestOptions = {
        modelName,
        apiKey: currentApiKey,
        apiUrl: currentApiUrl || undefined,
        authType: payload.authType,
        headers: payload.headers,
        queryParams: payload.queryParams,
        pathOverrides: payload.pathOverrides,
        wireApi: payload.pathOverrides?.['wireApi'], // [NEW] Extract wireApi
        modelFetchMode: payload.modelFetchMode,
        allowUrlProbe: payload.allowUrlProbe,
        allowCompatPathFallback: payload.allowCompatPathFallback,
        timeoutSeconds: payload.timeoutSeconds,
        maxRetries: payload.maxRetries,
        temperature: payload.temperature,
        maxTokens: payload.maxTokens,
        topP: payload.topP,
      };

      const result = await provider.testConnection(options);
      return {
        success: result.success,
        message: result.message,
        apiUrl: currentApiUrl,
        modelId: result.modelId,
        provider: providerType,
        response: result.response,
        error: result.error,
        hint: this.buildTestHint(providerType, currentApiUrl, result.error || result.message),
        authMode: result.authMode,
        pathUsed: result.pathUsed,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('AI Model direct test error', error);
      return {
        success: false,
        message: `连接错误: ${errorMessage}`,
        apiUrl: currentApiUrl,
        modelId: modelName,
        provider: providerType,
        error: errorMessage,
        hint: this.buildTestHint(providerType, currentApiUrl, errorMessage),
      };
    }
  }

  /**
   * 获取可用模型列表
   */
  async getAvailableModels(
    providerType?: string,
    apiKey?: string,
    apiUrl?: string,
    configKey?: string,
  ): Promise<{
    models: string[];
    activeUrl?: string;
    provider?: string;
    diagnostics?: Array<{ provider: string; message: string; activeUrl?: string }>;
  }> {
    try {
      // Resolve configuration priority: Argument > DB Config > Env
      let finalApiKey = apiKey;
      let finalApiUrl = apiUrl;

      const config = configKey
        ? await this.prisma.aIModelConfig.findUnique({ where: { configKey } })
        : null;

      // Always fetch config to have fallback values, even if some args are provided
      // This allows mixed usage (e.g., provided API Key but default URL from config)
      let activeConfig = null;
      if (!config && providerType) {
        const allConfigs = await this.configService.getAllAIModelConfigs();
        activeConfig =
          allConfigs.find((c) => c.provider === providerType && c.isDefault && c.isActive) ||
          allConfigs.find((c) => c.provider === providerType && c.isActive);
      }
      const resolvedConfig = config || activeConfig;

      if (!resolvedConfig && !providerType) {
        throw new Error('Provider resolution failed: missing provider and configKey');
      }

      if (!finalApiKey) {
        if (resolvedConfig) {
          finalApiKey = this.resolveApiKey(resolvedConfig, this.apiKey);
        } else {
          // Fallback to environment variables if they match the provider
          if (providerType === 'google' && this.apiKey) {
            finalApiKey = this.apiKey;
          }
        }
      }

      // Logic fix: Ensure apiUrl argument takes precedence, then config, then fallback
      if (!finalApiUrl) {
        if (resolvedConfig?.apiUrl) {
          finalApiUrl = resolvedConfig.apiUrl;
        } else if (providerType === 'google' && this.apiUrl) {
          finalApiUrl = this.apiUrl;
        }
      }

      if (!finalApiKey) {
        throw new Error('API Key is required to fetch models');
      }
      const diagnostics: Array<{ provider: string; message: string; activeUrl?: string }> = [];

      const providerCandidates: AIProvider[] = (() => {
        if (providerType === 'auto') return ['openai', 'google'];

        // If configKey is specified and no explicit provider override is provided,
        // pin resolution to the config's provider to avoid cross-provider fallback.
        if (configKey && !providerType && resolvedConfig?.provider) {
          return [resolvedConfig.provider as AIProvider];
        }

        const requested = providerType as AIProvider | undefined;
        if (requested) return [requested];

        if (resolvedConfig?.provider) {
          const ordered: AIProvider[] = [resolvedConfig.provider as AIProvider, 'openai', 'google'];
          return Array.from(new Set<AIProvider>(ordered));
        }

        return ['openai', 'google'];
      })();

      for (const candidate of providerCandidates) {
        const provider = this.aiProviderFactory.getProvider(candidate);
        const options: AIRequestOptions = {
          modelName: 'model-listing-placeholder',
          apiKey: finalApiKey,
          apiUrl: finalApiUrl || undefined,
          authType: resolvedConfig?.authType as AIRequestOptions['authType'],
          headers: this.resolveRecord(resolvedConfig?.headers),
          queryParams: this.resolveRecord(resolvedConfig?.queryParams),
          pathOverrides: this.resolveRecord(resolvedConfig?.pathOverrides),
          wireApi: this.resolveRecord(resolvedConfig?.pathOverrides)?.['wireApi'], // [NEW] Extract wireApi
          modelFetchMode: resolvedConfig?.modelFetchMode as AIRequestOptions['modelFetchMode'],
          allowUrlProbe: resolvedConfig?.allowUrlProbe ?? undefined,
          allowCompatPathFallback: resolvedConfig?.allowCompatPathFallback ?? undefined,
          timeoutSeconds: resolvedConfig?.timeoutSeconds ?? undefined,
          maxRetries: resolvedConfig?.maxRetries ?? undefined,
        };

        try {
          const result = await provider.getModels(options);
          if (result.models.length > 0) {
            if (resolvedConfig) {
              this.configService
                .upsertAIModelConfig(resolvedConfig.configKey, {
                  configKey: resolvedConfig.configKey,
                  provider: resolvedConfig.provider as AIProvider,
                  modelName: resolvedConfig.modelName,
                  apiUrl: resolvedConfig.apiUrl ?? undefined,
                  apiKey: resolvedConfig.apiKey ?? undefined,
                  apiKeyEnvVar: resolvedConfig.apiKeyEnvVar ?? undefined,
                  authType: resolvedConfig.authType as AIRequestOptions['authType'],
                  headers: this.resolveRecord(resolvedConfig.headers),
                  queryParams: this.resolveRecord(resolvedConfig.queryParams),
                  pathOverrides: this.resolveRecord(resolvedConfig.pathOverrides),
                  modelFetchMode:
                    resolvedConfig.modelFetchMode as AIRequestOptions['modelFetchMode'],
                  allowUrlProbe: resolvedConfig.allowUrlProbe ?? undefined,
                  allowCompatPathFallback: resolvedConfig.allowCompatPathFallback ?? undefined,
                  temperature: resolvedConfig.temperature,
                  maxTokens: resolvedConfig.maxTokens,
                  topP: resolvedConfig.topP ?? undefined,
                  topK: resolvedConfig.topK ?? undefined,
                  isActive: resolvedConfig.isActive,
                  isDefault: resolvedConfig.isDefault,
                  timeoutSeconds: resolvedConfig.timeoutSeconds,
                  maxRetries: resolvedConfig.maxRetries,
                  availableModels: result.models,
                })
                .catch((err) => {
                  this.logger.warn(
                    `Failed to update available models for ${resolvedConfig.configKey}`,
                    err,
                  );
                });
            }

            return {
              ...result,
              provider: candidate,
              diagnostics,
            };
          }

          diagnostics.push({
            provider: candidate,
            message: '模型列表为空',
            activeUrl: result.activeUrl || finalApiUrl || undefined,
          });
        } catch (error) {
          diagnostics.push({
            provider: candidate,
            message: error instanceof Error ? error.message : String(error),
            activeUrl: finalApiUrl || undefined,
          });
        }
      }

      return { models: [], activeUrl: finalApiUrl || undefined, diagnostics };
    } catch (error) {
      this.logger.error(`Failed to fetch models for ${providerType}`, error);
      throw new Error(
        `无法获取模型列表: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
