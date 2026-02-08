import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Tag, EntityTag, Prisma, TaggableEntityType as PrismaEntityType } from '@prisma/client';
import {
    CreateTagDto,
    UpdateTagDto,
    AttachTagsDto,
    DetachTagDto,
    TagScope,
    TaggableEntityType,
} from '@packages/types';
import { PrismaService } from '../../prisma';

@Injectable()
export class TagsService {
    constructor(private prisma: PrismaService) { }

    // ========== Tag CRUD ==========

    async create(data: CreateTagDto): Promise<Tag> {
        return this.prisma.tag.create({
            data: {
                name: data.name,
                color: data.color,
                icon: data.icon,
                description: data.description,
                scopes: data.scopes,
                sortOrder: data.sortOrder,
                groupId: data.groupId,
            },
            include: { group: true },
        });
    }

    async findAll(params?: {
        scope?: TagScope;
        groupId?: string;
        status?: string;
    }): Promise<Tag[]> {
        const where: Prisma.TagWhereInput = {};

        if (params?.scope) {
            where.scopes = { has: params.scope };
        }
        if (params?.groupId) {
            where.groupId = params.groupId;
        }
        if (params?.status) {
            where.status = params.status as 'ACTIVE' | 'INACTIVE';
        }

        return this.prisma.tag.findMany({
            where,
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
            include: { group: true },
        });
    }

    async findOne(id: string): Promise<Tag> {
        const tag = await this.prisma.tag.findUnique({
            where: { id },
            include: { group: true },
        });
        if (!tag) {
            throw new NotFoundException(`标签 ID ${id} 不存在`);
        }
        return tag;
    }

    async update(id: string, data: UpdateTagDto): Promise<Tag> {
        await this.findOne(id);
        return this.prisma.tag.update({
            where: { id },
            data,
            include: { group: true },
        });
    }

    async remove(id: string): Promise<Tag> {
        await this.findOne(id);
        // 删除标签时，关联的 EntityTag 会级联删除
        return this.prisma.tag.delete({
            where: { id },
        });
    }

    // ========== Entity Tag Operations ==========

    async attachTags(dto: AttachTagsDto): Promise<EntityTag[]> {
        const { entityType, entityId, tagIds } = dto;

        // 将 TypeScript 枚举转换为 Prisma 枚举
        const prismaEntityType = entityType as unknown as PrismaEntityType;

        // 验证标签是否存在
        const tags = await this.prisma.tag.findMany({
            where: { id: { in: tagIds } },
            include: { group: true },
        });

        if (tags.length !== tagIds.length) {
            throw new BadRequestException('部分标签不存在');
        }

        // 检查作用域匹配 - 使用字符串比较确保兼容性
        const scopeMapping: Record<string, string> = {
            'CUSTOMER': 'CUSTOMER',
            'SUPPLIER': 'SUPPLIER',
            'VEHICLE': 'VEHICLE',
            'CONTRACT': 'CONTRACT',
            'MARKET_INFO': 'MARKET_INFO',
        };

        const requiredScope = scopeMapping[entityType];
        for (const tag of tags) {
            const scopeStrings = tag.scopes.map(s => String(s));
            const hasValidScope =
                scopeStrings.includes('GLOBAL') ||
                scopeStrings.includes(requiredScope);
            if (!hasValidScope) {
                throw new BadRequestException(
                    `标签 "${tag.name}" 不适用于此类型的实体`,
                );
            }
        }

        // 检查互斥逻辑
        const exclusiveGroups = new Map<string, string>();
        for (const tag of tags) {
            if (tag.group && tag.group.isExclusive) {
                if (exclusiveGroups.has(tag.groupId!)) {
                    throw new BadRequestException(
                        `标签组 "${tag.group.name}" 是互斥的，不能同时选择多个标签`,
                    );
                }
                exclusiveGroups.set(tag.groupId!, tag.name);
            }
        }

        // 移除已存在的互斥组标签
        for (const [groupId] of exclusiveGroups) {
            await this.prisma.entityTag.deleteMany({
                where: {
                    entityType: prismaEntityType,
                    entityId,
                    tag: { groupId },
                },
            });
        }

        // 批量创建关联
        const results: EntityTag[] = [];
        for (const tagId of tagIds) {
            const entityTag = await this.prisma.entityTag.upsert({
                where: {
                    tagId_entityType_entityId: { tagId, entityType: prismaEntityType, entityId },
                },
                update: {},
                create: { tagId, entityType: prismaEntityType, entityId },
            });
            results.push(entityTag);
        }

        return results;
    }

    /**
     * 同步实体标签（先删除所有现有标签，再添加新标签）
     * 用于编辑场景，确保标签列表与用户选择完全一致
     */
    async syncEntityTags(dto: AttachTagsDto): Promise<EntityTag[]> {
        const { entityType, entityId, tagIds } = dto;
        const prismaEntityType = entityType as unknown as PrismaEntityType;

        // 先删除该实体的所有现有标签
        await this.prisma.entityTag.deleteMany({
            where: {
                entityType: prismaEntityType,
                entityId,
            },
        });

        // 如果没有新标签，直接返回空数组
        if (!tagIds || tagIds.length === 0) {
            return [];
        }

        // 验证标签是否存在
        const tags = await this.prisma.tag.findMany({
            where: { id: { in: tagIds } },
            include: { group: true },
        });

        if (tags.length !== tagIds.length) {
            throw new BadRequestException('部分标签不存在');
        }

        // 检查作用域匹配
        const scopeMapping: Record<string, string> = {
            'CUSTOMER': 'CUSTOMER',
            'SUPPLIER': 'SUPPLIER',
            'LOGISTICS': 'LOGISTICS',
            'CONTRACT': 'CONTRACT',
            'MARKET_INFO': 'MARKET_INFO',
        };

        const requiredScope = scopeMapping[entityType];
        for (const tag of tags) {
            const scopeStrings = tag.scopes.map(s => String(s));
            const hasValidScope =
                scopeStrings.includes('GLOBAL') ||
                scopeStrings.includes(requiredScope);
            if (!hasValidScope) {
                throw new BadRequestException(
                    `标签 "${tag.name}" 不适用于此类型的实体`,
                );
            }
        }

        // 检查互斥逻辑
        const exclusiveGroups = new Map<string, string>();
        for (const tag of tags) {
            if (tag.group && tag.group.isExclusive) {
                if (exclusiveGroups.has(tag.groupId!)) {
                    throw new BadRequestException(
                        `标签组 "${tag.group.name}" 是互斥的，不能同时选择多个标签`,
                    );
                }
                exclusiveGroups.set(tag.groupId!, tag.name);
            }
        }

        // 批量创建关联
        const results: EntityTag[] = [];
        for (const tagId of tagIds) {
            const entityTag = await this.prisma.entityTag.create({
                data: { tagId, entityType: prismaEntityType, entityId },
            });
            results.push(entityTag);
        }

        return results;
    }

    async detachTag(dto: DetachTagDto): Promise<void> {
        const { entityType, entityId, tagId } = dto;
        const prismaEntityType = entityType as unknown as PrismaEntityType;
        await this.prisma.entityTag.deleteMany({
            where: { tagId, entityType: prismaEntityType, entityId },
        });
    }

    async getEntityTags(
        entityType: TaggableEntityType,
        entityId: string,
    ): Promise<Tag[]> {
        const prismaEntityType = entityType as unknown as PrismaEntityType;
        const entityTags = await this.prisma.entityTag.findMany({
            where: { entityType: prismaEntityType, entityId },
            include: { tag: { include: { group: true } } },
        });
        return entityTags.map((et) => et.tag);
    }
}
