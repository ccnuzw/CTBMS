import { z } from 'zod';

/**
 * 资源类型枚举 — 可被权限控制的业务资源
 */
export const PermissionResourceEnum = z.enum([
    'MARKET_DATA',
    'CONVERSATION',
    'WORKFLOW',
    'REPORT',
    'KNOWLEDGE',
    'ENTERPRISE',
    'USER_MANAGEMENT',
    'SYSTEM_CONFIG',
]);

/**
 * 操作类型枚举 — 对资源的操作种类
 */
export const PermissionActionEnum = z.enum([
    'READ',
    'WRITE',
    'DELETE',
    'EXPORT',
    'ADMIN',
]);

/**
 * 单条权限条目（资源 + 操作）
 */
export const PermissionEntrySchema = z.object({
    resource: PermissionResourceEnum,
    actions: z.array(PermissionActionEnum).min(1),
});

/**
 * 角色权限矩阵定义
 */
export const RolePermissionSchema = z.object({
    roleCode: z.string().min(1).max(64),
    permissions: z.array(PermissionEntrySchema),
});

// ── Type Exports ──────────────────────────────────────────────────────────────

export type PermissionResource = z.infer<typeof PermissionResourceEnum>;
export type PermissionAction = z.infer<typeof PermissionActionEnum>;
export type PermissionEntry = z.infer<typeof PermissionEntrySchema>;
export type RolePermission = z.infer<typeof RolePermissionSchema>;
