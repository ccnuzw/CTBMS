import { Controller, Get, Param, Query, Request } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';

interface AuthRequest {
    user: { userId: string };
}

@Controller('audit-logs')
export class AuditLogController {
    constructor(private readonly auditLogService: AuditLogService) { }

    @Get()
    async queryLogs(
        @Query('action') action?: string,
        @Query('resource') resource?: string,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
        @Request() req?: AuthRequest,
    ) {
        return this.auditLogService.queryLogs({
            userId: req?.user?.userId,
            action: action || undefined,
            resource: resource || undefined,
            page: page ? Number(page) : undefined,
            pageSize: pageSize ? Number(pageSize) : undefined,
        });
    }

    @Get('trace/:sessionId')
    async traceBySession(
        @Param('sessionId') sessionId: string,
        @Query('limit') limit?: string,
    ) {
        return this.auditLogService.traceBySession(
            sessionId,
            limit ? Number(limit) : undefined,
        );
    }
}
