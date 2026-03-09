import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION_KEY = 'require-permission';

export interface RequiredPermission {
    resource: string;
    action: string;
}

/**
 * 细粒度权限装饰器 — 控制资源级操作权限
 *
 * 用法示例:
 *   @RequirePermission('MARKET_DATA', 'WRITE')
 *   @RequirePermission('REPORT', 'EXPORT')
 *
 * 与现有 @RequireDbRoles() 共存，DbRoleGuard 会同时检查两种元数据。
 */
export const RequirePermission = (resource: string, action: string) =>
    SetMetadata(REQUIRE_PERMISSION_KEY, { resource, action } as RequiredPermission);
