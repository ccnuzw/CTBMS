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
  BatchSubmitPriceDto,
} from './dto';
import { SubmissionStatus, PriceReviewStatus, PriceInputMethod } from '@packages/types';

@Injectable()
export class PriceSubmissionService {
  constructor(private prisma: PrismaService) { }

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
    if (!submittedById) {
      throw new BadRequestException('User ID is required');
    }

    // 1. 检查任务关联 (taskId 必须唯一)
    if (dto.taskId) {
      const existingTaskSubmission = await this.prisma.priceSubmission.findUnique({
        where: { taskId: dto.taskId },
      });

      if (existingTaskSubmission) {
        if (existingTaskSubmission.status === SubmissionStatus.REJECTED) {
          // 如果之前的提交被拒绝，解除任务关联，允许重新提交
          await this.prisma.priceSubmission.update({
            where: { id: existingTaskSubmission.id },
            data: { taskId: null },
          });
        } else {
          // 如果已存在有效的关联提交，直接返回
          return this.findOne(existingTaskSubmission.id);
        }
      }
    }

    // 规范化日期为当天的 00:00:00.000
    const effectiveDate = new Date(dto.effectiveDate);
    effectiveDate.setHours(0, 0, 0, 0);

    // 2. 检查是否已存在同一天同一采集点的批次
    const existing = await this.prisma.priceSubmission.findFirst({
      where: {
        collectionPointId: dto.collectionPointId,
        submittedById,
        effectiveDate: effectiveDate,
        status: { not: SubmissionStatus.REJECTED },
      },
    });

    if (existing) {
      // 返回现有批次
      return this.findOne(existing.id);
    }

    // 3. 创建新批次
    return this.prisma.priceSubmission.create({
      data: {
        batchCode: this.generateBatchCode(),
        submittedById,
        collectionPointId: dto.collectionPointId,
        effectiveDate: effectiveDate,
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

    try {
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
    } catch (error: any) {
      // P2002 is Prisma's unique constraint violation code
      if (error.code === 'P2002') {
        throw new BadRequestException(
          `该品种(${dto.commodity})在当日(${submission.effectiveDate.toISOString().split('T')[0]})已有${dto.subType}数据，请勿重复填报`
        );
      }
      throw error;
    }
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

    // 查找最近可用的数据 (最多向前追溯7天)
    const effectiveDate = new Date(submission.effectiveDate);
    const lookbackDate = new Date(effectiveDate);
    lookbackDate.setDate(lookbackDate.getDate() - 7);

    // Find the most recent date that has data
    const lastAvailableEntry = await this.prisma.priceData.findFirst({
      where: {
        collectionPointId: submission.collectionPointId,
        effectiveDate: {
          lt: effectiveDate,
          gte: lookbackDate,
        },
        reviewStatus: { in: [PriceReviewStatus.APPROVED, PriceReviewStatus.PENDING] },
      },
      orderBy: { effectiveDate: 'desc' },
    });

    if (!lastAvailableEntry) {
      throw new NotFoundException('近7日内未找到可复制的数据');
    }

    const lastDate = lastAvailableEntry.effectiveDate;

    const sourceData = await this.prisma.priceData.findMany({
      where: {
        collectionPointId: submission.collectionPointId,
        effectiveDate: lastDate,
        reviewStatus: { in: [PriceReviewStatus.APPROVED, PriceReviewStatus.PENDING] },
      },
    });

    if (sourceData.length === 0) {
      throw new NotFoundException('未找到可复制的数据');
    }

    // 复制数据
    const results = [];
    for (const data of sourceData) {
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
          note: '复制自近期数据',
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
  async getCollectionPointPriceHistory(collectionPointId: string, days: number = 7, commodity?: string) {
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - days);

    const where: any = {
      collectionPointId,
      effectiveDate: { gte: startDate },
      reviewStatus: { in: [PriceReviewStatus.APPROVED, PriceReviewStatus.PENDING] },
    };

    if (commodity) {
      where.commodity = commodity;
    }

    return this.prisma.priceData.findMany({
      where,
      orderBy: { effectiveDate: 'asc' },
      select: {
        effectiveDate: true,
        price: true,
        commodity: true,
        subType: true,
        grade: true,
        moisture: true,
        bulkDensity: true,
        inventory: true,
        note: true,
        sourceType: true,
        geoLevel: true,
      },
    });
  }
  /**
   * 批量提交价格 (跨采集点)
   */
  async batchSubmit(dto: BatchSubmitPriceDto, submittedById: string) {
    // 1. 按采集点分组
    const entriesByPoint = new Map<string, typeof dto.entries>();
    for (const entry of dto.entries) {
      if (!entriesByPoint.has(entry.collectionPointId)) {
        entriesByPoint.set(entry.collectionPointId, []);
      }
      entriesByPoint.get(entry.collectionPointId)!.push(entry);
    }

    const results = {
      totalPoints: entriesByPoint.size,
      successPoints: 0,
      failedPoints: 0,
      results: [] as any[],
    };

    // 2. 逐个采集点处理
    for (const [pointId, entries] of entriesByPoint) {
      try {
        // 2.1 创建或获取批次
        const submission = await this.create({
          collectionPointId: pointId,
          effectiveDate: dto.effectiveDate || new Date(),
        }, submittedById);

        // 2.2 添加条目
        const addedEntries = [];
        for (const entry of entries) {
          // Reuse addEntry logic
          const result = await this.addEntry(submission.id, {
            ...entry,
            // Ensure defaults
            subType: entry.subType || 'LISTED',
            sourceType: entry.sourceType || 'ENTERPRISE',
            geoLevel: entry.geoLevel || 'ENTERPRISE',
          }, submittedById);
          addedEntries.push(result);
        }

        // 2.3 提交批次
        if (addedEntries.length > 0) {
          await this.submit(submission.id);
        }

        results.successPoints++;
        results.results.push({ pointId, success: true, count: addedEntries.length });

      } catch (error: any) {
        results.failedPoints++;
        results.results.push({ pointId, success: false, error: error.message });
      }
    }

    return results;
  }
}
