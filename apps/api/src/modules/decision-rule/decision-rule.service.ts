import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreateDecisionRuleDto,
  CreateDecisionRulePackDto,
  DecisionRulePackQueryDto,
  PublishDecisionRulePackDto,
  UpdateDecisionRuleDto,
  UpdateDecisionRulePackDto,
  SmartParseRuleASTDto,
  AIProvider,
} from '@packages/types';
import { PrismaService } from '../../prisma';
import { ConfigService } from '../config/config.service';
import { AIModelService } from '../ai/ai-model.service';
import { AIProviderFactory } from '../ai/providers/provider.factory';
import { AIRequestOptions } from '../ai/providers/base.provider';

@Injectable()
export class DecisionRuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly aiModelService: AIModelService,
    private readonly aiProviderFactory: AIProviderFactory,
  ) {}

  async createPack(ownerUserId: string, dto: CreateDecisionRulePackDto) {
    const existing = await this.prisma.decisionRulePack.findUnique({
      where: { rulePackCode: dto.rulePackCode },
    });
    if (existing) {
      throw new BadRequestException(`rulePackCode 已存在: ${dto.rulePackCode}`);
    }

    const createData = {
      rulePackCode: dto.rulePackCode,
      name: dto.name,
      description: dto.description ?? null,
      applicableScopes: this.normalizeApplicableScopes(dto.applicableScopes),
      ruleLayer: this.normalizeRuleLayer(dto.ruleLayer),
      ownerType: this.inferPackOwnerType(dto.templateSource, dto.ownerType),
      ownerUserId,
      templateSource: dto.templateSource,
      priority: dto.priority,
      conditionAST: this.toNullableJsonValue(dto.conditionAST),
      rules: dto.rules?.length
        ? {
            create: dto.rules.map((rule) => ({
              ruleCode: rule.ruleCode,
              name: rule.name,
              description: rule.description ?? null,
              fieldPath: rule.fieldPath,
              operator: rule.operator,
              expectedValue: this.toNullableJsonValue(rule.expectedValue),
              weight: rule.weight,
              priority: rule.priority,
            })),
          }
        : undefined,
    } as Record<string, unknown>;

    return this.prisma.decisionRulePack.create({
      data: createData as unknown as Prisma.DecisionRulePackCreateInput,
      include: {
        rules: {
          where: { isActive: true },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
  }

  async findAll(ownerUserId: string, query: DecisionRulePackQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.buildAccessibleWhere(ownerUserId, query);

    const [data, total] = await Promise.all([
      this.prisma.decisionRulePack.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.decisionRulePack.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(ownerUserId: string, id: string) {
    const pack = await this.prisma.decisionRulePack.findFirst({
      where: {
        id,
        OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
      },
      include: {
        rules: {
          where: { isActive: true },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!pack) {
      throw new NotFoundException('规则包不存在或无权限访问');
    }
    return pack;
  }

  async updatePack(ownerUserId: string, id: string, dto: UpdateDecisionRulePackDto) {
    await this.ensureEditablePack(ownerUserId, id);
    const data = {
      name: dto.name,
      description: dto.description,
      applicableScopes: dto.applicableScopes
        ? this.normalizeApplicableScopes(dto.applicableScopes)
        : undefined,
      ruleLayer: dto.ruleLayer ? this.normalizeRuleLayer(dto.ruleLayer) : undefined,
      ownerType: dto.ownerType,
      isActive: dto.isActive,
      priority: dto.priority,
    } as Record<string, unknown>;

    if (Object.prototype.hasOwnProperty.call(dto, 'conditionAST')) {
      data.conditionAST = this.toNullableJsonValue(dto.conditionAST);
    }

    return this.prisma.decisionRulePack.update({
      where: { id },
      data,
    });
  }

  async removePack(ownerUserId: string, id: string) {
    await this.ensureEditablePack(ownerUserId, id);
    return this.prisma.decisionRulePack.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async publishPack(ownerUserId: string, id: string, _dto: PublishDecisionRulePackDto) {
    const dto = _dto;
    await this.ensureEditablePack(ownerUserId, id);
    return this.prisma.decisionRulePack.update({
      where: { id },
      data: {
        version: { increment: 1 },
        isActive: true,
        publishedByUserId: ownerUserId,
        publishedAt: new Date(),
        lastPublishComment: dto.comment?.trim() || null,
      },
    });
  }

  async addRule(ownerUserId: string, packId: string, dto: CreateDecisionRuleDto) {
    await this.ensureEditablePack(ownerUserId, packId);
    const existing = await this.prisma.decisionRule.findFirst({
      where: {
        rulePackId: packId,
        ruleCode: dto.ruleCode,
      },
    });

    if (existing) {
      throw new BadRequestException(`ruleCode 已存在: ${dto.ruleCode}`);
    }

    return this.prisma.decisionRule.create({
      data: {
        rulePackId: packId,
        ruleCode: dto.ruleCode,
        name: dto.name,
        description: dto.description ?? null,
        fieldPath: dto.fieldPath,
        operator: dto.operator,
        expectedValue: this.toNullableJsonValue(dto.expectedValue),
        weight: dto.weight,
        priority: dto.priority,
      },
    });
  }

  async updateRule(
    ownerUserId: string,
    packId: string,
    ruleId: string,
    dto: UpdateDecisionRuleDto,
  ) {
    await this.ensureEditablePack(ownerUserId, packId);
    const existing = await this.prisma.decisionRule.findFirst({
      where: { id: ruleId, rulePackId: packId },
    });
    if (!existing) {
      throw new NotFoundException('规则不存在');
    }

    const data: Prisma.DecisionRuleUpdateInput = {
      name: dto.name,
      description: dto.description,
      fieldPath: dto.fieldPath,
      operator: dto.operator,
      weight: dto.weight,
      priority: dto.priority,
      isActive: dto.isActive,
    };

    if (Object.prototype.hasOwnProperty.call(dto, 'expectedValue')) {
      data.expectedValue = this.toNullableJsonValue(dto.expectedValue);
    }

    return this.prisma.decisionRule.update({
      where: { id: ruleId },
      data,
    });
  }

  async removeRule(ownerUserId: string, packId: string, ruleId: string) {
    await this.ensureEditablePack(ownerUserId, packId);
    const existing = await this.prisma.decisionRule.findFirst({
      where: { id: ruleId, rulePackId: packId },
    });
    if (!existing) {
      throw new NotFoundException('规则不存在');
    }

    return this.prisma.decisionRule.update({
      where: { id: ruleId },
      data: { isActive: false },
    });
  }

  private buildAccessibleWhere(
    ownerUserId: string,
    query: DecisionRulePackQueryDto,
  ): Prisma.DecisionRulePackWhereInput {
    const where: Prisma.DecisionRulePackWhereInput = {
      OR: query.includePublic ? [{ ownerUserId }, { templateSource: 'PUBLIC' }] : [{ ownerUserId }],
    };

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.ruleLayer) {
      where.ruleLayer = query.ruleLayer;
    }

    const keyword = query.keyword?.trim();
    if (keyword) {
      where.AND = [
        {
          OR: [
            { name: { contains: keyword, mode: 'insensitive' } },
            { rulePackCode: { contains: keyword, mode: 'insensitive' } },
          ],
        },
      ];
    }

    return where;
  }

  private async ensureEditablePack(ownerUserId: string, id: string) {
    const pack = await this.prisma.decisionRulePack.findFirst({
      where: {
        id,
        ownerUserId,
      },
    });
    if (!pack) {
      throw new NotFoundException('规则包不存在或无权限编辑');
    }
    return pack;
  }

  private normalizeApplicableScopes(scopes?: string[] | null): string[] {
    if (!scopes || scopes.length === 0) {
      return [];
    }
    const deduped = new Set<string>();
    for (const scope of scopes) {
      if (typeof scope !== 'string') {
        continue;
      }
      const normalized = scope.trim();
      if (!normalized) {
        continue;
      }
      deduped.add(normalized);
    }
    return [...deduped];
  }

  private normalizeRuleLayer(layer?: string | null): string {
    const normalized = (layer || '').trim().toUpperCase();
    if (
      normalized === 'DEFAULT' ||
      normalized === 'INDUSTRY' ||
      normalized === 'EXPERIENCE' ||
      normalized === 'RUNTIME_OVERRIDE'
    ) {
      return normalized;
    }
    return 'DEFAULT';
  }

  private inferPackOwnerType(
    templateSource: string,
    requested?: string,
  ): 'SYSTEM' | 'ADMIN' | 'USER' {
    const normalizedRequested = (requested || '').trim().toUpperCase();
    if (
      normalizedRequested === 'SYSTEM' ||
      normalizedRequested === 'ADMIN' ||
      normalizedRequested === 'USER'
    ) {
      return normalizedRequested;
    }
    return templateSource === 'PUBLIC' ? 'ADMIN' : 'USER';
  }

  private toNullableJsonValue(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return Prisma.JsonNull;
    }
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  async smartParseAst(dto: SmartParseRuleASTDto) {
    const systemPrompt = `你是一个专业的业务规则 AST (高级抽象语法树) 转换助手。
用户会用自然语言描述他们想要的业务校验条件，你需要将这些描述转换为标准 JSON 格式的 AST 结构。

可用的 "字段路径 (fieldPath)" 及其含义限制在以下列表中（优先匹配这部分）：
- parsed.thesis (核心结论)
- parsed.confidence (置信度分数，通常是 0~1 的小数)
- parsed.riskLevel (风险等级，如 LOW, MEDIUM, HIGH, EXTREME)
- parsed.evidence (证据支持)
- recordCount (采集记录数量，整数)
- isFresh (数据新鲜度，布尔值 true/false)
- policyShockScore (政策冲击分数)
- executionWindowOpen (执行窗口状态，布尔值 true/false)
- volatilityTolerance (波动容忍度)
- traderConfidence (交易员置信度)
- emergencyStop (紧急停机，布尔值)
- complianceStatus (合规状态，如 RED, BLOCKED 等)
- marginUsagePct (保证金占用率，百分比)

操作符 (operator) 必须是以下之一：
- EXISTS (存在)
- NOT_EXISTS (不存在)
- EQ (等于)
- NEQ (不等于)
- GT (大于)
- LT (小于)
- GTE (大于等于)
- LTE (小于等于)
- IN (包含于，数组预期值)
- NOT_IN (不包含于，数组预期值)
- CONTAINS (字符串包含)
- NOT_CONTAINS (字符串不包含)
- STARTS_WITH (前缀匹配)
- ENDS_WITH (后缀匹配)
- MATCHES_REGEX (正则匹配)
- BETWEEN (介于区间，如 [min, max])

逻辑组 (logic) 必须是：
- AND (且)
- OR (或)

请返回 JSON 对象格式，其根节点必须包含 root 属性：
{
  "root": {
    "logic": "AND" | "OR",
    "children": [
      {
        "fieldPath": "string",
        "operator": "string",
        "expectedValue": any
      },
      ...或嵌套逻辑组
    ]
  }
}

不要输出任何 Markdown 标记（如 \`\`\`json 等），只需返回纯 JSON 字符串，确保它是可以被 JSON.parse() 解析的。`;

    const userPrompt = `用户的业务规则需求如下：\n\n"${dto.naturalLanguage}"`;

    try {
      const aiConfig = await this.configService.getDefaultAIConfig();
      const currentApiKey = this.aiModelService.resolveApiKey(aiConfig, this.aiModelService.apiKey);
      const currentApiUrl = this.aiModelService.resolveApiUrl(aiConfig, this.aiModelService.apiUrl);
      const currentModelId = aiConfig?.modelName || this.aiModelService.modelId;
      const providerType = (aiConfig?.provider as AIProvider) || 'google';

      if (!currentApiKey) {
        throw new BadRequestException('系统未配置 AI 模型 API Key，无法使用智能生成功能。');
      }

      const provider = this.aiProviderFactory.getProvider(providerType);
      const options: AIRequestOptions = {
        modelName: currentModelId,
        apiKey: currentApiKey,
        apiUrl: currentApiUrl || undefined,
        authType: aiConfig?.authType as AIRequestOptions['authType'],
        headers: this.aiModelService.resolveRecord(aiConfig?.headers),
        queryParams: this.aiModelService.resolveRecord(aiConfig?.queryParams),
        pathOverrides: this.aiModelService.resolveRecord(aiConfig?.pathOverrides),
        modelFetchMode: aiConfig?.modelFetchMode as AIRequestOptions['modelFetchMode'],
        allowUrlProbe: aiConfig?.allowUrlProbe ?? undefined,
        timeoutSeconds: aiConfig?.timeoutSeconds ?? undefined,
        maxRetries: aiConfig?.maxRetries ?? undefined,
        temperature: 0.1, // requires high precision
      };

      const resultText = await provider.generateResponse(systemPrompt, userPrompt, options);

      // Attempt to clean JSON
      let cleanedJson = resultText.trim();
      if (cleanedJson.startsWith('```json')) {
        cleanedJson = cleanedJson.replace(/^```json/, '');
      }
      if (cleanedJson.startsWith('```')) {
        cleanedJson = cleanedJson.replace(/^```/, '');
      }
      if (cleanedJson.endsWith('```')) {
        cleanedJson = cleanedJson.replace(/```$/, '');
      }
      cleanedJson = cleanedJson.trim();

      const parsedObj = JSON.parse(cleanedJson);

      if (
        !parsedObj ||
        !parsedObj.root ||
        !parsedObj.root.logic ||
        !Array.isArray(parsedObj.root.children)
      ) {
        throw new Error('生成的 AST 结构不合法，缺少 root 或其结构有误。');
      }

      return parsedObj;
    } catch (error) {
      throw new BadRequestException(
        `无法解析生成的 AST，请调整描述重试。错误信息: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
