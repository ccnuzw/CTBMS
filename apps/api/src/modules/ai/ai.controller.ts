import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AIService } from './ai.service';
import { AIModelService } from './ai-model.service';
import { AIProvider } from '@packages/types';

@Controller('ai')
export class AIController {
    constructor(private readonly aiModelService: AIModelService, private readonly aiService: AIService) { }

    @Get('test-connection')
    async testConnection(@Query('configKey') configKey?: string) {
        return this.aiModelService.testConnection(configKey);
    }

    @Get('models')
    async getModels(
        @Query('provider') provider?: string,
        @Query('configKey') configKey?: string,
        @Query('apiKey') apiKey?: string,
        @Query('apiUrl') apiUrl?: string,
        @Query('wireApi') wireApi?: string,
    ) {
        if (!provider && !configKey) {
            throw new Error('Provider parameter is required');
        }
        return this.aiModelService.getAvailableModels({ provider, apiKey, apiUrl, configKey, wireApi });
    }

    @Post('models')
    async getModelsDirect(@Body() payload: {
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
            throw new Error('Provider parameter is required');
        }
        return this.aiModelService.getAvailableModels(payload);
    }

    @Post('test-model')
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
        return this.aiModelService.testModelDirect(payload);
    }
}
