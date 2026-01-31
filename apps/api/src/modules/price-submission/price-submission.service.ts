import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreatePriceSubmissionDto,
  UpdatePriceSubmissionDto,
  QueryPriceSubmissionDto,
  SubmitPriceEntryDto,
  BulkSubmitPriceEntriesDto,
  ReviewPriceDataDto,
  BatchReviewPriceDataDto,
  ReviewPriceSubmissionDto,
} from './dto';
import { SubmissionStatus, PriceReviewStatus, PriceInputMethod } from '@packages/types';

@Injectable()
export class PriceSubmissionService {
  constructor(private prisma: PrismaService) {}

  /**
   * 生成批次编号
   */
  private generateBatchCode(): string {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `PS-${dateStr}-${random}`;
  }

  /**
   * 创建填报批次
   */
  async create(dto: CreatePriceSubmissionDto, submittedById: string) {
    // 检查是否已存在同一天同一采集点的批次
    const existing = await this.prisma.priceSubmission.findFirst({
      where: {
        collectionPointId: dto.collectionPointId,
        submittedById,
        effectiveDate: dto.effectiveDate,
        status: { not: SubmissionStatus.REJECTED },
      },
    });

    if (existing) {
      // 返回现有批次
      return this.findOne(existing.id);
    }

    return this.prisma.priceSubmission.create({
      data: {
        batchCode: this.generateBatchCode(),
        submittedById,
        collectionPointId: dto.collectionPointId,
        effectiveDate: dto.effectiveDate,
        taskId: dto.taskId,
        status: SubmissionStatus.DRAFT,
      },
      include: {
        submittedBy: { select: { id: true, name: true, username: true } },
        collectionPoint: { select: { id: true, code: true, name: true, type: true } },
      },
    });
  }

  /**
   * 查询填报批次列表
   */
  async findAll(query: QueryPriceSubmissionDto) {
    const { submittedById, collectionPointId, status, effectiveDateStart, effectiveDateEnd, page, pageSize } = query;

    const where: any = {};
    if (submittedById) where.submittedById = submittedById;
    if (collectionPointId) where.collectionPointId = collectionPointId;
    if (status) where.status = status;
    if (effectiveDateStart || effectiveDateEnd) {
      where.effectiveDate = {};
      if (effectiveDateStart) where.effectiveDate.gte = effectiveDateStart;
      if (effectiveDateEnd) where.effectiveDate.lte = effectiveDateEnd;
    }

    const [data, total] = await Promise.all([
      this.prisma.priceSubmission.findMany({
        where,
        include: {
          submittedBy: { select: { id: true, name: true, username: true } },
          collectionPoint: { select: { id: true, code: true, name: true, type: true } },
          _count: { select: { priceData: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.priceSubmission.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  /**
   * 获取填报批次详情
   */
  async findOne(id: string) {
    const submission = await this.prisma.priceSubmission.findUnique({
      where: { id },
      include: {
        submittedBy: { select: { id: true, name: true, username: true } },
        collectionPoint: { select: { id: true, code: true, name: true, type: true, commodities: true, priceSubTypes: true } },
        priceData: {
          orderBy: { createdAt: 'desc' },
        },
        task: { select: { id: true, title: true, type: true, deadline: true, status: true } },
      },
    });

    if (!submission) {
      throw new NotFoundException('填报批次不存在');
    }

    return submission;
  }

  /**
   * 添加价格条目
   */
  async addEntry(submissionId: string, dto: SubmitPriceEntryDto, authorId: string) {
    const submission = await this.findOne(submissionId);

    if (submission.status !== SubmissionStatus.DRAFT) {
      throw new BadRequestException('只能在草稿状态下添加条目');
    }

    const priceData = await this.prisma.priceData.create({
      data: {
        submissionId,
        collectionPointId: submission.collectionPointId,
        effectiveDate: submission.effectiveDate,
        location: submission.collectionPoint.name,
        commodity: dto.commodity,
        price: dto.price,
        subType: dto.subType as any,
        sourceType: dto.sourceType as any,
        geoLevel: dto.geoLevel as any,
        grade: dto.grade,
        moisture: dto.moisture,
        bulkDensity: dto.bulkDensity,
        inventory: dto.inventory,
        note: dto.note,
        authorId,
        inputMethod: PriceInputMethod.MANUAL_ENTRY,
        reviewStatus: PriceReviewStatus.PENDING,
      },
    });

    // 更新批次条目数
    await this.prisma.priceSubmission.update({
      where: { id: submissionId },
      data: { itemCount: { increment: 1 } },
    });

    return priceData;
  }

  /**
   * 批量添加价格条目
   */
  async addEntries(submissionId: string, dto: BulkSubmitPriceEntriesDto, authorId: string) {
    const results = [];
    for (const entry of dto.entries) {
      const result = await this.addEntry(submissionId, entry, authorId);
      results.push(result);
    }
    return results;
  }

  /**
   * 更新价格条目
   */
  async updateEntry(submissionId: string, entryId: string, dto: SubmitPriceEntryDto) {
    const submission = await this.findOne(submissionId);

    if (submission.status !== SubmissionStatus.DRAFT) {
      throw new BadRequestException('只能在草稿状态下修改条目');
    }

    return this.prisma.priceData.update({
      where: { id: entryId },
      data: {
        commodity: dto.commodity,
        price: dto.price,
        subType: dto.subType as any,
        sourceType: dto.sourceType as any,
        geoLevel: dto.geoLevel as any,
        grade: dto.grade,
        moisture: dto.moisture,
        bulkDensity: dto.bulkDensity,
        inventory: dto.inventory,
        note: dto.note,
      },
    });
  }

  /**
   * 删除价格条目
   */
  async removeEntry(submissionId: string, entryId: string) {
    const submission = await this.findOne(submissionId);

    if (submission.status !== SubmissionStatus.DRAFT) {
      throw new BadRequestException('只能在草稿状态下删除条目');
    }

    await this.prisma.priceData.delete({ where: { id: entryId } });

    // 更新批次条目数
    await this.prisma.priceSubmission.update({
      where: { id: submissionId },
      data: { itemCount: { decrement: 1 } },
    });

    return { success: true };
  }

  /**
   * 提交批次审核
   */
  async submit(submissionId: string) {
    const submission = await this.findOne(submissionId);

    if (submission.status !== SubmissionStatus.DRAFT) {
      throw new BadRequestException('只能提交草稿状态的批次');
    }

    if (submission.itemCount === 0) {
      throw new BadRequestException('请至少添加一条价格数据');
    }

    const result = await this.prisma.priceSubmission.update({
      where: { id: submissionId },
      data: {
        status: SubmissionStatus.SUBMITTED,
        submittedAt: new Date(),
      },
      include: {
        submittedBy: { select: { id: true, name: true, username: true } },
        collectionPoint: { select: { id: true, code: true, name: true, type: true } },
      },
    });

    // 如果关联了任务，自动完成任务
    if (submission.taskId) {
      await this.prisma.intelTask.update({
        where: { id: submission.taskId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          priceSubmissionId: submissionId,
        },
      });
    }

    return result;
  }

  /**
   * 审核单条价格数据
   */
  async reviewPriceData(priceId: string, dto: ReviewPriceDataDto, reviewedById: string) {
    const priceData = await this.prisma.priceData.findUnique({
      where: { id: priceId },
      include: { submission: true },
    });

    if (!priceData) {
      throw new NotFoundException('价格数据不存在');
    }

    const result = await this.prisma.priceData.update({
      where: { id: priceId },
      data: {
        reviewStatus: dto.status,
        reviewedById,
        reviewedAt: new Date(),
        reviewNote: dto.note,
      },
    });

    // 更新批次审核计数
    if (priceData.submissionId) {
      await this.updateSubmissionApprovalCount(priceData.submissionId);
    }

    return result;
  }

  /**
   * 批量审核价格数据
   */
  async batchReviewPriceData(dto: BatchReviewPriceDataDto, reviewedById: string) {
    const results = await Promise.all(
      dto.priceIds.map((priceId) =>
        this.reviewPriceData(priceId, { status: dto.status, note: dto.note }, reviewedById),
      ),
    );
    return results;
  }

  /**
   * 审核整个填报批次
   */
  async reviewSubmission(submissionId: string, dto: ReviewPriceSubmissionDto, reviewedById: string) {
    const submission = await this.findOne(submissionId);

    if (submission.status === SubmissionStatus.DRAFT) {
      throw new BadRequestException('批次尚未提交');
    }

    const newStatus = dto.action === 'approve_all' ? PriceReviewStatus.APPROVED : PriceReviewStatus.REJECTED;

    // 批量更新所有价格数据
    await this.prisma.priceData.updateMany({
      where: { submissionId },
      data: {
        reviewStatus: newStatus,
        reviewedById,
        reviewedAt: new Date(),
        reviewNote: dto.note,
      },
    });

    // 更新批次状态
    const submissionStatus = dto.action === 'approve_all' ? SubmissionStatus.APPROVED : SubmissionStatus.REJECTED;
    const approvedCount = dto.action === 'approve_all' ? submission.itemCount : 0;

    return this.prisma.priceSubmission.update({
      where: { id: submissionId },
      data: {
        status: submissionStatus,
        approvedCount,
      },
      include: {
        submittedBy: { select: { id: true, name: true, username: true } },
        collectionPoint: { select: { id: true, code: true, name: true, type: true } },
      },
    });
  }

  /**
   * 更新批次审核通过数
   */
  private async updateSubmissionApprovalCount(submissionId: string) {
    const counts = await this.prisma.priceData.groupBy({
      by: ['reviewStatus'],
      where: { submissionId },
      _count: true,
    });

    const approvedCount = counts.find((c) => c.reviewStatus === PriceReviewStatus.APPROVED)?._count || 0;
    const totalCount = counts.reduce((acc, c) => acc + c._count, 0);
    const pendingCount = counts.find((c) => c.reviewStatus === PriceReviewStatus.PENDING)?._count || 0;

    let status: SubmissionStatus;
    if (pendingCount > 0) {
      status = approvedCount > 0 ? SubmissionStatus.PARTIAL_APPROVED : SubmissionStatus.SUBMITTED;
    } else if (approvedCount === totalCount) {
      status = SubmissionStatus.APPROVED;
    } else if (approvedCount === 0) {
      status = SubmissionStatus.REJECTED;
    } else {
      status = SubmissionStatus.PARTIAL_APPROVED;
    }

    await this.prisma.priceSubmission.update({
      where: { id: submissionId },
      data: { approvedCount, status },
    });
  }

  /**
   * 获取待审核列表
   */
  async getPendingReviews(query: { page?: number; pageSize?: number }) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;

    const where = { status: SubmissionStatus.SUBMITTED };

    const [data, total] = await Promise.all([
      this.prisma.priceSubmission.findMany({
        where,
        include: {
          submittedBy: { select: { id: true, name: true, username: true } },
          collectionPoint: { select: { id: true, code: true, name: true, type: true } },
          priceData: true,
        },
        orderBy: { submittedAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.priceSubmission.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  /**
   * 获取填报统计
   */
  async getStatistics(userId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const where = userId ? { submittedById: userId } : {};

    const [todayPending, todayCompleted, weekCompleted, monthCompleted, pendingReview, rejected] = await Promise.all([
      // 今日待填报（有待办任务）
      userId
        ? this.prisma.intelTask.count({
            where: {
              assigneeId: userId,
              status: 'PENDING',
              type: { in: ['PRICE_COLLECTION', 'INVENTORY_CHECK'] },
              deadline: { gte: today },
            },
          })
        : 0,
      // 今日已完成
      this.prisma.priceSubmission.count({
        where: {
          ...where,
          effectiveDate: { gte: today },
          status: { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.APPROVED, SubmissionStatus.PARTIAL_APPROVED] },
        },
      }),
      // 本周已完成
      this.prisma.priceSubmission.count({
        where: {
          ...where,
          effectiveDate: { gte: weekStart },
          status: { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.APPROVED, SubmissionStatus.PARTIAL_APPROVED] },
        },
      }),
      // 本月已完成
      this.prisma.priceSubmission.count({
        where: {
          ...where,
          effectiveDate: { gte: monthStart },
          status: { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.APPROVED, SubmissionStatus.PARTIAL_APPROVED] },
        },
      }),
      // 待审核
      this.prisma.priceSubmission.count({
        where: { ...where, status: SubmissionStatus.SUBMITTED },
      }),
      // 已拒绝
      this.prisma.priceSubmission.count({
        where: { ...where, status: SubmissionStatus.REJECTED },
      }),
    ]);

    return {
      todayPending,
      todayCompleted,
      weekCompleted,
      monthCompleted,
      pendingReview,
      rejectedCount: rejected,
    };
  }

  /**
   * 复制昨日数据
   */
  async copyYesterdayData(submissionId: string, authorId: string) {
    const submission = await this.findOne(submissionId);

    if (submission.status !== SubmissionStatus.DRAFT) {
      throw new BadRequestException('只能在草稿状态下复制数据');
    }

    // 查找昨日数据
    const yesterday = new Date(submission.effectiveDate);
    yesterday.setDate(yesterday.getDate() - 1);

    const yesterdayData = await this.prisma.priceData.findMany({
      where: {
        collectionPointId: submission.collectionPointId,
        effectiveDate: yesterday,
        reviewStatus: PriceReviewStatus.APPROVED,
      },
    });

    if (yesterdayData.length === 0) {
      throw new NotFoundException('未找到昨日数据');
    }

    // 复制数据
    const results = [];
    for (const data of yesterdayData) {
      const entry = await this.addEntry(
        submissionId,
        {
          commodity: data.commodity,
          price: Number(data.price),
          subType: data.subType,
          sourceType: data.sourceType,
          geoLevel: data.geoLevel,
          grade: data.grade || undefined,
          moisture: data.moisture ? Number(data.moisture) : undefined,
          bulkDensity: data.bulkDensity || undefined,
          inventory: data.inventory || undefined,
          note: '复制自昨日数据',
        },
        authorId,
      );
      results.push(entry);
    }

    return results;
  }

  /**
   * 获取采集点历史价格
   */
  async getCollectionPointPriceHistory(collectionPointId: string, days: number = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.prisma.priceData.findMany({
      where: {
        collectionPointId,
        effectiveDate: { gte: startDate },
        reviewStatus: PriceReviewStatus.APPROVED,
      },
      orderBy: { effectiveDate: 'asc' },
      select: {
        effectiveDate: true,
        price: true,
        commodity: true,
        subType: true,
      },
    });
  }
}
