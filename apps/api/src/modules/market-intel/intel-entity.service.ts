import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { IntelEntityLinkType, CreateIntelEntityLinkDto } from '@packages/types';

@Injectable()
export class IntelEntityService {
    constructor(private prisma: PrismaService) { }

    /**
     * 创建情报-实体关联
     */
    async createLink(dto: CreateIntelEntityLinkDto) {
        return this.prisma.intelEntityLink.upsert({
            where: {
                intelId_enterpriseId: {
                    intelId: dto.intelId,
                    enterpriseId: dto.enterpriseId,
                },
            },
            update: {
                linkType: dto.linkType || IntelEntityLinkType.MENTIONED,
            },
            create: {
                intelId: dto.intelId,
                enterpriseId: dto.enterpriseId,
                linkType: dto.linkType || IntelEntityLinkType.MENTIONED,
            },
            include: {
                enterprise: {
                    select: { id: true, name: true, shortName: true },
                },
            },
        });
    }

    /**
     * 根据 AI 识别的实体名称自动关联
     */
    async autoLinkEntities(intelId: string, entityNames: string[]) {
        if (!entityNames || entityNames.length === 0) return [];

        const links: any[] = [];

        for (const name of entityNames) {
            // 模糊匹配企业
            const enterprise = await this.prisma.enterprise.findFirst({
                where: {
                    OR: [
                        { name: { contains: name, mode: 'insensitive' } },
                        { shortName: { contains: name, mode: 'insensitive' } },
                    ],
                },
            });

            if (enterprise) {
                const link = await this.createLink({
                    intelId,
                    enterpriseId: enterprise.id,
                    linkType: IntelEntityLinkType.MENTIONED,
                });
                links.push(link);
            }
        }

        return links;
    }

    /**
     * 获取情报关联的所有实体
     */
    async findByIntel(intelId: string) {
        return this.prisma.intelEntityLink.findMany({
            where: { intelId },
            include: {
                enterprise: {
                    select: {
                        id: true,
                        name: true,
                        shortName: true,
                        types: true,
                        province: true,
                        city: true,
                        riskScore: true,
                    },
                },
            },
        });
    }

    /**
     * 获取企业关联的所有情报
     */
    async findByEnterprise(enterpriseId: string, limit = 20) {
        return this.prisma.intelEntityLink.findMany({
            where: { enterpriseId },
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                intel: {
                    select: {
                        id: true,
                        category: true,
                        rawContent: true,
                        summary: true,
                        effectiveTime: true,
                        location: true,
                    },
                },
            },
        });
    }

    /**
     * 删除关联
     */
    async removeLink(intelId: string, enterpriseId: string) {
        await this.prisma.intelEntityLink.delete({
            where: {
                intelId_enterpriseId: {
                    intelId,
                    enterpriseId,
                },
            },
        });
        return { success: true };
    }

    /**
     * 获取企业情报时间线（用于企业360画像）
     */
    async getEnterpriseTimeline(enterpriseId: string) {
        const links = await this.prisma.intelEntityLink.findMany({
            where: { enterpriseId },
            orderBy: { createdAt: 'desc' },
            include: {
                intel: {
                    select: {
                        id: true,
                        category: true,
                        rawContent: true,
                        summary: true,
                        aiAnalysis: true,
                        effectiveTime: true,
                        location: true,
                        author: {
                            select: { id: true, name: true },
                        },
                    },
                },
            },
        });

        return links.map((link) => ({
            id: link.id,
            linkType: link.linkType,
            createdAt: link.createdAt,
            intel: link.intel,
        }));
    }
}
