import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma';
import { REQUIRE_DB_ROLES_KEY } from '../decorators/require-db-roles.decorator';
import {
  REQUIRE_PERMISSION_KEY,
  type RequiredPermission,
} from '../decorators/require-permission.decorator';

/**
 * 角色代码 → 资源操作权限映射（静态配置）
 *
 * 后续可迁移到数据库动态配置。当前以 Map 形式内嵌，
 * 保持与 Prisma Role.code 一致。
 */
const ROLE_PERMISSION_MAP: Record<string, Record<string, string[]>> = {
  SUPER_ADMIN: {
    '*': ['*'],
  },
  ADMIN: {
    MARKET_DATA: ['READ', 'WRITE', 'DELETE', 'EXPORT', 'ADMIN'],
    CONVERSATION: ['READ', 'WRITE', 'DELETE', 'EXPORT'],
    WORKFLOW: ['READ', 'WRITE', 'DELETE', 'EXPORT'],
    REPORT: ['READ', 'WRITE', 'EXPORT'],
    KNOWLEDGE: ['READ', 'WRITE', 'DELETE', 'EXPORT'],
    ENTERPRISE: ['READ', 'WRITE', 'DELETE'],
    USER_MANAGEMENT: ['READ', 'WRITE'],
    SYSTEM_CONFIG: ['READ', 'WRITE'],
  },
  MANAGER: {
    MARKET_DATA: ['READ', 'WRITE', 'EXPORT'],
    CONVERSATION: ['READ', 'WRITE', 'EXPORT'],
    WORKFLOW: ['READ', 'WRITE', 'EXPORT'],
    REPORT: ['READ', 'EXPORT'],
    KNOWLEDGE: ['READ', 'WRITE', 'EXPORT'],
    ENTERPRISE: ['READ'],
    USER_MANAGEMENT: ['READ'],
    SYSTEM_CONFIG: ['READ'],
  },
  STAFF: {
    MARKET_DATA: ['READ'],
    CONVERSATION: ['READ', 'WRITE'],
    WORKFLOW: ['READ'],
    REPORT: ['READ'],
    KNOWLEDGE: ['READ'],
    ENTERPRISE: ['READ'],
  },
};

type AuthRequest = {
  user?: {
    id?: string;
  };
};

@Injectable()
export class DbRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(REQUIRE_DB_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermission = this.reflector.getAllAndOverride<RequiredPermission>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 既无角色要求也无权限要求，放行
    if ((!requiredRoles || requiredRoles.length === 0) && !requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        roles: {
          select: {
            role: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    });

    const roleCodes = (user?.roles ?? []).map((item) => item.role.code);
    const roleCodeSet = new Set(roleCodes);

    // ── 检查 @RequireDbRoles ────────────────────────────────────────────────
    if (requiredRoles && requiredRoles.length > 0) {
      const hasRole = requiredRoles.some((role) => roleCodeSet.has(role));
      if (!hasRole) {
        throw new ForbiddenException('权限不足');
      }
    }

    // ── 检查 @RequirePermission ─────────────────────────────────────────────
    if (requiredPermission) {
      const hasPermission = this.checkPermission(
        roleCodes,
        requiredPermission.resource,
        requiredPermission.action,
      );
      if (!hasPermission) {
        throw new ForbiddenException(
          `权限不足: 需要 ${requiredPermission.resource}:${requiredPermission.action}`,
        );
      }
    }

    return true;
  }

  /**
   * 检查用户角色组是否拥有指定资源+操作的权限
   */
  private checkPermission(roleCodes: string[], resource: string, action: string): boolean {
    for (const roleCode of roleCodes) {
      const permissions = ROLE_PERMISSION_MAP[roleCode];
      if (!permissions) {
        continue;
      }

      // 超级管理员通配符
      if (permissions['*']?.includes('*')) {
        return true;
      }

      const resourceActions = permissions[resource];
      if (resourceActions && (resourceActions.includes(action) || resourceActions.includes('*'))) {
        return true;
      }
    }
    return false;
  }
}
