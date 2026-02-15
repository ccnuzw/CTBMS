import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateUserConfigBindingDto,
  UpdateUserConfigBindingDto,
  UserConfigBindingQueryDto,
} from '@packages/types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';

@Injectable()
export class UserConfigBindingService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateUserConfigBindingDto) {
    const metadata =
      dto.metadata === undefined ? undefined : (dto.metadata as Prisma.InputJsonValue);

    return this.prisma.userConfigBinding.upsert({
      where: {
        userId_bindingType_targetId: {
          userId,
          bindingType: dto.bindingType,
          targetId: dto.targetId,
        },
      },
      update: {
        targetCode: dto.targetCode,
        metadata,
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 100,
      },
      create: {
        userId,
        bindingType: dto.bindingType,
        targetId: dto.targetId,
        targetCode: dto.targetCode,
        metadata,
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 100,
      },
    });
  }

  async findMany(userId: string, query: UserConfigBindingQueryDto) {
    const where: Prisma.UserConfigBindingWhereInput = { userId };

    if (query.bindingType) {
      where.bindingType = query.bindingType;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const keyword = query.keyword?.trim();
    if (keyword) {
      where.OR = [
        { targetId: { contains: keyword, mode: 'insensitive' } },
        { targetCode: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [data, total] = await Promise.all([
      this.prisma.userConfigBinding.findMany({
        where,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.userConfigBinding.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(userId: string, id: string) {
    const binding = await this.prisma.userConfigBinding.findFirst({
      where: { id, userId },
    });
    if (!binding) {
      throw new NotFoundException('配置绑定不存在');
    }
    return binding;
  }

  async update(userId: string, id: string, dto: UpdateUserConfigBindingDto) {
    await this.findOne(userId, id);

    const metadata =
      dto.metadata === undefined ? undefined : (dto.metadata as Prisma.InputJsonValue);

    return this.prisma.userConfigBinding.update({
      where: { id },
      data: {
        targetCode: dto.targetCode,
        metadata,
        isActive: dto.isActive,
        priority: dto.priority,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);

    await this.prisma.userConfigBinding.delete({
      where: { id },
    });

    return { deleted: true };
  }
}
