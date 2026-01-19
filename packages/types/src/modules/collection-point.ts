import { z } from 'zod';

// =============================================
// 行政区划 (Administrative Region)
// =============================================

// 行政区划层级
export enum RegionLevel {
    COUNTRY = 'COUNTRY',
    PROVINCE = 'PROVINCE',
    CITY = 'CITY',
    DISTRICT = 'DISTRICT',
    TOWN = 'TOWN',
}

export const REGION_LEVEL_LABELS: Record<RegionLevel, string> = {
    [RegionLevel.COUNTRY]: '国家',
    [RegionLevel.PROVINCE]: '省/直辖市/自治区',
    [RegionLevel.CITY]: '地级市',
    [RegionLevel.DISTRICT]: '区/县',
    [RegionLevel.TOWN]: '乡镇/街道',
};

// 行政区划响应 Schema
export const AdministrativeRegionSchema = z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    shortName: z.string().nullable(),
    level: z.nativeEnum(RegionLevel),
    parentCode: z.string().nullable(),
    longitude: z.number().nullable(),
    latitude: z.number().nullable(),
    sortOrder: z.number(),
    isActive: z.boolean(),
});

// 行政区划树节点
export const RegionTreeNodeSchema: z.ZodType<{
    id: string;
    code: string;
    name: string;
    shortName: string | null;
    level: RegionLevel;
    children?: z.infer<typeof RegionTreeNodeSchema>[];
}> = z.lazy(() =>
    z.object({
        id: z.string(),
        code: z.string(),
        name: z.string(),
        shortName: z.string().nullable(),
        level: z.nativeEnum(RegionLevel),
        children: z.array(RegionTreeNodeSchema).optional(),
    })
);

// 行政区划查询
export const RegionQuerySchema = z.object({
    level: z.nativeEnum(RegionLevel).optional(),
    parentCode: z.string().optional(),
    keyword: z.string().optional(),
    isActive: z.coerce.boolean().optional(),
});

export type AdministrativeRegion = z.infer<typeof AdministrativeRegionSchema>;
export type RegionTreeNode = z.infer<typeof RegionTreeNodeSchema>;
export type RegionQuery = z.infer<typeof RegionQuerySchema>;

// =============================================
// 采集点配置 (Collection Point)
// =============================================

// 采集点类型
export enum CollectionPointType {
    ENTERPRISE = 'ENTERPRISE',
    PORT = 'PORT',
    STATION = 'STATION',
    REGION = 'REGION',
    MARKET = 'MARKET',
}

export const COLLECTION_POINT_TYPE_LABELS: Record<CollectionPointType, string> = {
    [CollectionPointType.ENTERPRISE]: '企业',
    [CollectionPointType.PORT]: '港口',
    [CollectionPointType.STATION]: '站台',
    [CollectionPointType.REGION]: '地域',
    [CollectionPointType.MARKET]: '批发市场',
};

export const COLLECTION_POINT_TYPE_ICONS: Record<CollectionPointType, string> = {
    [CollectionPointType.ENTERPRISE]: '🏭',
    [CollectionPointType.PORT]: '⚓',
    [CollectionPointType.STATION]: '🚂',
    [CollectionPointType.REGION]: '🌍',
    [CollectionPointType.MARKET]: '🏪',
};

// 创建采集点 DTO
export const CreateCollectionPointSchema = z.object({
    code: z.string().min(1, '编码不能为空').max(50),
    name: z.string().min(1, '名称不能为空').max(100),
    shortName: z.string().max(50).optional(),
    aliases: z.array(z.string()).optional().default([]),
    type: z.nativeEnum(CollectionPointType),
    regionCode: z.string().optional(),
    address: z.string().optional(),
    longitude: z.number().min(-180).max(180).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    commodities: z.array(z.string()).optional().default([]),
    // AI 提取增强配置
    matchRegionCodes: z.array(z.string()).optional().default([]),
    matchKeywords: z.array(z.string()).optional().default([]),
    priceSubTypes: z.array(z.string()).optional().default([]),
    isDataSource: z.boolean().optional().default(true),

    defaultSubType: z.string().optional(),
    enterpriseId: z.string().optional(),
    priority: z.number().int().min(0).max(100).optional().default(0),
    isActive: z.boolean().optional().default(true),
    description: z.string().optional(),
});

// 更新采集点 DTO
// 使用 passthrough 允许数据库额外字段（如 matchRegionCodes、matchKeywords 等）通过验证
export const UpdateCollectionPointSchema = CreateCollectionPointSchema.partial().passthrough();

// 采集点响应 Schema
export const CollectionPointResponseSchema = z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    shortName: z.string().nullable(),
    aliases: z.array(z.string()),
    type: z.nativeEnum(CollectionPointType),
    regionCode: z.string().nullable(),
    region: AdministrativeRegionSchema.optional(),
    address: z.string().nullable(),
    longitude: z.number().nullable(),
    latitude: z.number().nullable(),
    commodities: z.array(z.string()),

    // AI 提取增强配置
    matchRegionCodes: z.array(z.string()),
    matchKeywords: z.array(z.string()),
    priceSubTypes: z.array(z.string()),
    isDataSource: z.boolean(),

    defaultSubType: z.string().nullable(),
    enterpriseId: z.string().nullable(),
    enterprise: z.object({
        id: z.string(),
        name: z.string(),
        shortName: z.string().nullable(),
    }).optional(),
    priority: z.number(),
    isActive: z.boolean(),
    description: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
});

// 采集点查询 Schema
export const CollectionPointQuerySchema = z.object({
    type: z.nativeEnum(CollectionPointType).optional(),
    regionCode: z.string().optional(),
    keyword: z.string().optional(),
    isActive: z.coerce.boolean().optional(),
    page: z.coerce.number().min(1).default(1),
    pageSize: z.coerce.number().min(1).max(1000).default(20),
});

// 用于 AI 识别的精简采集点
export const CollectionPointForRecognitionSchema = z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    shortName: z.string().nullable(),
    aliases: z.array(z.string()),
    type: z.nativeEnum(CollectionPointType),
    regionCode: z.string().nullable(),
    longitude: z.number().nullable(),
    latitude: z.number().nullable(),
    defaultSubType: z.string().nullable(),
    enterpriseId: z.string().nullable(),
    priority: z.number(),
});

export type CreateCollectionPointDto = z.infer<typeof CreateCollectionPointSchema>;
export type UpdateCollectionPointDto = z.infer<typeof UpdateCollectionPointSchema>;
export type CollectionPointResponse = z.infer<typeof CollectionPointResponseSchema>;
export type CollectionPointQuery = z.infer<typeof CollectionPointQuerySchema>;
export type CollectionPointForRecognition = z.infer<typeof CollectionPointForRecognitionSchema>;
