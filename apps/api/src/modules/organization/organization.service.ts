import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Organization, OrganizationType, EntityStatus } from '@prisma/client';
import { CreateOrganizationDto, OrganizationTreeNode } from '@packages/types';
import { PrismaService } from '../../prisma';

@Injectable()
export class OrganizationService {
    constructor(private prisma: PrismaService) { }

    /**
     * 创建组织
     */
    async create(data: CreateOrganizationDto): Promise<Organization> {
        // 验证父组织存在性
        if (data.parentId) {
            const parent = await this.prisma.organization.findUnique({
                where: { id: data.parentId },
            });
            if (!parent) {
                throw new BadRequestException('父组织不存在');
            }
        }

        return this.prisma.organization.create({
            data: {
                name: data.name,
                code: data.code,
                type: data.type as OrganizationType,
                description: data.description ?? null,
                parentId: data.parentId ?? null,
                sortOrder: data.sortOrder ?? 0,
                status: (data.status as EntityStatus) ?? 'ACTIVE',
            },
        });
    }

    /**
     * 更新组织
     */
    async update(id: string, data: Partial<CreateOrganizationDto>): Promise<Organization> {
        const existing = await this.prisma.organization.findUnique({
            where: { id },
        });
        if (!existing) {
            throw new NotFoundException('组织不存在');
        }

        // 防止循环引用：不能将自己设置为自己的子组织
        if (data.parentId === id) {
            throw new BadRequestException('不能将组织设置为自己的子组织');
        }

        // 验证新的父组织不是当前组织的后代
        if (data.parentId) {
            const descendants = await this.findDescendantIds(id);
            if (descendants.includes(data.parentId)) {
                throw new BadRequestException('不能将组织移动到其下级组织下');
            }
        }

        return this.prisma.organization.update({
            where: { id },
            data: {
                name: data.name,
                code: data.code,
                type: data.type as OrganizationType | undefined,
                description: data.description,
                parentId: data.parentId,
                sortOrder: data.sortOrder,
                status: data.status as EntityStatus | undefined,
            },
        });
    }

    /**
     * 获取所有组织（扁平列表）
     */
    async findAll(): Promise<Organization[]> {
        return this.prisma.organization.findMany({
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            include: {
                parent: true,
                _count: {
                    select: { children: true, departments: true },
                },
            },
        });
    }

    /**
     * 获取组织树形结构
     */
    async findTree(): Promise<OrganizationTreeNode[]> {
        const allOrgs = await this.prisma.organization.findMany({
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });

        return this.buildTree(allOrgs);
    }

    /**
     * 获取单个组织详情
     */
    async findOne(id: string): Promise<Organization> {
        const org = await this.prisma.organization.findUnique({
            where: { id },
            include: {
                parent: true,
                children: {
                    orderBy: [{ sortOrder: 'asc' }],
                },
                departments: {
                    where: { parentId: null }, // 只获取顶级部门
                    orderBy: [{ sortOrder: 'asc' }],
                },
            },
        });

        if (!org) {
            throw new NotFoundException('组织不存在');
        }

        return org;
    }

    /**
     * 删除组织
     */
    async remove(id: string): Promise<Organization> {
        const org = await this.prisma.organization.findUnique({
            where: { id },
            include: {
                children: true,
                departments: true,
            },
        });

        if (!org) {
            throw new NotFoundException('组织不存在');
        }

        // 检查是否有子组织
        if (org.children.length > 0) {
            throw new BadRequestException('该组织下存在子组织，无法删除');
        }

        // 检查是否有部门
        if (org.departments.length > 0) {
            throw new BadRequestException('该组织下存在部门，无法删除');
        }

        return this.prisma.organization.delete({
            where: { id },
        });
    }

    /**
     * 获取某组织的所有后代 ID
     */
    private async findDescendantIds(id: string): Promise<string[]> {
        const descendants: string[] = [];
        const children = await this.prisma.organization.findMany({
            where: { parentId: id },
            select: { id: true },
        });

        for (const child of children) {
            descendants.push(child.id);
            const childDescendants = await this.findDescendantIds(child.id);
            descendants.push(...childDescendants);
        }

        return descendants;
    }

    /**
     * 构建树形结构
     */
    private buildTree(orgs: Organization[]): OrganizationTreeNode[] {
        const orgMap = new Map<string, OrganizationTreeNode>();
        const roots: OrganizationTreeNode[] = [];

        // 先创建所有节点
        for (const org of orgs) {
            orgMap.set(org.id, {
                id: org.id,
                name: org.name,
                code: org.code,
                type: org.type,
                description: org.description,
                parentId: org.parentId,
                sortOrder: org.sortOrder,
                status: org.status,
                children: [],
            });
        }

        // 构建层级关系
        for (const org of orgs) {
            const node = orgMap.get(org.id)!;
            if (org.parentId && orgMap.has(org.parentId)) {
                orgMap.get(org.parentId)!.children.push(node);
            } else {
                roots.push(node);
            }
        }

        return roots;
    }
}
