import { z } from 'zod';

// ======= Enums =======
export enum TagScope {
  GLOBAL = 'GLOBAL',
  CUSTOMER = 'CUSTOMER',
  SUPPLIER = 'SUPPLIER',
  LOGISTICS = 'LOGISTICS',
  CONTRACT = 'CONTRACT',
  MARKET_INFO = 'MARKET_INFO',
}

export enum TaggableEntityType {
  CUSTOMER = 'CUSTOMER',
  SUPPLIER = 'SUPPLIER',
  LOGISTICS = 'LOGISTICS',
  CONTRACT = 'CONTRACT',
  MARKET_INFO = 'MARKET_INFO',
}

// ======= Tag Group Schemas =======
export const CreateTagGroupSchema = z.object({
  name: z.string().min(1, '组名不能为空'),
  description: z.string().optional().nullable(),
  isExclusive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const UpdateTagGroupSchema = CreateTagGroupSchema.partial();

export const TagGroupResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isExclusive: z.boolean(),
  sortOrder: z.number(),
  status: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  _count: z.object({ tags: z.number() }).optional(),
});

// ======= Tag Schemas =======
export const CreateTagSchema = z.object({
  name: z.string().min(1, '标签名不能为空'),
  color: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  scopes: z.array(z.nativeEnum(TagScope)).default([TagScope.GLOBAL]),
  groupId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().default(0),
});

export const UpdateTagSchema = CreateTagSchema.partial();

export const TagResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  description: z.string().nullable(),
  scopes: z.array(z.nativeEnum(TagScope)),
  groupId: z.string().nullable(),
  sortOrder: z.number(),
  status: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  group: TagGroupResponseSchema.optional().nullable(),
});

// ======= Entity Tag Schemas =======
export const AttachTagsSchema = z.object({
  entityType: z.nativeEnum(TaggableEntityType),
  entityId: z.string().uuid(),
  tagIds: z.array(z.string().uuid()),
});

export const DetachTagSchema = z.object({
  entityType: z.nativeEnum(TaggableEntityType),
  entityId: z.string().uuid(),
  tagId: z.string().uuid(),
});

export const GetEntityTagsSchema = z.object({
  entityType: z.nativeEnum(TaggableEntityType),
  entityId: z.string().uuid(),
});

// ======= Query Params Schema =======
export const TagQuerySchema = z.object({
  scope: z.nativeEnum(TagScope).optional(),
  groupId: z.string().uuid().optional(),
  status: z.string().optional(),
});

// ======= Export Types =======
export type CreateTagGroupDto = z.infer<typeof CreateTagGroupSchema>;
export type UpdateTagGroupDto = z.infer<typeof UpdateTagGroupSchema>;
export type TagGroupResponse = z.infer<typeof TagGroupResponseSchema>;

export type CreateTagDto = z.infer<typeof CreateTagSchema>;
export type UpdateTagDto = z.infer<typeof UpdateTagSchema>;
export type TagResponse = z.infer<typeof TagResponseSchema>;

export type AttachTagsDto = z.infer<typeof AttachTagsSchema>;
export type DetachTagDto = z.infer<typeof DetachTagSchema>;
export type GetEntityTagsDto = z.infer<typeof GetEntityTagsSchema>;

export type TagQueryParams = z.infer<typeof TagQuerySchema>;
