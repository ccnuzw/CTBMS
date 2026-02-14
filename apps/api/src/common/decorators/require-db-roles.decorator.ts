import { SetMetadata } from '@nestjs/common';

export const REQUIRE_DB_ROLES_KEY = 'require-db-roles';

export const RequireDbRoles = (...roles: string[]) =>
  SetMetadata(REQUIRE_DB_ROLES_KEY, roles);
