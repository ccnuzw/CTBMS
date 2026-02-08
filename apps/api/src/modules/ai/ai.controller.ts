import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AIService } from './ai.service';
import { AIProvider } from '@packages/types';

@Controller('ai')
export class AIController {
    constructor(private readonly aiService: AIService) { }

    @Get('test-connection')
    async testConnection(@Query('configKey') configKey?: string) {
        return this.aiService.testConnection(configKey);
    }

    @Get('models')
    async getModels(
        @Query('provider') provider?: string,
        @Query('configKey') configKey?: string,
        @Query('apiKey') apiKey?: string,
        @Query('apiUrl') apiUrl?: string
    ) {
        if (!provider && !configKey) {
            throw new Error('Provider parameter is required');
        }
        return this.aiService.getAvailableModels(provider, apiKey, apiUrl, configKey);
    }

    @Post('test-model')
    async testModel(@Body() payload: {
        provider: AIProvider;
        modelName: string;
        apiKey?: string;
        apiUrl?: string;
        authType?: 'bearer' | 'api-key' | 'custom' | 'none';
        headers?: Record<string, string>;
        queryParams?: Record<string, string>;
        pathOverrides?: Record<string, string>;
        modelFetchMode?: 'official' | 'manual' | 'custom';
        allowUrlProbe?: boolean;
        allowCompatPathFallback?: boolean;
        timeoutMs?: number;
        maxRetries?: number;
        temperature?: number;
        maxTokens?: number;
        topP?: number;
    }) {
        return this.aiService.testModelDirect(payload);
    }
}
