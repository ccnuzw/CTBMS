import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type {
  CreateTemplateCatalogDto,
  UpdateTemplateCatalogDto,
  TemplateCatalogQueryDto,
  CopyTemplateDto,
} from '@packages/types';
import { Prisma, WorkflowMode, WorkflowUsageMethod } from '@prisma/client';

@Injectable()
export class TemplateCatalogService {
  private readonly logger = new Logger(TemplateCatalogService.name);

  constructor(private readonly prisma: PrismaService) { }

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
}
