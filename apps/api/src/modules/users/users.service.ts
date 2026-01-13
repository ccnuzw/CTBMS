import { Injectable } from '@nestjs/common';
import { PrismaClient, User, Role } from '@prisma/client';
import { CreateUserDto } from '@packages/types';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaClient) { }

    async create(data: CreateUserDto): Promise<User> {
        return this.prisma.user.create({
            data: {
                ...data,
                role: data.role as Role, // Ensure Enum match
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
}
