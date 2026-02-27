import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type {
  CreateTemplateCatalogDto,
  UpdateTemplateCatalogDto,
  TemplateCatalogQueryDto,
  CopyTemplateDto,
  DataConnectorQuickStartTemplateDto,
  DataConnectorSourceDomain,
  TemplateCatalogQuickstartBusinessTemplateDto,
  TemplateCatalogQuickstartBusinessTemplatesQueryDto,
} from '@packages/types';
import { Prisma, WorkflowMode, WorkflowUsageMethod } from '@prisma/client';
import { DataConnectorService } from '../data-connector';

@Injectable()
export class TemplateCatalogService {
  private readonly logger = new Logger(TemplateCatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataConnectorService: DataConnectorService,
  ) {}

  /**
   * 从现有工作流版本创建模板
   */
  async create(userId: string, dto: CreateTemplateCatalogDto) {
    const version = await this.prisma.workflowVersion.findUnique({
      where: { id: dto.sourceVersionId },
      include: { workflowDefinition: { select: { ownerUserId: true } } },
    });

    if (!version) {
      throw new NotFoundException('源版本不存在');
    }
    if (version.workflowDefinition.ownerUserId !== userId) {
      throw new BadRequestException('仅能从自己的工作流创建模板');
    }

    const dslSnapshot = version.dslSnapshot as Record<string, unknown>;
    const nodes = Array.isArray(dslSnapshot?.nodes) ? dslSnapshot.nodes : [];
    const edges = Array.isArray(dslSnapshot?.edges) ? dslSnapshot.edges : [];

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    return this.prisma.templateCatalog.create({
      data: {
        templateCode: dto.templateCode,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        tags: (dto.tags as Prisma.InputJsonValue) ?? [],
        coverImageUrl: dto.coverImageUrl,
        dslSnapshot: dslSnapshot as Prisma.InputJsonValue,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        authorUserId: userId,
        authorName: user?.name ?? null,
      },
    });
  }

  /**
   * 查询模板列表（公开模板市场）
   */
  async findMany(query: TemplateCatalogQueryDto) {
    const where: Prisma.TemplateCatalogWhereInput = {
      status: 'PUBLISHED',
    };

    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status;
    if (query.isOfficial !== undefined) where.isOfficial = query.isOfficial;
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword, mode: 'insensitive' } },
        { templateCode: { contains: query.keyword, mode: 'insensitive' } },
        { description: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [data, total] = await Promise.all([
      this.prisma.templateCatalog.findMany({
        where,
        orderBy: [{ isOfficial: 'desc' }, { usageCount: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.templateCatalog.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /**
   * 查询我的模板
   */
  async findMyTemplates(userId: string, query: TemplateCatalogQueryDto) {
    const where: Prisma.TemplateCatalogWhereInput = {
      authorUserId: userId,
    };

    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status;
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword, mode: 'insensitive' } },
        { templateCode: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [data, total] = await Promise.all([
      this.prisma.templateCatalog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.templateCatalog.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string, userId?: string) {
    const template = await this.prisma.templateCatalog.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('模板不存在');
    // 非发布状态的模板只允许作者查看
    if (template.status !== 'PUBLISHED' && template.authorUserId !== userId) {
      throw new NotFoundException('模板不存在');
    }
    return template;
  }

  async update(userId: string, id: string, dto: UpdateTemplateCatalogDto) {
    const template = await this.prisma.templateCatalog.findFirst({
      where: { id, authorUserId: userId },
    });
    if (!template) throw new NotFoundException('模板不存在或无权限');

    return this.prisma.templateCatalog.update({
      where: { id },
      data: {
        ...dto,
        tags: dto.tags ? (dto.tags as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async publish(userId: string, id: string) {
    const template = await this.prisma.templateCatalog.findFirst({
      where: { id, authorUserId: userId },
    });
    if (!template) throw new NotFoundException('模板不存在或无权限');
    if (template.status === 'PUBLISHED') {
      throw new BadRequestException('模板已发布');
    }

    return this.prisma.templateCatalog.update({
      where: { id },
      data: { status: 'PUBLISHED' },
    });
  }

  async archive(userId: string, id: string) {
    const template = await this.prisma.templateCatalog.findFirst({
      where: { id, authorUserId: userId },
    });
    if (!template) throw new NotFoundException('模板不存在或无权限');

    return this.prisma.templateCatalog.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  }

  async remove(userId: string, id: string) {
    const template = await this.prisma.templateCatalog.findFirst({
      where: { id, authorUserId: userId },
    });
    if (!template) throw new NotFoundException('模板不存在或无权限');

    await this.prisma.templateCatalog.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * 复制模板到私有工作流空间
   */
  async copyToWorkspace(userId: string, dto: CopyTemplateDto) {
    const template = await this.prisma.templateCatalog.findUnique({
      where: { id: dto.templateId },
    });
    if (!template || template.status !== 'PUBLISHED') {
      throw new NotFoundException('模板不存在或未发布');
    }

    const dslSnapshot = template.dslSnapshot as Record<string, unknown>;
    const workflowId = dto.newWorkflowId ?? `wf-copy-${Date.now()}`;
    const name = dto.newName ?? `${template.name} (副本)`;

    // 创建工作流定义
    const definition = await this.prisma.workflowDefinition.create({
      data: {
        workflowId,
        name,
        description: template.description,
        ownerUserId: userId,
        templateSource: 'COPIED',
        mode: (dslSnapshot.mode as WorkflowMode) || 'LINEAR',
        usageMethod: (dslSnapshot.usageMethod as WorkflowUsageMethod) || 'HEADLESS',
      },
    });

    // 创建初始版本
    await this.prisma.workflowVersion.create({
      data: {
        workflowDefinitionId: definition.id,
        versionCode: 'v1.0.0',
        dslSnapshot: dslSnapshot as Prisma.InputJsonValue,
        status: 'DRAFT',
        createdByUserId: userId,
      },
    });

    // 增加使用计数
    await this.prisma.templateCatalog.update({
      where: { id: template.id },
      data: { usageCount: { increment: 1 } },
    });

    this.logger.log(`模板 ${template.templateCode} 被用户 ${userId} 复制到工作流 ${workflowId}`);

    return definition;
  }

  getQuickstartBusinessTemplates(query: TemplateCatalogQuickstartBusinessTemplatesQueryDto) {
    const connectorTemplateList = this.dataConnectorService.getQuickStartTemplates({});
    const connectorTemplateMap = new Map<
      DataConnectorSourceDomain,
      DataConnectorQuickStartTemplateDto
    >(connectorTemplateList.data.map((item) => [item.sourceDomain, item]));

    const baseTemplates: Array<
      Omit<
        TemplateCatalogQuickstartBusinessTemplateDto,
        'connectorTemplates' | 'connectorCreateDrafts'
      >
    > = [
      {
        code: 'WEEKLY_MARKET_REVIEW',
        name: '周度市场复盘',
        description: '自动聚合现货、期货和市场事件，输出周度价格走势、基差变化和关键驱动因素复盘。',
        category: 'REPORTING',
        tags: ['weekly', 'report', 'spot', 'futures'],
        kpiFocus: ['weekly_price_change', 'basis_change', 'signal_hit_rate'],
        recommendedConnectors: ['INTERNAL_BUSINESS', 'PUBLIC_MARKET_INFO', 'FUTURES_MARKET'],
        outputArtifacts: ['markdown_report', 'trend_snapshot', 'risk_watchlist'],
      },
      {
        code: 'PRICE_ALERT_MONITORING',
        name: '价格异动预警',
        description: '按品类和区域监控价格与波动阈值，触发告警并附带证据链和建议动作。',
        category: 'MONITORING',
        tags: ['alert', 'monitoring', 'price'],
        kpiFocus: ['alert_precision', 'alert_recall', 'false_positive_rate'],
        recommendedConnectors: ['PUBLIC_MARKET_INFO', 'FUTURES_MARKET'],
        outputArtifacts: ['alert_event', 'evidence_bundle', 'recommended_actions'],
      },
      {
        code: 'WEATHER_LOGISTICS_IMPACT',
        name: '天气与物流影响评估',
        description: '融合天气、运费与库存变化，评估未来供需冲击并形成风险等级。',
        category: 'ANALYSIS',
        tags: ['weather', 'logistics', 'supply-risk'],
        kpiFocus: ['supply_risk_index', 'delivery_delay_risk', 'inventory_pressure'],
        recommendedConnectors: ['WEATHER', 'LOGISTICS', 'INTERNAL_BUSINESS'],
        outputArtifacts: ['impact_scorecard', 'risk_map', 'decision_brief'],
      },
      {
        code: 'STRATEGY_BACKTEST',
        name: '策略回测与解释',
        description: '对采购/套保策略做历史回测，输出收益、回撤与关键场景解释。',
        category: 'RISK_MANAGEMENT',
        tags: ['backtest', 'strategy', 'hedging'],
        kpiFocus: ['pnl', 'max_drawdown', 'win_rate'],
        recommendedConnectors: ['INTERNAL_BUSINESS', 'FUTURES_MARKET', 'PUBLIC_MARKET_INFO'],
        outputArtifacts: ['backtest_report', 'scenario_breakdown', 'strategy_adjustment_plan'],
      },
    ];

    const templates: TemplateCatalogQuickstartBusinessTemplateDto[] = baseTemplates.map((item) => {
      const connectorTemplates = item.recommendedConnectors
        .map((sourceDomain) => connectorTemplateMap.get(sourceDomain as DataConnectorSourceDomain))
        .filter((template): template is DataConnectorQuickStartTemplateDto => !!template);

      const connectorCreateDrafts: Array<
        DataConnectorQuickStartTemplateDto & {
          connectorCode: string;
          connectorName: string;
          ownerType: 'SYSTEM' | 'ADMIN';
        }
      > = connectorTemplates.map((template) => ({
        ...template,
        connectorCode: this.buildConnectorDraftCode(item.code, template.sourceDomain),
        connectorName: this.buildConnectorDraftName(item.name, template.sourceDomain),
        ownerType: 'SYSTEM',
      }));

      return {
        ...item,
        connectorTemplates,
        connectorCreateDrafts,
      };
    });

    const keyword = query.keyword?.trim().toLowerCase();
    const filtered =
      keyword && keyword.length > 0
        ? templates.filter(
            (item) =>
              item.code.toLowerCase().includes(keyword) ||
              item.name.toLowerCase().includes(keyword) ||
              item.description.toLowerCase().includes(keyword) ||
              item.tags.some((tag: string) => tag.toLowerCase().includes(keyword)),
          )
        : templates;

    return {
      templates: filtered,
      total: filtered.length,
    };
  }

  private buildConnectorDraftCode(templateCode: string, sourceDomain: DataConnectorSourceDomain) {
    const raw = `${templateCode}_${sourceDomain}`.toUpperCase();
    const normalized = raw.replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_');
    const sliced = normalized.slice(0, 120);
    return sliced.length >= 3 ? sliced : `${sliced}__DRAFT`;
  }

  private buildConnectorDraftName(templateName: string, sourceDomain: DataConnectorSourceDomain) {
    const labels: Record<DataConnectorSourceDomain, string> = {
      INTERNAL_BUSINESS: '内部业务数据',
      PUBLIC_MARKET_INFO: '公开市场情报',
      FUTURES_MARKET: '期货行情',
      WEATHER: '天气数据',
      LOGISTICS: '物流数据',
    };
    return `${templateName}-${labels[sourceDomain]}`.slice(0, 120);
  }
}
