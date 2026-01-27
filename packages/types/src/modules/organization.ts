import { z } from 'zod';

// =============================================
// 组织类型枚举
// =============================================
export const OrganizationTypeEnum = z.enum([
    'HEADQUARTERS', // 总部
    'REGION',       // 大区/分公司
    'BRANCH',       // 经营部/办事处
    'SUBSIDIARY',   // 子公司
]);

export const EntityStatusEnum = z.enum(['ACTIVE', 'INACTIVE']);

// =============================================
// 组织 Schema
// =============================================
export const OrganizationSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1, '组织名称不能为空'),
    code: z.string().min(1, '组织代码不能为空'),
    type: OrganizationTypeEnum,
    description: z.string().nullable().optional(),
    parentId: z.string().uuid().nullable().optional(),
    sortOrder: z.number().int().default(0),
    status: EntityStatusEnum.default('ACTIVE'),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});

export const CreateOrganizationSchema = OrganizationSchema.pick({
    name: true,
    code: true,
    type: true,
    description: true,
    parentId: true,
    sortOrder: true,
    status: true,
});

export const UpdateOrganizationSchema = CreateOrganizationSchema.partial();

// 树形节点类型 (递归)
export interface OrganizationTreeNode {
    id: string;
    name: string;
    code: string;
    type: z.infer<typeof OrganizationTypeEnum>;
    description: string | null;
    parentId: string | null;
    sortOrder: number;
    status: z.infer<typeof EntityStatusEnum>;
    children: OrganizationTreeNode[];
}

// =============================================
// 部门 Schema
// =============================================
export const DepartmentSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1, '部门名称不能为空'),
    code: z.string().min(1, '部门代码不能为空'),
    description: z.string().nullable().optional(),
    organizationId: z.string().uuid(),
    parentId: z.string().uuid().nullable().optional(),
    sortOrder: z.number().int().default(0),
    status: EntityStatusEnum.default('ACTIVE'),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});

export const CreateDepartmentSchema = DepartmentSchema.pick({
    name: true,
    code: true,
    description: true,
    organizationId: true,
    parentId: true,
    sortOrder: true,
    status: true,
});

export const UpdateDepartmentSchema = CreateDepartmentSchema.partial().omit({
    organizationId: true, // 不允许更改所属组织
});

// 树形节点类型 (递归)
export interface DepartmentTreeNode {
    id: string;
    name: string;
    code: string;
    description: string | null;
    organizationId: string;
    parentId: string | null;
    sortOrder: number;
    status: z.infer<typeof EntityStatusEnum>;
    children: DepartmentTreeNode[];
}

// =============================================
// 导出 TypeScript 类型
// =============================================
export type OrganizationType = z.infer<typeof OrganizationTypeEnum>;
export type EntityStatus = z.infer<typeof EntityStatusEnum>;

export type OrganizationDto = z.infer<typeof OrganizationSchema>;
export type CreateOrganizationDto = z.infer<typeof CreateOrganizationSchema>;
export type UpdateOrganizationDto = z.infer<typeof UpdateOrganizationSchema>;

export type DepartmentDto = z.infer<typeof DepartmentSchema>;
export type CreateDepartmentDto = z.infer<typeof CreateDepartmentSchema>;
export type UpdateDepartmentDto = z.infer<typeof UpdateDepartmentSchema>;
