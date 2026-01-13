import { Injectable, NotFoundException } from '@nestjs/common';
import { MarketTag } from '@prisma/client';
import { CreateTagDto, UpdateTagDto } from '@packages/types';
import { PrismaService } from '../../prisma';

@Injectable()
export class TagService {
    constructor(private prisma: PrismaService) { }

    async create(data: CreateTagDto): Promise<MarketTag> {
        return this.prisma.marketTag.create({
            data,
        });
    }

    async findAll(): Promise<MarketTag[]> {
        return this.prisma.marketTag.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(id: string): Promise<MarketTag> {
        const tag = await this.prisma.marketTag.findUnique({
            where: { id },
        });
        if (!tag) {
            throw new NotFoundException(`Tag with ID ${id} not found`);
        }
        return tag;
    }

    async update(id: string, data: UpdateTagDto): Promise<MarketTag> {
        await this.findOne(id);
        return this.prisma.marketTag.update({
            where: { id },
            data,
        });
    }

    async remove(id: string): Promise<MarketTag> {
        await this.findOne(id);
        return this.prisma.marketTag.delete({
            where: { id },
        });
    }
}
