-- =============================================
-- 系统初始化种子数据
-- 创建系统管理员角色和默认管理员用户
-- =============================================

-- 1. 创建系统管理员角色
INSERT INTO "Role" (id, name, code, description, "isSystem", "sortOrder", status, "createdAt", "updatedAt")
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    '系统管理员',
    'SUPER_ADMIN',
    '系统超级管理员，拥有所有权限',
    true,
    0,
    'ACTIVE',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- 2. 创建普通员工角色  
INSERT INTO "Role" (id, name, code, description, "isSystem", "sortOrder", status, "createdAt", "updatedAt")
VALUES (
    'a0000000-0000-0000-0000-000000000002',
    '普通员工',
    'STAFF',
    '普通员工角色',
    true,
    100,
    'ACTIVE',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- 3. 创建默认管理员用户
INSERT INTO "User" (id, username, email, name, status, "createdAt", "updatedAt")
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'admin',
    'admin@example.com',
    '系统管理员',
    'ACTIVE',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- 4. 分配管理员角色给默认用户
INSERT INTO "UserRole" (id, "userId", "roleId", "createdAt")
VALUES (
    'c0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- 5. 创建 System Placeholder 用户 (用于 API 无鉴权测试)
INSERT INTO "User" (id, username, email, name, status, "createdAt", "updatedAt")
VALUES (
    'system-user-placeholder',
    'system_bot',
    'system@ctbms.com',
    '系统自动采集',
    'ACTIVE',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- 6. 分配普通员工角色给 System 用户
INSERT INTO "UserRole" (id, "userId", "roleId", "createdAt")
VALUES (
    'c0000000-0000-0000-0000-000000000002',
    'system-user-placeholder',
    'a0000000-0000-0000-0000-000000000002',
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 使用说明：
-- 在 PostgreSQL 中执行此脚本初始化系统数据
-- 默认管理员账号：admin
-- 默认邮箱：admin@example.com
-- =============================================
