import { UnauthorizedException } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { randomUUID } from 'node:crypto';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

/**
 * Shared base class for market-data controllers, providing auth & response helpers.
 */
export abstract class MarketDataBaseController {
    protected getUserId(req: AuthRequest) {
        const userId = req.user?.id;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return userId;
    }

    protected success<T>(req: AuthRequest, data: T) {
        return {
            success: true as const,
            data,
            traceId: this.getTraceId(req),
            ts: new Date().toISOString(),
        };
    }

    protected getTraceId(req: AuthRequest): string {
        const traceHeader = req.headers?.['x-trace-id'];
        const traceId = Array.isArray(traceHeader) ? traceHeader[0] : traceHeader;
        if (typeof traceId === 'string' && traceId.trim().length > 0) {
            return traceId.trim();
        }
        return `tr_${randomUUID()}`;
    }
}
