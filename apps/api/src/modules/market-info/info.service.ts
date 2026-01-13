import { Injectable, NotFoundException } from '@nestjs/common';
import { MarketInfo } from '@prisma/client';
import { CreateInfoDto, UpdateInfoDto } from '@packages/types';
import { PrismaService } from '../../prisma';

@Injectable()
export class InfoService {
    constructor(private prisma: PrismaService) { }

    async create(data: CreateInfoDto & { authorId: string }) {
        const { tagIds, categoryId, ...rest } = data;

        return this.prisma.marketInfo.create({
            data: {
                ...rest,
                // @ts-ignore - Handle null attachments
                attachments: rest.attachments ?? undefined,
                category: {
                    connect: { id: categoryId }
                },
                tags: tagIds ? {
                    connect: tagIds.map(id => ({ id }))
                } : undefined
            },
            include: {
                category: true,
                tags: true
            }
        });
    }

    async findAll() {
        return this.prisma.marketInfo.findMany({
            include: {
                category: true,
                tags: true
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(id: string) {
        const info = await this.prisma.marketInfo.findUnique({
            where: { id },
            include: {
                category: true,
                tags: true
            }
        });
        if (!info) {
            throw new NotFoundException(`Info with ID ${id} not found`);
        }
        return info;
    }

    async update(id: string, data: UpdateInfoDto) {
        await this.findOne(id);
        const { tagIds, categoryId, ...rest } = data;

        return this.prisma.marketInfo.update({
            where: { id },
            data: {
                ...rest,
                // @ts-ignore - Handle null attachments
                attachments: rest.attachments ?? undefined,
                category: categoryId ? {
                    connect: { id: categoryId }
                } : undefined,
                tags: tagIds ? {
                    set: tagIds.map(id => ({ id }))
                } : undefined
            },
            include: {
                category: true,
                tags: true
            }
        });
    }

    async remove(id: string) {
        await this.findOne(id);
        return this.prisma.marketInfo.delete({
            where: { id },
        });
    }
}
