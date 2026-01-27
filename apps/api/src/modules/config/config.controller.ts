
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ConfigService } from './config.service';

@Controller('config')
export class ConfigController {
    constructor(private readonly configService: ConfigService) { }

    @Post('refresh')
    async refreshCache() {
        await this.configService.refreshCache();
        return { success: true, message: 'Cache refreshed' };
    }

    // ===== Rules =====

    @Get('rules')
    async getRules(@Query('domain') domain?: string) {
        return this.configService.getRules(domain);
    }

    @Post('rules')
    async createRule(@Body() body: any) {
        return this.configService.createMappingRule(body);
    }

    @Put('rules/:id')
    async updateRule(@Param('id') id: string, @Body() body: any) {
        return this.configService.updateMappingRule(id, body);
    }

    @Delete('rules/:id')
    async deleteRule(@Param('id') id: string) {
        return this.configService.deleteMappingRule(id);
    }

    // ===== AI Config =====

    @Get('ai-models/:key')
    async getAIConfig(@Param('key') key: string) {
        return this.configService.getAIModelConfig(key);
    }

    @Post('ai-models')
    async saveAIConfig(@Body() body: any) {
        const { configKey, ...rest } = body;
        return this.configService.upsertAIModelConfig(configKey, rest);
    }
}
