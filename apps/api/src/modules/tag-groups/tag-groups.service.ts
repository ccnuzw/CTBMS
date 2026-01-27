import { Injectable, NotFoundException } from '@nestjs/common';
import { TagGroup } from '@prisma/client';
import { CreateTagGroupDto, UpdateTagGroupDto } from '@packages/types';
import { PrismaService } from '../../prisma';

@Injectable()
export class TagGroupsService {
    constructor(private prisma: PrismaService) { }

    async create(data: CreateTagGroupDto): Promise<TagGroup> {
        return this.prisma.tagGroup.create({
            data,
        });
    }

    async findAll(): Promise<(TagGroup & { _count: { tags: number } })[]> {
        return this.prisma.tagGroup.findMany({
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
            include: {
                _count: { select: { tags: true } },
            },
        });
    }

    async findOne(id: string): Promise<TagGroup> {
        const group = await this.prisma.tagGroup.findUnique({
            where: { id },
            include: { tags: true },
        });
        if (!group) {
            throw new NotFoundException(`标签组 ID ${id} 不存在`);
        }
        return group;
    }

    async update(id: string, data: UpdateTagGroupDto): Promise<TagGroup> {
        await this.findOne(id);
        return this.prisma.tagGroup.update({
            where: { id },
            data,
        });
    }

    async remove(id: string): Promise<TagGroup> {
        await this.findOne(id);
        return this.prisma.tagGroup.delete({
            where: { id },
        });
    }
}
