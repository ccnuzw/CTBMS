import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma, AdministrativeRegion } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRegionDto, UpdateRegionDto, RegionQueryDto } from './dto';
import { RegionLevel } from '@packages/types';

@Injectable()
export class RegionService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * 创建行政区划
     */
    async create(dto: CreateRegionDto) {
        const existing = await this.prisma.administrativeRegion.findUnique({
            where: { code: dto.code },
        });
        if (existing) {
            throw new ConflictException(`区划代码 ${dto.code} 已存在`);
        }

        return this.prisma.administrativeRegion.create({
            data: dto,
        });
    }

    /**
     * 查询行政区划列表
     */
    async findAll(query: RegionQueryDto) {
        const { level, parentCode, keyword, isActive } = query;

        const where: Prisma.AdministrativeRegionWhereInput = {};
        if (level) where.level = level;
        if (parentCode !== undefined) where.parentCode = parentCode || null;
        if (isActive !== undefined) where.isActive = isActive;
        if (keyword) {
            where.OR = [
                { name: { contains: keyword, mode: 'insensitive' } },
                { shortName: { contains: keyword, mode: 'insensitive' } },
                { code: { contains: keyword, mode: 'insensitive' } },
            ];
        }

        return this.prisma.administrativeRegion.findMany({
            where,
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        });
    }

    /**
     * 获取行政区划树结构
     */
    async getTree(rootLevel: RegionLevel = RegionLevel.PROVINCE) {
        // 获取所有活跃的行政区划
        const allRegions = await this.prisma.administrativeRegion.findMany({
            where: { isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        });

        // 构建树结构
        type RegionNode = AdministrativeRegion & { children: RegionNode[] };
        const regionMap = new Map<string, RegionNode>();
        const roots: RegionNode[] = [];

        // 第一遍：创建节点
        for (const region of allRegions) {
            regionMap.set(region.code, { ...region, children: [] });
        }

        // 第二遍：建立父子关系
        for (const region of allRegions) {
            const node = regionMap.get(region.code);
            if (!node) {
                continue;
            }
            if (region.parentCode && regionMap.has(region.parentCode)) {
                const parent = regionMap.get(region.parentCode);
                if (parent) {
                    parent.children.push(node);
                }
            } else if (region.level === rootLevel) {
                roots.push(node);
            }
        }

        return roots;
    }

    /**
     * 获取单个行政区划
     */
    async findOne(id: string) {
        const region = await this.prisma.administrativeRegion.findUnique({
            where: { id },
            include: {
                children: true,
            },
        });

        if (!region) {
            throw new NotFoundException(`行政区划不存在: ${id}`);
        }

        return region;
    }

    /**
     * 根据代码获取
     */
    async findByCode(code: string) {
        const region = await this.prisma.administrativeRegion.findUnique({
            where: { code },
            include: {
                children: {
                    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
                },
            },
        });

        if (!region) {
            throw new NotFoundException(`行政区划不存在: ${code}`);
        }

        return region;
    }

    /**
     * 更新行政区划
     */
    async update(id: string, dto: UpdateRegionDto) {
        await this.findOne(id);

        if (dto.code) {
            const existing = await this.prisma.administrativeRegion.findFirst({
                where: { code: dto.code, id: { not: id } },
            });
            if (existing) {
                throw new ConflictException(`区划代码 ${dto.code} 已存在`);
            }
        }

        return this.prisma.administrativeRegion.update({
            where: { id },
            data: dto,
        });
    }

    /**
     * 删除行政区划
     */
    async remove(id: string) {
        const region = await this.findOne(id);

        // 检查是否有子区划
        const childCount = await this.prisma.administrativeRegion.count({
            where: { parentCode: region.code },
        });

        if (childCount > 0) {
            throw new ConflictException(`该区划下有 ${childCount} 个子区划，无法删除`);
        }

        return this.prisma.administrativeRegion.delete({ where: { id } });
    }

    /**
     * 获取省份列表
     */
    async getProvinces() {
        return this.prisma.administrativeRegion.findMany({
            where: { level: 'PROVINCE', isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        });
    }

    /**
     * 获取城市列表（根据省份）
     */
    async getCities(provinceCode: string) {
        return this.prisma.administrativeRegion.findMany({
            where: { parentCode: provinceCode, isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        });
    }

    /**
     * 获取区县列表（根据城市）
     */
    async getDistricts(cityCode: string) {
        return this.prisma.administrativeRegion.findMany({
            where: { parentCode: cityCode, level: 'DISTRICT', isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        });
    }

    /**
     * 按层级统计
     */
    async getStatsByLevel() {
        const stats = await this.prisma.administrativeRegion.groupBy({
            by: ['level'],
            _count: { id: true },
            where: { isActive: true },
        });

        return stats.map((s) => ({
            level: s.level,
            count: s._count.id,
        }));
    }
}
