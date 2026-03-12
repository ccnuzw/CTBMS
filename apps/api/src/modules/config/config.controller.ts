import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Res } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { ConfigService } from './config.service';
import {
  CreateDictionaryDomainDto,
  UpdateDictionaryDomainDto,
  CreateDictionaryItemDto,
  UpdateDictionaryItemDto,
} from './dto/dictionary.dto';
import { CreateAIModelConfigDto } from './dto/create-ai-model-config.dto';
import { setDeprecationHeaders } from '../../common/utils/deprecation';

@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) { }

  @Post('actions/refresh')
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
  async createRule(@Body() body: Prisma.BusinessMappingRuleCreateInput) {
    return this.configService.createMappingRule(body);
  }

  @Patch('rules/:id')
  async updateRule(@Param('id') id: string, @Body() body: Prisma.BusinessMappingRuleUpdateInput) {
    return this.configService.updateMappingRule(id, body);
  }

  @Delete('rules/:id')
  async deleteRule(@Param('id') id: string) {
    return this.configService.deleteMappingRule(id);
  }

  // ===== AI Config =====

  @Get('ai-models')
  async getAllAIConfigs(
    @Query('includeInactive') includeInactive?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, '/v1/ai-model-configs');
    }
    return this.configService.getAllAIModelConfigs(includeInactive === 'true');
  }

  @Get('ai-models/:key')
  async getAIConfig(@Param('key') key: string, @Res({ passthrough: true }) res?: Response) {
    if (res) {
      setDeprecationHeaders(res, `/v1/ai-model-configs/${key}`);
    }
    return this.configService.getAIModelConfig(key);
  }

  @Post('ai-models')
  async saveAIConfig(@Body() body: CreateAIModelConfigDto, @Res({ passthrough: true }) res?: Response) {
    if (res) {
      setDeprecationHeaders(res, '/v1/ai-model-configs');
    }
    return this.configService.upsertAIModelConfig(body.configKey, body);
  }

  @Delete('ai-models/:key')
  async deleteAIConfig(@Param('key') key: string, @Res({ passthrough: true }) res?: Response) {
    if (res) {
      setDeprecationHeaders(res, `/v1/ai-model-configs/${key}`);
    }
    return this.configService.deleteAIModelConfig(key);
  }

  @Get('workflow-agent-strict-mode')
  async getWorkflowAgentStrictMode() {
    return this.configService.getWorkflowAgentStrictMode();
  }

  @Patch('workflow-agent-strict-mode')
  async setWorkflowAgentStrictMode(@Body() body: { enabled: boolean; updatedBy?: string }) {
    return this.configService.setWorkflowAgentStrictMode(body.enabled, body.updatedBy);
  }

  @Get('workflow-standardized-read-mode')
  async getWorkflowStandardizedReadMode() {
    return this.configService.getWorkflowStandardizedReadMode();
  }

  @Patch('workflow-standardized-read-mode')
  async setWorkflowStandardizedReadMode(@Body() body: { enabled: boolean; updatedBy?: string }) {
    return this.configService.setWorkflowStandardizedReadMode(body.enabled, body.updatedBy);
  }

  @Get('workflow-reconciliation-gate-enabled')
  async getWorkflowReconciliationGateEnabled() {
    return this.configService.getWorkflowReconciliationGateEnabled();
  }

  @Patch('workflow-reconciliation-gate-enabled')
  async setWorkflowReconciliationGateEnabled(
    @Body() body: { enabled: boolean; updatedBy?: string },
  ) {
    return this.configService.setWorkflowReconciliationGateEnabled(body.enabled, body.updatedBy);
  }

  @Get('workflow-reconciliation-max-age-minutes')
  async getWorkflowReconciliationMaxAgeMinutes() {
    return this.configService.getWorkflowReconciliationMaxAgeMinutes();
  }

  @Patch('workflow-reconciliation-max-age-minutes')
  async setWorkflowReconciliationMaxAgeMinutes(
    @Body() body: { value: number; updatedBy?: string },
  ) {
    return this.configService.setWorkflowReconciliationMaxAgeMinutes(body.value, body.updatedBy);
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

  @Patch('dictionary-domains/:code')
  async updateDictionaryDomain(
    @Param('code') code: string,
    @Body() body: UpdateDictionaryDomainDto,
  ) {
    return this.configService.updateDictionaryDomain(code, body);
  }

  @Delete('dictionary-domains/:code')
  async deleteDictionaryDomain(@Param('code') code: string) {
    return this.configService.disableDictionaryDomain(code);
  }

  @Get('dictionary-domains/:code/items')
  async getDictionaryItems(
    @Param('code') code: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.configService.getDictionaryItems(code, includeInactive === 'true');
  }

  @Post('dictionary-domains/:code/items')
  async createDictionaryItem(@Param('code') code: string, @Body() body: CreateDictionaryItemDto) {
    return this.configService.createDictionaryItem(code, body);
  }

  @Patch('dictionary-domains/:code/items/:itemCode')
  async updateDictionaryItem(
    @Param('code') code: string,
    @Param('itemCode') itemCode: string,
    @Body() body: UpdateDictionaryItemDto,
  ) {
    return this.configService.updateDictionaryItem(code, itemCode, body);
  }

  @Delete('dictionary-domains/:code/items/:itemCode')
  async deleteDictionaryItem(@Param('code') code: string, @Param('itemCode') itemCode: string) {
    return this.configService.deleteDictionaryItem(code, itemCode);
  }

  @Get('dictionary-domains/:code/items/:itemCode/references')
  async checkDictionaryItemReferences(
    @Param('code') code: string,
    @Param('itemCode') itemCode: string,
  ) {
    return this.configService.checkDictionaryItemReferences(code, itemCode);
  }

  @Get('dictionaries')
  async getDictionaries(
    @Query('domains') domains?: string,
    @Query('includeInactive') includeInactive?: string,
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
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.configService.getDictionary(domain, includeInactive === 'true');
  }
}
