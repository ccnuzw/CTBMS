import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateCollectionPointAllocationDto,
  BatchCreateAllocationDto,
  UpdateCollectionPointAllocationDto,
  QueryCollectionPointAllocationDto,
  AllocationMatrixQueryDto,
} from './dto';

@Injectable()
export class CollectionPointAllocationService {
  constructor(private prisma: PrismaService) {}

  /**
   * 获取分配矩阵数据
   */
  async getAllocationMatrix(query: AllocationMatrixQueryDto) {
    const { organizationId, departmentId, pointType, keyword, userKeyword, pointKeyword } = query;

    // 性能优化：如果没有筛选条件，不返回数据（避免加载全量数据）
    if (!organizationId && !departmentId && !pointType && !keyword && !userKeyword && !pointKeyword) {
      return {
        points: [],
        users: [],
        stats: {
          totalPoints: 0,
          allocatedPoints: 0,
          unallocatedPoints: 0,
        },
      };
    }

    // 1. 获取符合条件的用户
    const userWhere: any = { status: 'ACTIVE' };
    if (organizationId) userWhere.organizationId = organizationId;
    if (departmentId) userWhere.departmentId = departmentId;

    // 搜索用户：优先使用 userKeyword，其次兼容 keyword
    const searchUserKw = userKeyword || keyword;
    if (searchUserKw) {
      userWhere.OR = [
        { name: { contains: searchUserKw } },
        { username: { contains: searchUserKw } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        name: true,
        organization: { select: { name: true } },
        department: { select: { name: true } },
        _count: {
          select: {
            collectionPointAllocations: { where: { isActive: true } },
            intelTasks: { where: { status: 'PENDING' } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // 2. 获取符合条件的采集点
    const pointWhere: any = { isActive: true };
    if (pointType) pointWhere.type = pointType;

    // 搜索采集点：优先使用 pointKeyword，其次兼容 keyword
    const searchPointKw = pointKeyword || keyword;
    if (searchPointKw) {
      pointWhere.OR = [
        { name: { contains: searchPointKw } },
        { code: { contains: searchPointKw } },
      ];
    }

    const points = await this.prisma.collectionPoint.findMany({
      where: pointWhere,
      select: {
        id: true,
        name: true,
        type: true,
        latitude: true,
        longitude: true,
        allocations: {
          where: { isActive: true },
          select: { userId: true },
        },
      },
      orderBy: { type: 'asc' },
    });

    // 3. 组装矩阵数据
    const matrixPoints = points.map(point => ({
      pointId: point.id,
      pointName: point.name,
      pointType: point.type,
      latitude: point.latitude,
      longitude: point.longitude,
      allocatedUserIds: point.allocations.map(a => a.userId),
      isAllocated: point.allocations.length > 0,
    }));

    const matrixUsers = users.map(user => ({
      id: user.id,
      name: user.name,
      organizationName: user.organization?.name,
      departmentName: user.department?.name,
      assignedPointCount: user._count.collectionPointAllocations,
      pendingTaskCount: user._count.intelTasks,
    }));

    // 4. 计算统计数据
    const stats = {
      totalPoints: points.length,
      allocatedPoints: matrixPoints.filter(p => p.isAllocated).length,
      unallocatedPoints: matrixPoints.filter(p => !p.isAllocated).length,
    };

    return {
      points: matrixPoints,
      users: matrixUsers,
      stats,
    };
  }

  /**
   * 创建单个分配关系
   */
  async create(dto: CreateCollectionPointAllocationDto, assignedById?: string) {
    // 检查是否已存在分配关系
    const existing = await this.prisma.collectionPointAllocation.findUnique({
      where: {
        userId_collectionPointId: {
          userId: dto.userId,
          collectionPointId: dto.collectionPointId,
        },
      },
    });

    if (existing) {
      if (existing.isActive) {
        throw new ConflictException('该用户已分配到此采集点');
      }
      // 如果存在但已停用，重新激活
      return this.prisma.collectionPointAllocation.update({
        where: { id: existing.id },
        data: {
          remark: dto.remark,
          isActive: true,
          assignedById,
          assignedAt: new Date(),
        },
        include: {
          user: { select: { id: true, name: true, username: true, avatar: true } },
          collectionPoint: { select: { id: true, code: true, name: true, type: true, regionCode: true } },
        },
      });
    }

    return this.prisma.collectionPointAllocation.create({
      data: {
        userId: dto.userId,
        collectionPointId: dto.collectionPointId,
        remark: dto.remark,
        assignedById,
      },
      include: {
        user: { select: { id: true, name: true, username: true, avatar: true } },
        collectionPoint: { select: { id: true, code: true, name: true, type: true, regionCode: true } },
      },
    });
  }

  /**
   * 批量分配（一个采集点分配给多人）
   */
  async batchCreate(dto: BatchCreateAllocationDto, assignedById?: string) {
    const results = [];
    for (const allocation of dto.allocations) {
      try {
        const result = await this.create(
          {
            userId: allocation.userId,
            collectionPointId: dto.collectionPointId,
            remark: allocation.remark,
          },
          assignedById,
        );
        results.push({ success: true, data: result });
      } catch (error) {
        results.push({ success: false, userId: allocation.userId, error: (error as Error).message });
      }
    }
    return results;
  }

  /**
   * 查询分配列表
   */
  async findAll(query: QueryCollectionPointAllocationDto) {
    const { userId, collectionPointId, isActive, page, pageSize } = query;

    const where: any = {};
    if (userId) where.userId = userId;
    if (collectionPointId) where.collectionPointId = collectionPointId;
    if (isActive !== undefined) where.isActive = isActive;

    const [data, total] = await Promise.all([
      this.prisma.collectionPointAllocation.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, username: true, avatar: true } },
          collectionPoint: { select: { id: true, code: true, name: true, type: true, regionCode: true } },
        },
        orderBy: [{ collectionPointId: 'asc' }, { assignedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.collectionPointAllocation.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  /**
   * 获取单个分配详情
   */
  async findOne(id: string) {
    const allocation = await this.prisma.collectionPointAllocation.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, username: true, avatar: true } },
        collectionPoint: { select: { id: true, code: true, name: true, type: true, regionCode: true } },
      },
    });

    if (!allocation) {
      throw new NotFoundException('分配关系不存在');
    }

    return allocation;
  }

  /**
   * 更新分配关系
   */
  async update(id: string, dto: UpdateCollectionPointAllocationDto) {
    await this.findOne(id);

    return this.prisma.collectionPointAllocation.update({
      where: { id },
      data: dto,
      include: {
        user: { select: { id: true, name: true, username: true, avatar: true } },
        collectionPoint: { select: { id: true, code: true, name: true, type: true, regionCode: true } },
      },
    });
  }

  /**
   * 删除分配关系（软删除）
   */
  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.collectionPointAllocation.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * 获取采集点的所有负责人
   */
  async findByCollectionPoint(collectionPointId: string) {
    return this.prisma.collectionPointAllocation.findMany({
      where: {
        collectionPointId,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
            phone: true,
            organization: { select: { name: true } },
            department: { select: { name: true } },
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  /**
   * 获取用户负责的所有采集点
   */
  async findByUser(userId: string) {
    return this.prisma.collectionPointAllocation.findMany({
      where: {
        userId,
        isActive: true,
      },
      include: {
        collectionPoint: {
          select: {
            id: true,
            code: true,
            name: true,
            shortName: true,
            type: true,
            regionCode: true,
            commodities: true,
            priceSubTypes: true,
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  /**
   * 获取当前用户负责的采集点（带填报状态）
   */
  async findMyAssignedPoints(userId: string, effectiveDate?: Date) {
    const date = effectiveDate || new Date();
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const allocations = await this.prisma.collectionPointAllocation.findMany({
      where: {
        userId,
        isActive: true,
      },
      include: {
        collectionPoint: {
          select: {
            id: true,
            code: true,
            name: true,
            shortName: true,
            type: true,
            regionCode: true,
            commodities: true,
            priceSubTypes: true,
            defaultSubType: true,
          },
        },
      },
    });

    // 获取今日填报状态和最近价格
    const result = await Promise.all(
      allocations.map(async (allocation) => {
        const [todaySubmission, lastPrice, pendingTask] = await Promise.all([
          // 今日是否已填报
          this.prisma.priceSubmission.findFirst({
            where: {
              collectionPointId: allocation.collectionPointId,
              submittedById: userId,
              effectiveDate: {
                gte: startOfDay,
                lte: endOfDay,
              },
            },
          }),
          // 最近一条价格数据
          this.prisma.priceData.findFirst({
            where: {
              collectionPointId: allocation.collectionPointId,
            },
            orderBy: { effectiveDate: 'desc' },
            select: { price: true, effectiveDate: true, commodity: true },
          }),
          // 是否有待办任务
          this.prisma.intelTask.findFirst({
            where: {
              assigneeId: userId,
              collectionPointId: allocation.collectionPointId,
              status: 'PENDING',
              type: { in: ['PRICE_COLLECTION', 'INVENTORY_CHECK'] },
            },
            select: { id: true, deadline: true, type: true },
          }),
        ]);

        return {
          ...allocation,
          todayReported: !!todaySubmission,
          submissionStatus: todaySubmission?.status,
          lastPrice: lastPrice ? Number(lastPrice.price) : null,
          lastPriceDate: lastPrice?.effectiveDate,
          lastCommodity: lastPrice?.commodity,
          hasPendingTask: !!pendingTask,
          pendingTask: pendingTask,
        };
      }),
    );

    return result;
  }

  /**
   * 获取采集点分配统计
   */
  async getStatistics() {
    const [total, allocated, byType] = await Promise.all([
      // 总采集点数
      this.prisma.collectionPoint.count({ where: { isActive: true } }),
      // 已分配的采集点数
      this.prisma.collectionPoint.count({
        where: {
          isActive: true,
          allocations: { some: { isActive: true } },
        },
      }),
      // 按类型统计
      this.prisma.collectionPoint.groupBy({
        by: ['type'],
        where: { isActive: true },
        _count: true,
      }),
    ]);

    // 按类型获取已分配数
    const allocatedByType = await Promise.all(
      byType.map(async (item) => {
        const allocatedCount = await this.prisma.collectionPoint.count({
          where: {
            isActive: true,
            type: item.type,
            allocations: { some: { isActive: true } },
          },
        });
        return {
          type: item.type,
          total: item._count,
          allocated: allocatedCount,
        };
      }),
    );

    return {
      total,
      allocated,
      unallocated: total - allocated,
      byType: allocatedByType,
    };
  }
}
