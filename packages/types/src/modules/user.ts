import { z } from 'zod';
import { EntityStatusEnum } from './organization.js';

// =============================================
// 用户状态枚举（员工状态）
// =============================================
export const UserStatusEnum = z.enum([
    'ACTIVE',     // 在职
    'PROBATION',  // 试用期
    'RESIGNED',   // 离职
    'SUSPENDED',  // 停职
]);

// 性别枚举
export const GenderEnum = z.enum(['MALE', 'FEMALE', 'OTHER']);

// =============================================
// 用户 Schema (合并原 User + Employee)
// =============================================
export const UserSchema = z.object({
    id: z.string().uuid(),
    username: z.string().min(2, '用户名至少2个字符'),
    email: z.string().email(),
    name: z.string().min(1, '姓名不能为空'),
    gender: GenderEnum.nullable().optional(),
    birthday: z.date().nullable().optional(),
    employeeNo: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    organizationId: z.string().uuid().nullable().optional(),
    departmentId: z.string().uuid().nullable().optional(),
    position: z.string().nullable().optional(),
    hireDate: z.date().nullable().optional(),
    status: UserStatusEnum.default('ACTIVE'),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});

export const CreateUserSchema = z.object({
    username: z.string().min(2, '用户名至少2个字符'),
    email: z.string().email('邮箱格式不正确'),
    name: z.string().min(1, '姓名不能为空'),
    gender: GenderEnum.nullable().optional(),
    birthday: z.date().nullable().optional(),
    employeeNo: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    organizationId: z.string().uuid().nullable().optional(),
    departmentId: z.string().uuid().nullable().optional(),
    position: z.string().nullable().optional(),
    hireDate: z.date().nullable().optional(),
    status: UserStatusEnum.default('ACTIVE'),
    roleIds: z.array(z.string().uuid()).optional(),
});

export const UpdateUserSchema = CreateUserSchema.partial().omit({
    username: true, // 用户名不可修改
    email: true,    // 邮箱不可修改
});

// 分配角色
export const AssignRolesSchema = z.object({
    roleIds: z.array(z.string().uuid()),
});

// =============================================
// 角色 Schema
// =============================================
export const RoleSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1, '角色名称不能为空'),
    code: z.string().min(1, '角色代码不能为空'),
    description: z.string().nullable().optional(),
    isSystem: z.boolean().default(false),
    sortOrder: z.number().int().default(0),
    status: EntityStatusEnum.default('ACTIVE'),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});

export const CreateRoleSchema = RoleSchema.pick({
    name: true,
    code: true,
    description: true,
    isSystem: true,
    sortOrder: true,
    status: true,
});

export const UpdateRoleSchema = CreateRoleSchema.partial().omit({
    code: true, // 角色代码不可修改
});

// =============================================
// 导出 TypeScript 类型
// =============================================
export type UserStatus = z.infer<typeof UserStatusEnum>;
export type Gender = z.infer<typeof GenderEnum>;

export type UserDto = z.infer<typeof UserSchema>;
export type CreateUserDto = z.infer<typeof CreateUserSchema>;
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
export type AssignRolesDto = z.infer<typeof AssignRolesSchema>;

export type RoleDto = z.infer<typeof RoleSchema>;
export type CreateRoleDto = z.infer<typeof CreateRoleSchema>;
export type UpdateRoleDto = z.infer<typeof UpdateRoleSchema>;
