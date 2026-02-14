import { z } from 'zod';

export const UserConfigBindingTypeEnum = z.enum([
  'PARAMETER_SET',
  'DECISION_RULE_PACK',
  'AGENT_PROFILE',
  'TEMPLATE_CATALOG',
  'WORKFLOW_DEFINITION',
]);

export const UserConfigBindingSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  bindingType: UserConfigBindingTypeEnum,
  targetId: z.string(),
  targetCode: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  isActive: z.boolean(),
  priority: z.number().int(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const CreateUserConfigBindingSchema = z.object({
  bindingType: UserConfigBindingTypeEnum,
  targetId: z.string().min(1).max(120),
  targetCode: z.string().max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
  isActive: z.boolean().default(true).optional(),
  priority: z.number().int().min(0).max(9999).default(100).optional(),
});

export const UpdateUserConfigBindingSchema = z.object({
  targetCode: z.string().max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(0).max(9999).optional(),
});

export const UserConfigBindingQuerySchema = z.object({
  bindingType: UserConfigBindingTypeEnum.optional(),
  isActive: z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  }, z.boolean().optional()),
  keyword: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const UserConfigBindingPageSchema = z.object({
  data: z.array(UserConfigBindingSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});

export type UserConfigBindingType = z.infer<typeof UserConfigBindingTypeEnum>;
export type UserConfigBindingDto = z.infer<typeof UserConfigBindingSchema>;
export type CreateUserConfigBindingDto = z.infer<typeof CreateUserConfigBindingSchema>;
export type UpdateUserConfigBindingDto = z.infer<typeof UpdateUserConfigBindingSchema>;
export type UserConfigBindingQueryDto = z.infer<typeof UserConfigBindingQuerySchema>;
export type UserConfigBindingPageDto = z.infer<typeof UserConfigBindingPageSchema>;
