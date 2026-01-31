import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
    CreateCollectionPointDto,
    UpdateCollectionPointDto,
    CollectionPointQueryDto,
} from './dto';
import { CollectionPointType } from '@packages/types';

@Injectable()
export class CollectionPointService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * 创建采集点
     */
    async create(dto: CreateCollectionPointDto, createdById?: string) {
        // 检查编码唯一性
        const existing = await this.prisma.collectionPoint.findUnique({
            where: { code: dto.code },
        });
        if (existing) {
            throw new ConflictException(`采集点编码 ${dto.code} 已存在`);
        }

        return this.prisma.collectionPoint.create({
            data: {
                ...dto,
                createdById,
            },
            include: {
                region: true,
                enterprise: {
                    select: { id: true, name: true, shortName: true },
                },
            },
        });
    }

    /**
     * 分页查询采集点
     */
    async findAll(query: CollectionPointQueryDto) {
        const { page, pageSize, type, regionCode, keyword, isActive, allocationStatus } = query;

        const where: any = {};
        if (type) where.type = type;
        if (regionCode) where.regionCode = regionCode;
        if (isActive !== undefined) where.isActive = isActive;
        if (allocationStatus === 'ALLOCATED') {
            where.allocations = { some: { isActive: true } };
        } else if (allocationStatus === 'UNALLOCATED') {
            where.allocations = { none: { isActive: true } };
        }

        if (keyword) {
            where.OR = [
                { name: { contains: keyword, mode: 'insensitive' } },
                { shortName: { contains: keyword, mode: 'insensitive' } },
                { code: { contains: keyword, mode: 'insensitive' } },
                { aliases: { has: keyword } },
            ];
        }

        const [data, total] = await Promise.all([
            this.prisma.collectionPoint.findMany({
                where,
                skip: (page - 1) * pageSize,
                take: pageSize,
                orderBy: [{ priority: 'desc' }, { name: 'asc' }],
                include: {
                    region: true,
                    enterprise: {
                        select: { id: true, name: true, shortName: true },
                    },
                    allocations: {
                        where: { isActive: true },
                        include: {
                            user: {
                                select: { id: true, name: true, avatar: true, username: true },
                            },
                        },
                    },
                },
            }),
            this.prisma.collectionPoint.count({ where }),
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
     * 获取单个采集点
     */
    async findOne(id: string) {
        const point = await this.prisma.collectionPoint.findUnique({
            where: { id },
            include: {
                region: true,
                enterprise: {
                    select: { id: true, name: true, shortName: true },
                },
            },
        });

        if (!point) {
            throw new NotFoundException(`采集点不存在: ${id}`);
        }

        return point;
    }

    /**
     * 更新采集点
     */
    async update(id: string, dto: UpdateCollectionPointDto) {
        await this.findOne(id); // 确保存在

        // 如果更新编码，检查唯一性
        if (dto.code) {
            const existing = await this.prisma.collectionPoint.findFirst({
                where: { code: dto.code, id: { not: id } },
            });
            if (existing) {
                throw new ConflictException(`采集点编码 ${dto.code} 已存在`);
            }
        }

        return this.prisma.collectionPoint.update({
            where: { id },
            data: dto,
            include: {
                region: true,
                enterprise: {
                    select: { id: true, name: true, shortName: true },
                },
            },
        });
    }

    /**
     * 删除采集点
     */
    async remove(id: string) {
        await this.findOne(id); // 确保存在
        return this.prisma.collectionPoint.delete({ where: { id } });
    }

    /**
     * 获取用于 AI 识别的采集点列表（带缓存）
     */
    async getForRecognition() {
        return this.prisma.collectionPoint.findMany({
            where: { isActive: true },
            select: {
                id: true,
                code: true,
                name: true,
                shortName: true,
                aliases: true,
                type: true,
                regionCode: true,
                longitude: true,
                latitude: true,
                defaultSubType: true,
                enterpriseId: true,
                priority: true,
            },
            orderBy: { priority: 'desc' },
        });
    }

    /**
     * 批量导入采集点
     */
    async batchImport(
        points: CreateCollectionPointDto[],
        createdById?: string,
    ) {
        const results = { success: 0, failed: 0, errors: [] as string[] };

        for (const point of points) {
            try {
                await this.prisma.collectionPoint.upsert({
                    where: { code: point.code },
                    update: { ...point },
                    create: { ...point, createdById },
                });
                results.success++;
            } catch (error: any) {
                results.failed++;
                results.errors.push(`${point.code}: ${error.message}`);
            }
        }

        return results;
    }

    /**
     * 按类型统计
     */
    async getStatsByType() {
        const stats = await this.prisma.collectionPoint.groupBy({
            by: ['type'],
            _count: { id: true },
            where: { isActive: true },
        });

        return stats.map((s) => ({
            type: s.type,
            count: s._count.id,
        }));
    }
}
