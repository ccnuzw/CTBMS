import { Injectable, NotFoundException } from '@nestjs/common';
import { MarketCategory } from '@prisma/client';
import { CreateCategoryDto, UpdateCategoryDto } from '@packages/types';
import { PrismaService } from '../../prisma';

@Injectable()
export class CategoryService {
    constructor(private prisma: PrismaService) { }

    async create(data: CreateCategoryDto): Promise<MarketCategory> {
        return this.prisma.marketCategory.create({
            data,
        });
    }

    async findAll(): Promise<MarketCategory[]> {
        return this.prisma.marketCategory.findMany({
            orderBy: { sortOrder: 'asc' },
        });
    }

    async findOne(id: string): Promise<MarketCategory> {
        const category = await this.prisma.marketCategory.findUnique({
            where: { id },
        });
        if (!category) {
            throw new NotFoundException(`Category with ID ${id} not found`);
        }
        return category;
    }

    async update(id: string, data: UpdateCategoryDto): Promise<MarketCategory> {
        await this.findOne(id);
        return this.prisma.marketCategory.update({
            where: { id },
            data,
        });
    }

    async remove(id: string): Promise<MarketCategory> {
        await this.findOne(id);
        return this.prisma.marketCategory.delete({
            where: { id },
        });
    }
}
