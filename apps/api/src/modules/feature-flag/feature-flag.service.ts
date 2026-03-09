import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { createHash } from 'crypto';

/**
 * Feature Flag 灰度开关服务
 *
 * 支持：全局开关、百分比灰度、用户白名单、环境过滤
 *
 * PRD TDD 定义的 5 个核心开关：
 * 1. agent.subscription.enable    — 订阅周期推送总开关
 * 2. agent.preflight.strict       — 执行前置校验严格模式
 * 3. agent.delivery.retry.enable  — 投递失败重试开关
 * 4. agent.backtest.enable        — 回测功能开关
 * 5. agent.skill.provisional      — 临时能力自动授权开关
 */
@Injectable()
export class FeatureFlagService {
    private readonly logger = new Logger(FeatureFlagService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * 判断某用户是否命中某个灰度开关
     */
    async isEnabled(
        flagKey: string,
        options?: { userId?: string; environment?: string },
    ): Promise<boolean> {
        const flag = await this.prisma.featureFlag.findUnique({
            where: { flagKey },
        });

        if (!flag) {
            // 未注册的 flag 默认关闭
            return false;
        }

        // 全局关闭
        if (!flag.isEnabled) {
            return false;
        }

        // 环境检查
        if (options?.environment) {
            const envs = Array.isArray(flag.environments) ? flag.environments : [];
            if (envs.length > 0 && !envs.includes(options.environment)) {
                return false;
            }
        }

        // 白名单优先
        if (options?.userId) {
            const allowList = Array.isArray(flag.allowUserIds) ? flag.allowUserIds : [];
            if (allowList.includes(options.userId)) {
                return true;
            }
        }

        // 百分比灰度
        if (flag.rolloutPercent >= 100) {
            return true;
        }
        if (flag.rolloutPercent <= 0) {
            return false;
        }

        // WHY: 使用 userId + flagKey 的 hash 确保同一用户对同一开关的结果稳定
        if (options?.userId) {
            const hash = createHash('md5')
                .update(`${options.userId}:${flagKey}`)
                .digest('hex');
            const bucket = parseInt(hash.slice(0, 8), 16) % 100;
            return bucket < flag.rolloutPercent;
        }

        // 无 userId 时按 rolloutPercent 随机
        return Math.random() * 100 < flag.rolloutPercent;
    }

    /**
     * 获取所有 Flag
     */
    async listFlags() {
        return this.prisma.featureFlag.findMany({
            orderBy: { flagKey: 'asc' },
        });
    }

    /**
     * 获取单个 Flag
     */
    async getFlag(flagKey: string) {
        return this.prisma.featureFlag.findUnique({
            where: { flagKey },
        });
    }

    /**
     * 创建 Flag（幂等）
     */
    async upsertFlag(dto: {
        flagKey: string;
        description?: string;
        isEnabled?: boolean;
        rolloutPercent?: number;
        allowUserIds?: string[];
        environments?: string[];
        metadata?: Record<string, unknown>;
    }) {
        return this.prisma.featureFlag.upsert({
            where: { flagKey: dto.flagKey },
            create: {
                flagKey: dto.flagKey,
                description: dto.description ?? null,
                isEnabled: dto.isEnabled ?? false,
                rolloutPercent: dto.rolloutPercent ?? 0,
                allowUserIds: (dto.allowUserIds ?? []) as Prisma.InputJsonValue,
                environments: (dto.environments ?? ['production']) as Prisma.InputJsonValue,
                metadata: dto.metadata ? (dto.metadata as Prisma.InputJsonValue) : undefined,
            },
            update: {
                description: dto.description,
                isEnabled: dto.isEnabled,
                rolloutPercent: dto.rolloutPercent,
                allowUserIds: dto.allowUserIds
                    ? (dto.allowUserIds as Prisma.InputJsonValue)
                    : undefined,
                environments: dto.environments
                    ? (dto.environments as Prisma.InputJsonValue)
                    : undefined,
                metadata: dto.metadata
                    ? (dto.metadata as Prisma.InputJsonValue)
                    : undefined,
            },
        });
    }

    /**
     * 更新 Flag
     */
    async updateFlag(
        flagKey: string,
        dto: {
            isEnabled?: boolean;
            rolloutPercent?: number;
            allowUserIds?: string[];
            environments?: string[];
            description?: string;
            metadata?: Record<string, unknown>;
        },
    ) {
        return this.prisma.featureFlag.update({
            where: { flagKey },
            data: {
                isEnabled: dto.isEnabled,
                rolloutPercent: dto.rolloutPercent,
                allowUserIds: dto.allowUserIds
                    ? (dto.allowUserIds as Prisma.InputJsonValue)
                    : undefined,
                environments: dto.environments
                    ? (dto.environments as Prisma.InputJsonValue)
                    : undefined,
                description: dto.description,
                metadata: dto.metadata
                    ? (dto.metadata as Prisma.InputJsonValue)
                    : undefined,
            },
        });
    }

    /**
     * 删除 Flag
     */
    async deleteFlag(flagKey: string) {
        return this.prisma.featureFlag.delete({
            where: { flagKey },
        });
    }

    /**
     * 初始化 TDD 定义的 5 个核心开关
     */
    async seedDefaultFlags() {
        const defaults = [
            {
                flagKey: 'agent.subscription.enable',
                description: '订阅周期推送总开关',
                isEnabled: true,
                rolloutPercent: 100,
            },
            {
                flagKey: 'agent.preflight.strict',
                description: '执行前置校验严格模式',
                isEnabled: false,
                rolloutPercent: 0,
            },
            {
                flagKey: 'agent.delivery.retry.enable',
                description: '投递失败重试开关',
                isEnabled: true,
                rolloutPercent: 100,
            },
            {
                flagKey: 'agent.backtest.enable',
                description: '回测功能开关',
                isEnabled: true,
                rolloutPercent: 100,
            },
            {
                flagKey: 'agent.skill.provisional',
                description: '临时能力自动授权开关',
                isEnabled: true,
                rolloutPercent: 50,
            },
        ];

        const results = [];
        for (const flag of defaults) {
            const result = await this.upsertFlag(flag);
            results.push(result);
        }
        this.logger.log(`Seeded ${results.length} default feature flags`);
        return results;
    }
}
