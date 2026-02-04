import { z } from 'zod';

export const DictionaryItemSchema = z.object({
    id: z.string(),
    domainCode: z.string(),
    code: z.string(),
    label: z.string(),
    sortOrder: z.number(),
    isActive: z.boolean(),
    parentCode: z.string().nullable().optional(),
    meta: z.record(z.any()).nullable().optional(),
    createdAt: z.coerce.date().optional(),
    updatedAt: z.coerce.date().optional(),
});

export const DictionaryDomainSchema = z.object({
    id: z.string().optional(),
    code: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    usageHint: z.string().nullable().optional(),
    usageLocations: z.array(z.string()).optional(),
    isSystemDomain: z.boolean().optional(),
    isActive: z.boolean().optional(),
    items: z.array(DictionaryItemSchema).optional(),
});


export type DictionaryItem = z.infer<typeof DictionaryItemSchema>;
export type DictionaryDomain = z.infer<typeof DictionaryDomainSchema>;
