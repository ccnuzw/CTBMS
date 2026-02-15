import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { User, UserStatus, Gender, Prisma } from '@prisma/client';
import { CreateUserDto, UpdateUserDto, AssignRolesDto, BatchAssignUsersDto } from '@packages/types';
import { PrismaService } from '../../prisma';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private buildUserWhere(filters?: {
    organizationIds?: string[];
    departmentIds?: string[];
    ids?: string[];
    status?: UserStatus;
    keyword?: string;
    unassigned?: boolean;
  }): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};
    if (filters?.unassigned) {
      where.organizationId = null;
      where.departmentId = null;
    }
    if (!filters?.unassigned && filters?.organizationIds && filters.organizationIds.length > 0) {
      where.organizationId = { in: filters.organizationIds };
    }
    if (!filters?.unassigned && filters?.departmentIds && filters.departmentIds.length > 0) {
      where.departmentId = { in: filters.departmentIds };
    }
    if (filters?.ids && filters.ids.length > 0) {
      where.id = { in: filters.ids };
    }
    if (filters?.status) {
      where.status = filters.status;
    }
    const keyword = filters?.keyword?.trim();
    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { username: { contains: keyword, mode: 'insensitive' } },
        { email: { contains: keyword, mode: 'insensitive' } },
        { phone: { contains: keyword } },
        { employeeNo: { contains: keyword, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  /**
   * 创建用户
   */
  async create(data: CreateUserDto): Promise<User> {
    // 验证组织存在性（如果指定）
    if (data.organizationId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: data.organizationId },
      });
      if (!org) {
        throw new BadRequestException('所属组织不存在');
      }
    }

    // 验证部门存在性（如果指定）
    if (data.departmentId) {
      const dept = await this.prisma.department.findUnique({
        where: { id: data.departmentId },
      });
      if (!dept) {
        throw new BadRequestException('所属部门不存在');
      }
      if (data.organizationId && dept.organizationId !== data.organizationId) {
        throw new BadRequestException('部门必须属于该组织');
      }
    }

    // 检查用户名是否已存在
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: data.username },
    });
    if (existingUsername) {
      throw new BadRequestException('用户名已被使用');
    }

    // 检查邮箱是否已存在
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingUser) {
      throw new BadRequestException('该邮箱已被使用');
    }

    // 检查工号是否已存在
    if (data.employeeNo) {
      const existingNo = await this.prisma.user.findUnique({
        where: { employeeNo: data.employeeNo },
      });
      if (existingNo) {
        throw new BadRequestException('工号已存在');
      }
    }

    // 创建用户
    const user = await this.prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        name: data.name,
        gender: (data.gender as Gender) ?? null,
        birthday: data.birthday ?? null,
        employeeNo: data.employeeNo ?? null,
        phone: data.phone ?? null,
        avatar: data.avatar ?? null,
        organizationId: data.organizationId ?? null,
        departmentId: data.departmentId ?? null,
        position: data.position ?? null,
        hireDate: data.hireDate ?? null,
        status: (data.status as UserStatus) ?? 'ACTIVE',
      },
    });

    // 分配角色（如果有）
    if (data.roleIds && data.roleIds.length > 0) {
      await this.prisma.userRole.createMany({
        data: data.roleIds.map((roleId) => ({
          userId: user.id,
          roleId,
        })),
      });
    }

    return this.findOne(user.id);
  }

  /**
   * 更新用户
   */
  async update(id: string, data: UpdateUserDto): Promise<User> {
    const existing = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('用户不存在');
    }

    // 验证部门存在性（如果更改）
    if (data.departmentId) {
      const dept = await this.prisma.department.findUnique({
        where: { id: data.departmentId },
      });
      if (!dept) {
        throw new BadRequestException('所属部门不存在');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        gender: data.gender as Gender | undefined,
        birthday: data.birthday,
        employeeNo: data.employeeNo,
        phone: data.phone,
        avatar: data.avatar,
        organizationId: data.organizationId,
        departmentId: data.departmentId,
        position: data.position,
        hireDate: data.hireDate,
        status: data.status as UserStatus | undefined,
      },
      include: {
        organization: true,
        department: true,
        roles: {
          include: { role: true },
        },
      },
    });
  }

  /**
   * 获取所有用户（支持筛选）
   */
  async findAll(filters?: {
    organizationIds?: string[];
    departmentIds?: string[];
    ids?: string[];
    status?: UserStatus;
    keyword?: string;
    unassigned?: boolean;
  }): Promise<User[]> {
    const where = this.buildUserWhere(filters);
    return this.prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      include: {
        organization: true,
        department: true,
        roles: {
          include: { role: true },
        },
      },
    });
  }

  async findPaged(filters: {
    organizationIds?: string[];
    departmentIds?: string[];
    status?: UserStatus;
    keyword?: string;
    page: number;
    pageSize: number;
  }) {
    const where = this.buildUserWhere(filters);
    const page = Math.max(1, Number(filters.page || 1));
    const pageSize = Math.max(1, Math.min(200, Number(filters.pageSize || 20)));

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          organization: true,
          department: true,
          roles: {
            include: { role: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 批量分配用户到组织/部门
   */
  async batchAssign(data: BatchAssignUsersDto): Promise<{ updatedCount: number }> {
    const userIds = Array.from(new Set(data.userIds));

    if (userIds.length === 0) {
      throw new BadRequestException('请至少选择一个用户');
    }

    let organizationId = data.organizationId ?? null;
    const departmentId = data.departmentId ?? null;

    if (departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: departmentId },
        select: { id: true, organizationId: true },
      });

      if (!department) {
        throw new BadRequestException('所属部门不存在');
      }

      if (organizationId && department.organizationId !== organizationId) {
        throw new BadRequestException('部门必须属于指定组织');
      }

      organizationId = department.organizationId;
    }

    if (!organizationId && !departmentId) {
      throw new BadRequestException('organizationId 或 departmentId 至少提供一个');
    }

    if (organizationId) {
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });
      if (!organization) {
        throw new BadRequestException('所属组织不存在');
      }
    }

    const existingCount = await this.prisma.user.count({
      where: { id: { in: userIds } },
    });

    if (existingCount !== userIds.length) {
      throw new BadRequestException('部分用户不存在，无法批量分配');
    }

    const result = await this.prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: {
        organizationId,
        departmentId,
      },
    });

    return { updatedCount: result.count };
  }

  /**
   * 获取单个用户详情
   */
  async findOne(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        organization: true,
        department: true,
        roles: {
          include: { role: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }

  /**
   * 分配角色
   */
  async assignRoles(id: string, data: AssignRolesDto): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 验证所有角色存在
    if (data.roleIds.length > 0) {
      const roles = await this.prisma.role.findMany({
        where: { id: { in: data.roleIds } },
      });
      if (roles.length !== data.roleIds.length) {
        throw new BadRequestException('部分角色不存在');
      }
    }

    // 使用事务更新角色
    await this.prisma.$transaction(async (tx) => {
      // 删除现有角色
      await tx.userRole.deleteMany({
        where: { userId: id },
      });

      // 添加新角色
      if (data.roleIds.length > 0) {
        await tx.userRole.createMany({
          data: data.roleIds.map((roleId) => ({
            userId: id,
            roleId,
          })),
        });
      }
    });

    return this.findOne(id);
  }

  /**
   * 删除用户
   */
  async remove(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return this.prisma.user.delete({
      where: { id },
    });
  }
}
