import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';

@Injectable()
export class AuditLogService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * 记录审计日志
     */
    async logAction(params: {
        userId: string;
        action: string;
        resource: string;
        resourceId?: string;
        detail?: Record<string, unknown>;
        ipAddress?: string;
        userAgent?: string;
    }) {
        return this.prisma.auditLog.create({
            data: {
                userId: params.userId,
                action: params.action,
                resource: params.resource,
                resourceId: params.resourceId,
                detail: params.detail ? (params.detail as Prisma.InputJsonValue) : undefined,
                ipAddress: params.ipAddress,
                userAgent: params.userAgent,
            },
        });
    }

    /**
     * 查询审计日志（分页 + 过滤）
     */
    async queryLogs(params: {
        userId?: string;
        action?: string;
        resource?: string;
        page?: number;
        pageSize?: number;
    }) {
        const page = params.page ?? 1;
        const pageSize = Math.min(params.pageSize ?? 20, 100);
        const skip = (page - 1) * pageSize;

        const where: Record<string, unknown> = {};
        if (params.userId) where.userId = params.userId;
        if (params.action) where.action = params.action;
        if (params.resource) where.resource = params.resource;

        const [items, total] = await Promise.all([
            this.prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
            }),
            this.prisma.auditLog.count({ where }),
        ]);

        return { items, total, page, pageSize };
    }

    /**
     * 按会话 ID 追踪全链路审计日志
     *
     * WHY: 运营需要查看一个分析会话从创建到投递的完整操作链路
     */
    async traceBySession(sessionId: string, limit = 50) {
        const items = await this.prisma.auditLog.findMany({
            where: {
                OR: [
                    { resourceId: sessionId },
                    { resource: 'conversation-session', detail: { path: ['sessionId'], equals: sessionId } },
                    { resource: 'conversation-turn', detail: { path: ['sessionId'], equals: sessionId } },
                    { resource: 'conversation-subscription', detail: { path: ['sessionId'], equals: sessionId } },
                    { resource: 'conversation-backtest', detail: { path: ['sessionId'], equals: sessionId } },
                    { resource: 'conversation-delivery', detail: { path: ['sessionId'], equals: sessionId } },
                    { resource: 'conversation-export', detail: { path: ['sessionId'], equals: sessionId } },
                ],
            },
            orderBy: { createdAt: 'asc' },
            take: Math.min(limit, 200),
        });

        return {
            sessionId,
            traceCount: items.length,
            items,
        };
    }
}
