import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Role, EntityStatus } from '@prisma/client';
import { CreateRoleDto } from '@packages/types';
import { PrismaService } from '../../prisma';

@Injectable()
export class RoleService {
    constructor(private prisma: PrismaService) { }

    /**
     * 创建角色
     */
    async create(data: CreateRoleDto): Promise<Role> {
        return this.prisma.role.create({
            data: {
                name: data.name,
                code: data.code,
                description: data.description ?? null,
                isSystem: data.isSystem ?? false,
                sortOrder: data.sortOrder ?? 0,
                status: (data.status as EntityStatus) ?? 'ACTIVE',
            },
        });
    }

    /**
     * 更新角色
     */
    async update(id: string, data: Partial<Omit<CreateRoleDto, 'code'>>): Promise<Role> {
        const existing = await this.prisma.role.findUnique({
            where: { id },
        });
        if (!existing) {
            throw new NotFoundException('角色不存在');
        }

        // 系统内置角色不允许修改某些字段
        if (existing.isSystem && data.isSystem === false) {
            throw new BadRequestException('系统内置角色不能更改为普通角色');
        }

        return this.prisma.role.update({
            where: { id },
            data: {
                name: data.name,
                description: data.description,
                isSystem: data.isSystem,
                sortOrder: data.sortOrder,
                status: data.status as EntityStatus | undefined,
            },
        });
    }

    /**
     * 获取所有角色
     */
    async findAll(): Promise<Role[]> {
        return this.prisma.role.findMany({
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            include: {
                _count: {
                    select: { users: true },
                },
            },
        });
    }

    /**
     * 获取单个角色详情
     */
    async findOne(id: string): Promise<Role> {
        const role = await this.prisma.role.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { users: true },
                },
            },
        });

        if (!role) {
            throw new NotFoundException('角色不存在');
        }

        return role;
    }

    /**
     * 删除角色
     */
    async remove(id: string): Promise<Role> {
        const role = await this.prisma.role.findUnique({
            where: { id },
            include: {
                users: true,
            },
        });

        if (!role) {
            throw new NotFoundException('角色不存在');
        }

        // 系统内置角色不可删除
        if (role.isSystem) {
            throw new BadRequestException('系统内置角色不能删除');
        }

        // 检查是否有用户使用此角色
        if (role.users.length > 0) {
            throw new BadRequestException('该角色下存在用户，无法删除');
        }

        return this.prisma.role.delete({
            where: { id },
        });
    }
}
