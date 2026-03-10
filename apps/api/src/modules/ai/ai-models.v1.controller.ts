import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { AIModelService } from './ai-model.service';
import { AIProvider } from '@packages/types';

@Controller('v1/ai-models')
export class AIModelsV1Controller {
  constructor(private readonly aiModelService: AIModelService) {}

  @Post('actions/fetch')
  async fetchModels(@Body() payload: {
    provider?: string;
    configKey?: string;
    apiKey?: string;
    apiUrl?: string;
    wireApi?: string;
    authType?: 'bearer' | 'api-key' | 'custom' | 'none';
    headers?: Record<string, string>;
    queryParams?: Record<string, string>;
    pathOverrides?: Record<string, string>;
    modelFetchMode?: 'official' | 'manual' | 'custom';
    allowUrlProbe?: boolean;
    allowCompatPathFallback?: boolean;
    timeoutSeconds?: number;
    maxRetries?: number;
  }) {
    if (!payload.provider && !payload.configKey) {
      throw new BadRequestException('provider or configKey is required');
    }
    return this.aiModelService.getAvailableModels(payload);
  }

  @Post('actions/test')
  async testModel(@Body() payload: {
    provider: AIProvider;
    modelName: string;
    apiKey?: string;
    apiUrl?: string;
    wireApi?: string;
    authType?: 'bearer' | 'api-key' | 'custom' | 'none';
    headers?: Record<string, string>;
    queryParams?: Record<string, string>;
    pathOverrides?: Record<string, string>;
    modelFetchMode?: 'official' | 'manual' | 'custom';
    allowUrlProbe?: boolean;
    allowCompatPathFallback?: boolean;
    timeoutSeconds?: number;
    maxRetries?: number;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  }) {
    if (!payload.provider || !payload.modelName) {
      throw new BadRequestException('provider and modelName are required');
    }
    return this.aiModelService.testModelDirect(payload);
  }
}
