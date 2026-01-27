import { z } from 'zod';

// ======= Enums =======
export enum EnterpriseType {
    SUPPLIER = 'SUPPLIER',
    CUSTOMER = 'CUSTOMER',
    LOGISTICS = 'LOGISTICS',
    GROUP = 'GROUP',
}

export enum ContactRole {
    PROCUREMENT = 'PROCUREMENT',
    EXECUTION = 'EXECUTION',
    FINANCE = 'FINANCE',
    MANAGEMENT = 'MANAGEMENT',
}

// ======= Contact Schemas =======
export const CreateContactSchema = z.object({
    name: z.string().min(1, '姓名不能为空'),
    title: z.string().optional().nullable(),
    role: z.nativeEnum(ContactRole),
    phone: z.string().min(1, '电话不能为空'),
    email: z.string().email('邮箱格式不正确').optional().nullable(),
    notes: z.string().optional().nullable(),
});

export const UpdateContactSchema = CreateContactSchema.partial();

export const ContactResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    title: z.string().nullable(),
    role: z.nativeEnum(ContactRole),
    phone: z.string(),
    email: z.string().nullable(),
    notes: z.string().nullable(),
    enterpriseId: z.string(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});

// ======= BankAccount Schemas =======
export const CreateBankAccountSchema = z.object({
    bankName: z.string().min(1, '开户行不能为空'),
    accountNumber: z.string().min(1, '账号不能为空'),
    accountName: z.string().min(1, '户名不能为空'),
    branch: z.string().optional().nullable(),
    isDefault: z.boolean().default(false),
    isWhitelisted: z.boolean().default(false),
});

export const UpdateBankAccountSchema = CreateBankAccountSchema.partial();

export const BankAccountResponseSchema = z.object({
    id: z.string(),
    bankName: z.string(),
    accountNumber: z.string(),
    accountName: z.string(),
    branch: z.string().nullable(),
    isDefault: z.boolean(),
    isWhitelisted: z.boolean(),
    enterpriseId: z.string(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});

// ======= Enterprise Schemas =======
export const CreateEnterpriseSchema = z.object({
    name: z.string().min(1, '企业名称不能为空'),
    shortName: z.string().optional().nullable(),
    taxId: z.string().min(1, '税号不能为空'),
    types: z.array(z.nativeEnum(EnterpriseType)).min(1, '至少选择一种业务身份'),
    parentId: z.string().uuid().optional().nullable(),
    province: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    longitude: z.number().optional().nullable(),
    latitude: z.number().optional().nullable(),
    description: z.string().optional().nullable(),
    riskScore: z.number().int().min(0).max(100).default(80),
    tagIds: z.array(z.string().uuid()).optional(),
    contacts: z.array(CreateContactSchema).optional(),
    bankAccounts: z.array(CreateBankAccountSchema).optional(),
});

export const UpdateEnterpriseSchema = CreateEnterpriseSchema.partial().omit({ taxId: true });

// 基础响应 Schema（不含嵌套关联以避免循环引用）
export const EnterpriseBaseResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    shortName: z.string().nullable(),
    taxId: z.string(),
    types: z.array(z.nativeEnum(EnterpriseType)),
    parentId: z.string().nullable(),
    province: z.string().nullable(),
    city: z.string().nullable(),
    address: z.string().nullable(),
    longitude: z.number().nullable().optional(),
    latitude: z.number().nullable().optional(),
    description: z.string().nullable(),
    riskScore: z.number(),
    status: z.string(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});

// 完整响应 Schema（含可选关联）
export const EnterpriseResponseSchema = EnterpriseBaseResponseSchema.extend({
    parent: EnterpriseBaseResponseSchema.optional().nullable(),
    children: z.array(EnterpriseBaseResponseSchema).optional(),
    contacts: z.array(ContactResponseSchema).optional(),
    bankAccounts: z.array(BankAccountResponseSchema).optional(),
    tags: z
        .array(
            z.object({
                id: z.string(),
                name: z.string(),
                color: z.string().nullable(),
                icon: z.string().nullable(),
            })
        )
        .optional(),
    _count: z
        .object({
            children: z.number(),
            contacts: z.number(),
            bankAccounts: z.number(),
        })
        .optional(),
});

// ======= Query Schemas =======
export const EnterpriseQuerySchema = z.object({
    type: z.nativeEnum(EnterpriseType).optional(),
    search: z.string().optional(),
    parentId: z.string().uuid().optional().nullable(),
    status: z.string().optional(),
    rootOnly: z.preprocess((val) => val === 'true' || val === true, z.boolean().optional()),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().default(20),
});

// ======= List Response Schema =======
export const EnterpriseListResponseSchema = z.object({
    data: z.array(EnterpriseResponseSchema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
    totalPages: z.number(),
});

// ======= Export Types =======
export type CreateEnterpriseDto = z.infer<typeof CreateEnterpriseSchema>;
export type UpdateEnterpriseDto = z.infer<typeof UpdateEnterpriseSchema>;
export type EnterpriseResponse = z.infer<typeof EnterpriseResponseSchema>;
export type EnterpriseBaseResponse = z.infer<typeof EnterpriseBaseResponseSchema>;
export type EnterpriseQueryParams = z.infer<typeof EnterpriseQuerySchema>;
export type EnterpriseListResponse = z.infer<typeof EnterpriseListResponseSchema>;

export type CreateContactDto = z.infer<typeof CreateContactSchema>;
export type UpdateContactDto = z.infer<typeof UpdateContactSchema>;
export type ContactResponse = z.infer<typeof ContactResponseSchema>;

export type CreateBankAccountDto = z.infer<typeof CreateBankAccountSchema>;
export type UpdateBankAccountDto = z.infer<typeof UpdateBankAccountSchema>;
export type BankAccountResponse = z.infer<typeof BankAccountResponseSchema>;
