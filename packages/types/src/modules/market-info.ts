import { z } from 'zod';

// Enums
export enum InfoStatus {
    DRAFT = 'DRAFT',
    PUBLISHED = 'PUBLISHED',
    ARCHIVED = 'ARCHIVED',
}

// --- Category Schemas ---
export const CreateCategorySchema = z.object({
    name: z.string().min(1, '名称不能为空'),
    code: z.string().min(1, '编码不能为空').regex(/^[a-zA-Z0-9_\-]+$/, '编码只能包含字母、数字、下划线和连字符'),
    description: z.string().optional().nullable(),
    sortOrder: z.number().int().default(0),
});

export const UpdateCategorySchema = CreateCategorySchema.partial();

export const CategoryResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    code: z.string(),
    description: z.string().nullable(),
    sortOrder: z.number(),
    createdAt: z.date(),
    updatedAt: z.date(),
});

// --- MarketTag Schemas (旧版，保留兼容) ---
export const CreateMarketTagSchema = z.object({
    name: z.string().min(1, '标签名不能为空'),
    color: z.string().optional().nullable(), // hex
});

export const UpdateMarketTagSchema = CreateMarketTagSchema.partial();

export const MarketTagResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    color: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
});

// --- Info Schemas ---
export const CreateInfoSchema = z.object({
    title: z.string().min(1, '标题不能为空'),
    content: z.string().min(1, '内容不能为空'), // rich text HTML
    summary: z.string().optional().nullable(),
    status: z.nativeEnum(InfoStatus).default(InfoStatus.DRAFT),
    categoryId: z.string().uuid('无效的分类ID'),
    tagIds: z.array(z.string().uuid()).optional(),
    attachments: z.array(z.object({
        name: z.string(),
        url: z.string().url(),
        size: z.number().optional()
    })).optional().nullable(),
});

export const UpdateInfoSchema = CreateInfoSchema.partial();

export const InfoResponseSchema = z.object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    summary: z.string().nullable(),
    status: z.nativeEnum(InfoStatus),
    publishedAt: z.date().nullable(),
    categoryId: z.string(),
    // Relations are usually separate or included via specific DTOs, strictly typing basic response first
    createdAt: z.date(),
    updatedAt: z.date(),
    authorId: z.string(),
    attachments: z.any().optional(), // JSON type handling
    category: CategoryResponseSchema.optional(),
    tags: z.array(MarketTagResponseSchema).optional(),
});

// Export Types
export type CreateCategoryDto = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryDto = z.infer<typeof UpdateCategorySchema>;
export type CategoryResponse = z.infer<typeof CategoryResponseSchema>;

export type CreateMarketTagDto = z.infer<typeof CreateMarketTagSchema>;
export type UpdateMarketTagDto = z.infer<typeof UpdateMarketTagSchema>;
export type MarketTagResponse = z.infer<typeof MarketTagResponseSchema>;

export type CreateInfoDto = z.infer<typeof CreateInfoSchema>;
export type UpdateInfoDto = z.infer<typeof UpdateInfoSchema>;
export type InfoResponse = z.infer<typeof InfoResponseSchema>;
