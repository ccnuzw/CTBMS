import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { AIService } from './ai.service';
import { AIModelService } from './ai-model.service';
import { AIProvider } from '@packages/types';
import { Response } from 'express';
import { setDeprecationHeaders } from '../../common/utils/deprecation';

@Controller('ai')
export class AIController {
    constructor(private readonly aiModelService: AIModelService, private readonly aiService: AIService) { }

    @Get('test-connection')
    async testConnection(@Query('configKey') configKey?: string, @Res({ passthrough: true }) res?: Response) {
        if (res) {
            setDeprecationHeaders(
                res,
                configKey
                    ? `/v1/ai-model-configs/${configKey}/actions/test`
                    : '/v1/ai-model-configs/{configKey}/actions/test',
            );
        }
        return this.aiModelService.testConnection(configKey);
    }

    @Get('models')
    async getModels(
        @Query('provider') provider?: string,
        @Query('configKey') configKey?: string,
        @Query('apiKey') apiKey?: string,
        @Query('apiUrl') apiUrl?: string,
        @Query('wireApi') wireApi?: string,
        @Res({ passthrough: true }) res?: Response,
    ) {
        if (res) {
            setDeprecationHeaders(res, '/v1/ai-models/actions/fetch');
        }
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
    }, @Res({ passthrough: true }) res?: Response) {
        if (res) {
            setDeprecationHeaders(res, '/v1/ai-models/actions/fetch');
        }
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
    }, @Res({ passthrough: true }) res?: Response) {
        if (res) {
            setDeprecationHeaders(res, '/v1/ai-models/actions/test');
        }
        return this.aiModelService.testModelDirect(payload);
    }
}
