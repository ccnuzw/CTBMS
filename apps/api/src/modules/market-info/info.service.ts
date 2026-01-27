import { Injectable, NotFoundException } from '@nestjs/common';
import { MarketInfo, TaggableEntityType as PrismaEntityType } from '@prisma/client';
import { CreateInfoDto, UpdateInfoDto, TaggableEntityType } from '@packages/types';
import { PrismaService } from '../../prisma';
import { TagsService } from '../tags/tags.service';

@Injectable()
export class InfoService {
    constructor(
        private prisma: PrismaService,
        private tagsService: TagsService,
    ) { }

    async create(data: CreateInfoDto & { authorId: string }) {
        const { tagIds, categoryId, ...rest } = data;

        // 创建信息
        const info = await this.prisma.marketInfo.create({
            data: {
                ...rest,
                // @ts-ignore - Handle null attachments
                attachments: rest.attachments ?? undefined,
                category: {
                    connect: { id: categoryId }
                },
            },
            include: {
                category: true,
            }
        });

        // 关联标签（通过 EntityTag）
        if (tagIds && tagIds.length > 0) {
            await this.tagsService.attachTags({
                entityType: TaggableEntityType.MARKET_INFO,
                entityId: info.id,
                tagIds,
            });
        }

        // 返回带标签的完整数据
        const tags = await this.tagsService.getEntityTags(
            TaggableEntityType.MARKET_INFO,
            info.id
        );

        return { ...info, tags };
    }

    async findAll() {
        const infos = await this.prisma.marketInfo.findMany({
            include: {
                category: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        // 为每条信息获取标签
        const infosWithTags = await Promise.all(
            infos.map(async (info) => {
                const tags = await this.tagsService.getEntityTags(
                    TaggableEntityType.MARKET_INFO,
                    info.id
                );
                return { ...info, tags };
            })
        );

        return infosWithTags;
    }

    async findOne(id: string) {
        const info = await this.prisma.marketInfo.findUnique({
            where: { id },
            include: {
                category: true,
            }
        });
        if (!info) {
            throw new NotFoundException(`Info with ID ${id} not found`);
        }

        // 获取关联的标签
        const tags = await this.tagsService.getEntityTags(
            TaggableEntityType.MARKET_INFO,
            id
        );

        return { ...info, tags };
    }

    async update(id: string, data: UpdateInfoDto) {
        await this.findOne(id);
        const { tagIds, categoryId, ...rest } = data;

        // 更新信息
        const info = await this.prisma.marketInfo.update({
            where: { id },
            data: {
                ...rest,
                // @ts-ignore - Handle null attachments
                attachments: rest.attachments ?? undefined,
                category: categoryId ? {
                    connect: { id: categoryId }
                } : undefined,
            },
            include: {
                category: true,
            }
        });

        // 更新标签关联（先删除旧的，再添加新的）
        if (tagIds !== undefined) {
            // 删除所有旧标签关联
            await this.prisma.entityTag.deleteMany({
                where: {
                    entityType: PrismaEntityType.MARKET_INFO,
                    entityId: id,
                }
            });

            // 添加新的标签关联
            if (tagIds.length > 0) {
                await this.tagsService.attachTags({
                    entityType: TaggableEntityType.MARKET_INFO,
                    entityId: id,
                    tagIds,
                });
            }
        }

        // 返回带标签的完整数据
        const tags = await this.tagsService.getEntityTags(
            TaggableEntityType.MARKET_INFO,
            id
        );

        return { ...info, tags };
    }

    async remove(id: string) {
        await this.findOne(id);

        // 删除标签关联
        await this.prisma.entityTag.deleteMany({
            where: {
                entityType: PrismaEntityType.MARKET_INFO,
                entityId: id,
            }
        });

        return this.prisma.marketInfo.delete({
            where: { id },
        });
    }
}

