import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { RegionLevel } from '@packages/types';

// 创建行政区划
export const CreateRegionSchema = z.object({
    code: z.string().min(1).max(12),
    name: z.string().min(1).max(50),
    shortName: z.string().max(10).optional(),
    level: z.nativeEnum(RegionLevel),
    parentCode: z.preprocess(
        (val) => (val === '' ? undefined : val),
        z.string().optional()
    ),
    longitude: z.number().min(-180).max(180).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    sortOrder: z.preprocess(
        (val) => (val === null ? 0 : val),
        z.number().int().min(0).optional().default(0)
    ),
    isActive: z.boolean().optional().default(true),
});

// 更新行政区划
export const UpdateRegionSchema = CreateRegionSchema.partial();

// 查询行政区划
export const RegionQuerySchema = z.object({
    level: z.nativeEnum(RegionLevel).optional(),
    parentCode: z.string().optional(),
    keyword: z.string().optional(),
    isActive: z.coerce.boolean().optional(),
});

export class CreateRegionDto extends createZodDto(CreateRegionSchema) { }
export class UpdateRegionDto extends createZodDto(UpdateRegionSchema) { }
export class RegionQueryDto extends createZodDto(RegionQuerySchema) { }
