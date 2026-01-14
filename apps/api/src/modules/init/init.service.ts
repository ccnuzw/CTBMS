import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';

@Injectable()
export class InitService {
    private readonly logger = new Logger(InitService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * 检查系统是否已初始化
     */
    async isInitialized(): Promise<boolean> {
        const adminRole = await this.prisma.role.findFirst({
            where: { code: 'SUPER_ADMIN' },
        });
        return !!adminRole;
    }

    /**
     * 初始化系统数据
     */
    async initialize(): Promise<{
        success: boolean;
        message: string;
        data?: {
            roles: string[];
            adminUser: string;
        };
    }> {
        // 检查是否已初始化
        const initialized = await this.isInitialized();
        if (initialized) {
            return {
                success: false,
                message: '系统已初始化，无需重复执行',
            };
        }

        try {
            // 在事务中创建初始数据
            const result = await this.prisma.$transaction(async (tx) => {
                // 1. 创建系统管理员角色
                const superAdminRole = await tx.role.create({
                    data: {
                        name: '系统管理员',
                        code: 'SUPER_ADMIN',
                        description: '系统超级管理员，拥有所有权限',
                        isSystem: true,
                        sortOrder: 0,
                        status: 'ACTIVE',
                    },
                });
                this.logger.log('创建角色: 系统管理员');

                // 2. 创建普通员工角色
                const staffRole = await tx.role.create({
                    data: {
                        name: '普通员工',
                        code: 'STAFF',
                        description: '普通员工角色',
                        isSystem: true,
                        sortOrder: 100,
                        status: 'ACTIVE',
                    },
                });
                this.logger.log('创建角色: 普通员工');

                // 3. 创建默认管理员用户
                const adminUser = await tx.user.create({
                    data: {
                        username: 'admin',
                        email: 'admin@example.com',
                        name: '系统管理员',
                        status: 'ACTIVE',
                    },
                });
                this.logger.log('创建用户: admin');

                // 4. 分配管理员角色
                await tx.userRole.create({
                    data: {
                        userId: adminUser.id,
                        roleId: superAdminRole.id,
                    },
                });
                this.logger.log('分配角色: admin -> 系统管理员');

                return {
                    roles: [superAdminRole.name, staffRole.name],
                    adminUser: adminUser.username,
                };
            });

            return {
                success: true,
                message: '系统初始化成功',
                data: result,
            };
        } catch (error) {
            this.logger.error('初始化失败', error);
            throw error;
        }
    }
}
