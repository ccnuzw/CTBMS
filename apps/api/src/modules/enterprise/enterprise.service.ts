import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEnterpriseDto, UpdateEnterpriseDto, EnterpriseQueryDto } from './dto';
import { CreateContactDto, UpdateContactDto } from './dto';
import { CreateBankAccountDto, UpdateBankAccountDto } from './dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class EnterpriseService {
    constructor(private readonly prisma: PrismaService) { }

    // ============= Enterprise CRUD =============

    async findAll(query: EnterpriseQueryDto) {
        const { type, search, parentId, status, rootOnly, page = 1, pageSize = 20 } = query;

        const where: Prisma.EnterpriseWhereInput = {};

        // 类型筛选
        if (type) {
            where.types = { has: type };
        }

        // 搜索（名称、简称、税号）
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { shortName: { contains: search, mode: 'insensitive' } },
                { taxId: { contains: search } },
            ];
        }

        // 仅顶级企业（无父级）
        if (rootOnly) {
            where.parentId = null;
        } else if (parentId !== undefined) {
            where.parentId = parentId;
        }

        // 状态筛选
        if (status) {
            where.status = status as 'ACTIVE' | 'INACTIVE';
        }

        const [data, total] = await Promise.all([
            this.prisma.enterprise.findMany({
                where,
                include: {
                    _count: {
                        select: {
                            children: true,
                            contacts: true,
                            bankAccounts: true,
                        },
                    },
                    parent: {
                        select: {
                            id: true,
                            name: true,
                            shortName: true,
                        },
                    },
                    // 包含子公司用于层级展开
                    children: {
                        orderBy: { name: 'asc' },
                        include: {
                            _count: {
                                select: { children: true, contacts: true },
                            },
                            contacts: {
                                take: 1,
                                orderBy: { role: 'asc' },
                                select: { id: true, name: true, title: true, phone: true },
                            },
                        },
                    },
                    // 关键联系人（取第一个）
                    contacts: {
                        take: 1,
                        orderBy: { role: 'asc' },
                        select: { id: true, name: true, title: true, phone: true },
                    },
                },
                orderBy: [{ types: 'asc' }, { name: 'asc' }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.enterprise.count({ where }),
        ]);

        // 获取所有企业的标签
        const enterpriseIds = data.map((e) => e.id);
        const childIds = data.flatMap((e) => e.children?.map((c) => c.id) ?? []);
        const allIds = [...enterpriseIds, ...childIds];

        const entityTags = await this.prisma.entityTag.findMany({
            where: {
                entityType: 'CUSTOMER',
                entityId: { in: allIds },
            },
            include: {
                tag: {
                    select: { id: true, name: true, color: true, icon: true },
                },
            },
        });

        // 按企业ID分组标签
        const tagsByEntityId = entityTags.reduce(
            (acc, et) => {
                if (!acc[et.entityId]) acc[et.entityId] = [];
                acc[et.entityId].push(et.tag);
                return acc;
            },
            {} as Record<string, { id: string; name: string; color: string | null; icon: string | null }[]>,
        );

        // 合并标签到企业数据
        const dataWithTags = data.map((enterprise) => ({
            ...enterprise,
            tags: tagsByEntityId[enterprise.id] ?? [],
            children: enterprise.children?.map((child) => ({
                ...child,
                tags: tagsByEntityId[child.id] ?? [],
            })),
        }));

        return {
            data: dataWithTags,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }

    async findOne(id: string) {
        const enterprise = await this.prisma.enterprise.findUnique({
            where: { id },
            include: {
                parent: true,
                children: {
                    orderBy: { name: 'asc' },
                },
                contacts: {
                    orderBy: [{ role: 'asc' }, { name: 'asc' }],
                },
                bankAccounts: {
                    orderBy: [{ isDefault: 'desc' }, { bankName: 'asc' }],
                },
                _count: {
                    select: {
                        children: true,
                        contacts: true,
                        bankAccounts: true,
                    },
                },
            },
        });

        if (!enterprise) {
            throw new NotFoundException(`企业 ${id} 不存在`);
        }

        return enterprise;
    }

    async findTree() {
        // 获取所有顶级企业及其子公司
        const enterprises = await this.prisma.enterprise.findMany({
            where: { parentId: null },
            include: {
                children: {
                    orderBy: { name: 'asc' },
                    include: {
                        _count: {
                            select: { children: true, contacts: true },
                        },
                    },
                },
                _count: {
                    select: { children: true, contacts: true },
                },
            },
            orderBy: [{ types: 'asc' }, { name: 'asc' }],
        });

        return enterprises;
    }

    async create(dto: CreateEnterpriseDto) {
        // 检查税号唯一性
        const existing = await this.prisma.enterprise.findUnique({
            where: { taxId: dto.taxId },
        });

        if (existing) {
            throw new ConflictException(`税号 ${dto.taxId} 已存在`);
        }

        // 验证父级存在性
        if (dto.parentId) {
            const parent = await this.prisma.enterprise.findUnique({
                where: { id: dto.parentId },
            });
            if (!parent) {
                throw new NotFoundException(`父级企业 ${dto.parentId} 不存在`);
            }
        }

        const { contacts, bankAccounts, ...enterpriseData } = dto;

        return this.prisma.enterprise.create({
            data: {
                ...enterpriseData,
                contacts: contacts
                    ? {
                        create: contacts,
                    }
                    : undefined,
                bankAccounts: bankAccounts
                    ? {
                        create: bankAccounts,
                    }
                    : undefined,
            },
            include: {
                contacts: true,
                bankAccounts: true,
                _count: {
                    select: { children: true, contacts: true, bankAccounts: true },
                },
            },
        });
    }

    async update(id: string, dto: UpdateEnterpriseDto) {
        // 确保企业存在
        await this.findOne(id);

        // 验证父级存在性（如果更新）
        if (dto.parentId) {
            if (dto.parentId === id) {
                throw new ConflictException('企业不能作为自己的父级');
            }
            const parent = await this.prisma.enterprise.findUnique({
                where: { id: dto.parentId },
            });
            if (!parent) {
                throw new NotFoundException(`父级企业 ${dto.parentId} 不存在`);
            }
        }

        const { contacts, bankAccounts, ...enterpriseData } = dto;

        return this.prisma.enterprise.update({
            where: { id },
            data: enterpriseData,
            include: {
                parent: true,
                contacts: true,
                bankAccounts: true,
                _count: {
                    select: { children: true, contacts: true, bankAccounts: true },
                },
            },
        });
    }

    async remove(id: string) {
        await this.findOne(id);

        return this.prisma.enterprise.delete({
            where: { id },
        });
    }

    // ============= Contact CRUD =============

    async addContact(enterpriseId: string, dto: CreateContactDto) {
        await this.findOne(enterpriseId);

        return this.prisma.contact.create({
            data: {
                ...dto,
                enterpriseId,
            },
        });
    }

    async updateContact(contactId: string, dto: UpdateContactDto) {
        const contact = await this.prisma.contact.findUnique({
            where: { id: contactId },
        });

        if (!contact) {
            throw new NotFoundException(`联系人 ${contactId} 不存在`);
        }

        return this.prisma.contact.update({
            where: { id: contactId },
            data: dto,
        });
    }

    async removeContact(contactId: string) {
        const contact = await this.prisma.contact.findUnique({
            where: { id: contactId },
        });

        if (!contact) {
            throw new NotFoundException(`联系人 ${contactId} 不存在`);
        }

        return this.prisma.contact.delete({
            where: { id: contactId },
        });
    }

    // ============= BankAccount CRUD =============

    async addBankAccount(enterpriseId: string, dto: CreateBankAccountDto) {
        await this.findOne(enterpriseId);

        // 如果设为默认，取消其他默认
        if (dto.isDefault) {
            await this.prisma.bankAccount.updateMany({
                where: { enterpriseId, isDefault: true },
                data: { isDefault: false },
            });
        }

        return this.prisma.bankAccount.create({
            data: {
                ...dto,
                enterpriseId,
            },
        });
    }

    async updateBankAccount(accountId: string, dto: UpdateBankAccountDto) {
        const account = await this.prisma.bankAccount.findUnique({
            where: { id: accountId },
        });

        if (!account) {
            throw new NotFoundException(`银行账户 ${accountId} 不存在`);
        }

        // 如果设为默认，取消其他默认
        if (dto.isDefault) {
            await this.prisma.bankAccount.updateMany({
                where: { enterpriseId: account.enterpriseId, isDefault: true, id: { not: accountId } },
                data: { isDefault: false },
            });
        }

        return this.prisma.bankAccount.update({
            where: { id: accountId },
            data: dto,
        });
    }

    async removeBankAccount(accountId: string) {
        const account = await this.prisma.bankAccount.findUnique({
            where: { id: accountId },
        });

        if (!account) {
            throw new NotFoundException(`银行账户 ${accountId} 不存在`);
        }

        return this.prisma.bankAccount.delete({
            where: { id: accountId },
        });
    }
}
