import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditLogService } from './audit-log.service';

/**
 * AuditInterceptor — 全局审计拦截器（NFR-006）
 *
 * 自动捕获写操作（POST/PUT/PATCH/DELETE）并记录审计日志。
 * GET 请求不记录，避免日志膨胀。
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
    constructor(private readonly auditLogService: AuditLogService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const request = context.switchToHttp().getRequest();
        const method: string = request.method ?? '';

        // 仅记录写操作
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
            return next.handle();
        }

        const userId: string = request.user?.userId ?? 'anonymous';
        const path: string = request.url ?? request.path ?? '';
        const action = this.mapMethodToAction(method);
        const resource = this.extractResource(path);
        const resourceId = this.extractResourceId(path);
        const ipAddress: string = request.ip ?? request.headers?.['x-forwarded-for'] ?? '';
        const userAgent: string = request.headers?.['user-agent'] ?? '';

        return next.handle().pipe(
            tap({
                next: () => {
                    // WHY: 异步写入，不阻塞响应
                    void this.auditLogService.logAction({
                        userId,
                        action,
                        resource,
                        resourceId,
                        detail: {
                            method,
                            path,
                            body: this.sanitizeBody(request.body),
                        },
                        ipAddress,
                        userAgent,
                    });
                },
            }),
        );
    }

    private mapMethodToAction(method: string): string {
        const map: Record<string, string> = {
            POST: 'CREATE',
            PUT: 'UPDATE',
            PATCH: 'UPDATE',
            DELETE: 'DELETE',
        };
        return map[method.toUpperCase()] ?? 'UNKNOWN';
    }

    private extractResource(path: string): string {
        // 提取第一段路径作为资源名
        const segments = path.split('/').filter(Boolean);
        return segments[0] ?? 'unknown';
    }

    private extractResourceId(path: string): string | undefined {
        const segments = path.split('/').filter(Boolean);
        // 第二段通常是 ID（如 /conversations/:id）
        return segments[1] ?? undefined;
    }

    /**
     * 清理请求体，移除敏感信息
     */
    private sanitizeBody(body: unknown): Record<string, unknown> | undefined {
        if (!body || typeof body !== 'object') return undefined;
        const record = body as Record<string, unknown>;
        const sanitized = { ...record };
        // 移除密码等敏感字段
        delete sanitized.password;
        delete sanitized.token;
        delete sanitized.secret;
        delete sanitized.apiKey;
        return sanitized;
    }
}
