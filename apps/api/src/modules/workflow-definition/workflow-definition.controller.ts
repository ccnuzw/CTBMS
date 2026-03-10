import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UnauthorizedException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { WorkflowDefinitionService } from './workflow-definition.service';
import { WorkflowDefinitionValidatorService } from './workflow-definition-validator.service';
import { WorkflowNodePreviewService } from './workflow-node-preview.service';
import {
  CreateWorkflowDefinitionRequest,
  CreateWorkflowVersionRequest,
  PublishWorkflowVersionRequest,
  UpdateWorkflowDefinitionRequest,
  ValidateWorkflowDslRequest,
  PreflightWorkflowDslRequest,
  ValidateWorkflowNodePreviewRequest,
  WorkflowDefinitionQueryRequest,
  WorkflowPublishAuditQueryRequest,
} from './dto';
import { AIProviderFactory } from '../ai/providers/provider.factory';
import { AIModelService } from '../ai/ai-model.service';
import { AIProvider } from '@packages/types';

import { ConfigService } from '../config/config.service';

type AuthRequest = ExpressRequest & { user?: { id?: string } };
type PublishedWorkflowQuery = {
  page?: string;
  pageSize?: string;
  categoryId?: string;
  keyword?: string;
  orderBy?: 'stars' | 'createdAt';
};

@Controller('workflow-definitions')
export class WorkflowDefinitionController {
  private readonly logger = new Logger(WorkflowDefinitionController.name);

  constructor(
    private readonly workflowDefinitionService: WorkflowDefinitionService,
    private readonly workflowDefinitionValidatorService: WorkflowDefinitionValidatorService,
    private readonly workflowNodePreviewService: WorkflowNodePreviewService,
    private readonly aiProviderFactory: AIProviderFactory,
    private readonly aiModelService: AIModelService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  create(@Body() dto: CreateWorkflowDefinitionRequest, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.workflowDefinitionService.create(userId, dto);
  }

  @Get()
  findAll(@Query() query: WorkflowDefinitionQueryRequest, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.workflowDefinitionService.findAll(userId, query);
  }

  @Get('public/published')
  getPublished(@Query() query: PublishedWorkflowQuery) {
    return this.workflowDefinitionService.getPublishedWorkflows({
      page: query.page ? parseInt(query.page, 10) : 1,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : 20,
      categoryId: query.categoryId,
      keyword: query.keyword,
      orderBy: query.orderBy as 'stars' | 'createdAt',
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.workflowDefinitionService.findOne(userId, id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkflowDefinitionRequest,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.workflowDefinitionService.update(userId, id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.workflowDefinitionService.remove(userId, id);
  }

  @Get(':id/versions')
  listVersions(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.workflowDefinitionService.listVersions(userId, id);
  }

  @Post(':id/versions')
  createVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateWorkflowVersionRequest,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.workflowDefinitionService.createVersion(userId, id, dto);
  }

  @Post(':id/publish')
  publishVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishWorkflowVersionRequest,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.workflowDefinitionService.publishVersion(userId, id, dto);
  }

  @Get(':id/publish-audits')
  listPublishAudits(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: WorkflowPublishAuditQueryRequest,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.workflowDefinitionService.listPublishAudits(userId, id, query);
  }

  @Post('validate-dsl')
  validateDsl(@Body() dto: ValidateWorkflowDslRequest) {
    return this.workflowDefinitionValidatorService.validateDsl(dto.dslSnapshot, dto.stage);
  }

  @Post('preflight-dsl')
  preflightDsl(@Body() dto: PreflightWorkflowDslRequest) {
    const autoFixLevel = (dto as unknown as { autoFixLevel?: 'SAFE' | 'AGGRESSIVE' }).autoFixLevel;
    const enabledAutoFixCodes = (dto as unknown as { enabledAutoFixCodes?: string[] })
      .enabledAutoFixCodes;
    return this.workflowDefinitionService.preflightDsl(
      dto.dslSnapshot,
      dto.stage,
      autoFixLevel,
      enabledAutoFixCodes,
    );
  }

  @Post('preview-node')
  previewNode(@Body() dto: ValidateWorkflowNodePreviewRequest) {
    return this.workflowNodePreviewService.previewNodeBindings(dto);
  }

  /**
   * 自然语言参数解析接口
   * 将用户输入的一句话需求转换为符合工作流参数定义的结构化 JSON
   */
  @Post(':id/smart-parse-params')
  async smartParseParams(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { userInput: string; paramSchema?: Record<string, unknown> },
  ): Promise<{ params: Record<string, unknown>; confidence: string; reasoning: string }> {
    const { userInput, paramSchema } = body;
    if (!userInput?.trim()) {
      throw new BadRequestException('userInput 不能为空');
    }

    try {
      // Resolve system model config (active provider)
      const allConfigs = await this.configService.getAllAIModelConfigs();
      // Prioritize the user-marked default config, fallback to first active
      const modelConfig =
        allConfigs.find((c) => c.isDefault && c.isActive) ||
        allConfigs.find((c) => c.isActive) ||
        allConfigs[0];
      if (!modelConfig) {
        throw new BadRequestException('未配置 AI 模型，请联系管理员');
      }

      const provider = this.aiProviderFactory.getProvider(modelConfig.provider as AIProvider);
      if (!provider.generateChat) {
        throw new BadRequestException('配置的 AI Provider 不支持结构化对话，请更换主模型');
      }

      const schemaDescription = paramSchema
        ? `\n参数定义 Schema：\n${JSON.stringify(paramSchema, null, 2)}`
        : '';

      const prompt = `你是一个智能参数提取助手。根据用户的自然语言描述，提取并填充工作流运行所需的参数。
${schemaDescription}

用户输入："${userInput}"

请以 JSON 格式输出，结构如下：
{
  "params": { <参数名>: <参数值> },
  "confidence": "high|medium|low",
  "reasoning": "简短说明提取依据"
}

只输出 JSON，不要其他文字。`;

      const result = await provider.generateChat(
        [{ role: 'user', content: prompt }],
        this.aiModelService.buildAIRequestOptions({
          provider: modelConfig.provider as AIProvider,
          config: modelConfig,
          modelName: modelConfig.modelName || 'gpt-3.5-turbo',
          apiKey: this.aiModelService.resolveApiKey(modelConfig, this.aiModelService.apiKey),
          apiUrl:
            this.aiModelService.resolveApiUrl(modelConfig, this.aiModelService.apiUrl) || undefined,
          maxTokens: 512,
          temperature: 0.1,
        }),
      );

      const rawText = result.content?.trim() ?? '{}';
      let jsonStr = rawText;

      // 提取 Markdown 代码块中的内容
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (jsonMatch && jsonMatch[1]) {
        jsonStr = jsonMatch[1].trim();
      } else {
        // 兜底：尝试截取首尾的 { 和 }
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = rawText.substring(firstBrace, lastBrace + 1);
        }
      }

      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseErr) {
        this.logger.error(`Failed to parse AI JSON output: ${jsonStr}`, parseErr);
        throw new Error('AI 返回的格式不正确，无法解析为 JSON');
      }
      return {
        params:
          parsed.params && typeof parsed.params === 'object'
            ? (parsed.params as Record<string, unknown>)
            : {},
        confidence: typeof parsed.confidence === 'string' ? parsed.confidence : 'low',
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.error('Smart parse params failed', error);
      throw new BadRequestException(`AI 解析失败: ${message}`);
    }
  }
}
