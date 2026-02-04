
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ConfigService } from './config.service';
import {
    CreateDictionaryDomainDto,
    UpdateDictionaryDomainDto,
    CreateDictionaryItemDto,
    UpdateDictionaryItemDto,
} from './dto/dictionary.dto';

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

    // ===== Dictionaries =====
    @Get('dictionary-domains')
    async getDictionaryDomains(@Query('includeInactive') includeInactive?: string) {
        return this.configService.getDictionaryDomains(includeInactive === 'true');
    }

    @Post('dictionary-domains')
    async createDictionaryDomain(@Body() body: CreateDictionaryDomainDto) {
        return this.configService.createDictionaryDomain(body);
    }

    @Put('dictionary-domains/:code')
    async updateDictionaryDomain(@Param('code') code: string, @Body() body: UpdateDictionaryDomainDto) {
        return this.configService.updateDictionaryDomain(code, body);
    }

    @Delete('dictionary-domains/:code')
    async deleteDictionaryDomain(@Param('code') code: string) {
        return this.configService.disableDictionaryDomain(code);
    }

    @Get('dictionary-domains/:code/items')
    async getDictionaryItems(
        @Param('code') code: string,
        @Query('includeInactive') includeInactive?: string
    ) {
        return this.configService.getDictionaryItems(code, includeInactive === 'true');
    }

    @Post('dictionary-domains/:code/items')
    async createDictionaryItem(@Param('code') code: string, @Body() body: CreateDictionaryItemDto) {
        return this.configService.createDictionaryItem(code, body);
    }

    @Put('dictionary-domains/:code/items/:itemCode')
    async updateDictionaryItem(
        @Param('code') code: string,
        @Param('itemCode') itemCode: string,
        @Body() body: UpdateDictionaryItemDto
    ) {
        return this.configService.updateDictionaryItem(code, itemCode, body);
    }

    @Delete('dictionary-domains/:code/items/:itemCode')
    async deleteDictionaryItem(
        @Param('code') code: string,
        @Param('itemCode') itemCode: string
    ) {
        return this.configService.deleteDictionaryItem(code, itemCode);
    }

    @Get('dictionary-domains/:code/items/:itemCode/references')
    async checkDictionaryItemReferences(
        @Param('code') code: string,
        @Param('itemCode') itemCode: string
    ) {
        return this.configService.checkDictionaryItemReferences(code, itemCode);
    }


    @Get('dictionaries')
    async getDictionaries(
        @Query('domains') domains?: string,
        @Query('includeInactive') includeInactive?: string
    ) {
        const domainList = (domains || '')
            .split(',')
            .map((d) => d.trim())
            .filter(Boolean);
        return this.configService.getDictionaries(domainList, includeInactive === 'true');
    }

    @Get('dictionaries/:domain')
    async getDictionary(
        @Param('domain') domain: string,
        @Query('includeInactive') includeInactive?: string
    ) {
        return this.configService.getDictionary(domain, includeInactive === 'true');
    }
}
