import { Injectable } from '@nestjs/common';
import { User, Role } from '@prisma/client';
import { CreateUserDto } from '@packages/types';
import { PrismaService } from '../../prisma';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    async create(data: CreateUserDto): Promise<User> {
        return this.prisma.user.create({
            data: {
                ...data,
                role: data.role as Role,
            },
        });
    }

    async update(id: string, data: Partial<CreateUserDto>): Promise<User> {
        return this.prisma.user.update({
            where: { id },
            data: {
                ...data,
                role: data.role ? (data.role as Role) : undefined,
            },
        });
    }

    async findAll(): Promise<User[]> {
        return this.prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }

    async remove(id: string): Promise<User> {
        return this.prisma.user.delete({
            where: { id },
        });
    }
}
