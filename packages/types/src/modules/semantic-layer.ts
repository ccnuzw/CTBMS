import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════
// 主数据实体 (Master Data Entities) — PRD §8.3
// ═══════════════════════════════════════════════════════════════════

// ── 品类 (Commodity) ──

export const CommodityCategoryEnum = z.enum([
    'GRAIN',
    'OILSEED',
    'FIBER',
    'SUGAR',
    'LIVESTOCK',
    'OTHER',
]);

export const CommoditySchema = z.object({
    code: z.string().regex(/^[A-Z0-9_]{2,20}$/),
    name: z.string().min(1).max(60),
    nameEn: z.string().min(1).max(60).optional(),
    category: CommodityCategoryEnum,
    unit: z.string().min(1).max(20),
    futuresSymbols: z.array(z.string().max(20)).max(10).default([]),
    description: z.string().max(500).optional(),
    isActive: z.boolean().default(true),
});

// ── 区域 (Region) ──

export const RegionTypeEnum = z.enum(['PRODUCTION', 'SALES', 'PORT', 'PROCESSING', 'OTHER']);

export const RegionSchema = z.object({
    code: z.string().regex(/^[A-Z0-9_]{2,30}$/),
    name: z.string().min(1).max(80),
    nameEn: z.string().min(1).max(80).optional(),
    regionType: RegionTypeEnum,
    parentCode: z.string().max(30).nullable().optional(),
    country: z.string().min(2).max(4).default('CN'),
    province: z.string().max(30).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    isActive: z.boolean().default(true),
});

// ── 仓库/港口 (Warehouse) ──

export const WarehouseTypeEnum = z.enum(['WAREHOUSE', 'PORT', 'SILO', 'TRANSIT', 'OTHER']);

export const WarehouseSchema = z.object({
    code: z.string().regex(/^[A-Z0-9_]{2,30}$/),
    name: z.string().min(1).max(80),
    warehouseType: WarehouseTypeEnum,
    regionCode: z.string().max(30),
    capacityTon: z.number().positive().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    isActive: z.boolean().default(true),
});

// ── 物流线路 (Route) ──

export const RouteTransportModeEnum = z.enum(['RAIL', 'ROAD', 'WATER', 'MULTIMODAL', 'OTHER']);

export const RouteSchema = z.object({
    code: z.string().regex(/^[A-Z0-9_]{2,40}$/),
    name: z.string().min(1).max(120),
    transportMode: RouteTransportModeEnum,
    originRegionCode: z.string().max(30),
    destinationRegionCode: z.string().max(30),
    distanceKm: z.number().positive().optional(),
    typicalDurationHours: z.number().positive().optional(),
    isActive: z.boolean().default(true),
});

// ── 期货合约 (FuturesSymbol) ──

export const MasterFuturesExchangeEnum = z.enum(['DCE', 'CZCE', 'SHFE', 'CFFEX', 'INE', 'OTHER']);

export const FuturesSymbolSchema = z.object({
    symbol: z.string().regex(/^[A-Za-z0-9]{2,20}$/),
    name: z.string().min(1).max(60),
    exchange: MasterFuturesExchangeEnum,
    commodityCode: z.string().max(20),
    contractMultiplier: z.number().positive().optional(),
    tickSize: z.number().positive().optional(),
    unit: z.string().max(20).optional(),
    isActive: z.boolean().default(true),
});

// ═══════════════════════════════════════════════════════════════════
// 指标字典 (Metric Dictionary) — PRD §8.3
// ═══════════════════════════════════════════════════════════════════

export const MetricDomainEnum = z.enum([
    'SPOT_PRICE',
    'FUTURES',
    'BASIS',
    'INVENTORY',
    'COST',
    'LOGISTICS',
    'WEATHER',
    'SUPPLY_DEMAND',
    'RISK',
]);

export const MetricDataTypeEnum = z.enum(['NUMERIC', 'PERCENTAGE', 'INDEX', 'CATEGORY', 'BOOLEAN']);

export const MetricFrequencyEnum = z.enum([
    'REAL_TIME',
    'MINUTE',
    'HOURLY',
    'DAILY',
    'WEEKLY',
    'MONTHLY',
]);

export const MetricDefinitionSchema = z.object({
    metricCode: z.string().regex(/^[a-z][a-z0-9_]{2,60}$/),
    name: z.string().min(1).max(120),
    nameEn: z.string().min(1).max(120).optional(),
    domain: MetricDomainEnum,
    dataType: MetricDataTypeEnum,
    unit: z.string().max(20).optional(),
    formula: z.string().max(2000).optional(),
    description: z.string().max(1000).optional(),
    frequency: MetricFrequencyEnum,
    ttlMinutes: z.number().int().positive(),
    sourceConnectors: z.array(z.string().max(60)).max(10).default([]),
    version: z.string().min(1).max(20).default('v1'),
    isActive: z.boolean().default(true),
});

// ═══════════════════════════════════════════════════════════════════
// CRUD DTOs
// ═══════════════════════════════════════════════════════════════════

// ── Commodity CRUD ──

export const CreateCommoditySchema = CommoditySchema.omit({});

export const UpdateCommoditySchema = CommoditySchema.partial().omit({ code: true });

export const CommodityQuerySchema = z.object({
    keyword: z.string().max(60).optional(),
    category: CommodityCategoryEnum.optional(),
    isActive: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// ── Region CRUD ──

export const CreateRegionSchema = RegionSchema.omit({});

export const UpdateRegionSchema = RegionSchema.partial().omit({ code: true });

export const MasterRegionQuerySchema = z.object({
    keyword: z.string().max(60).optional(),
    regionType: RegionTypeEnum.optional(),
    country: z.string().max(4).optional(),
    isActive: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// ── Warehouse CRUD ──

export const CreateWarehouseSchema = WarehouseSchema.omit({});

export const UpdateWarehouseSchema = WarehouseSchema.partial().omit({ code: true });

export const WarehouseQuerySchema = z.object({
    keyword: z.string().max(60).optional(),
    warehouseType: WarehouseTypeEnum.optional(),
    regionCode: z.string().max(30).optional(),
    isActive: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// ── Route CRUD ──

export const CreateRouteSchema = RouteSchema.omit({});

export const UpdateRouteSchema = RouteSchema.partial().omit({ code: true });

export const RouteQuerySchema = z.object({
    keyword: z.string().max(60).optional(),
    transportMode: RouteTransportModeEnum.optional(),
    originRegionCode: z.string().max(30).optional(),
    destinationRegionCode: z.string().max(30).optional(),
    isActive: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// ── FuturesSymbol CRUD ──

export const CreateFuturesSymbolSchema = FuturesSymbolSchema.omit({});

export const UpdateFuturesSymbolSchema = FuturesSymbolSchema.partial().omit({ symbol: true });

export const FuturesSymbolQuerySchema = z.object({
    keyword: z.string().max(60).optional(),
    exchange: MasterFuturesExchangeEnum.optional(),
    commodityCode: z.string().max(20).optional(),
    isActive: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// ── MetricDefinition CRUD ──

export const CreateMetricDefinitionSchema = MetricDefinitionSchema.omit({});

export const UpdateMetricDefinitionSchema = MetricDefinitionSchema.partial().omit({
    metricCode: true,
});

export const MetricDefinitionQuerySchema = z.object({
    keyword: z.string().max(120).optional(),
    domain: MetricDomainEnum.optional(),
    dataType: MetricDataTypeEnum.optional(),
    frequency: MetricFrequencyEnum.optional(),
    isActive: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// ═══════════════════════════════════════════════════════════════════
// Type Exports
// ═══════════════════════════════════════════════════════════════════

export type CommodityCategory = z.infer<typeof CommodityCategoryEnum>;
export type Commodity = z.infer<typeof CommoditySchema>;
export type CreateCommodityDto = z.infer<typeof CreateCommoditySchema>;
export type UpdateCommodityDto = z.infer<typeof UpdateCommoditySchema>;
export type CommodityQueryDto = z.infer<typeof CommodityQuerySchema>;

export type RegionType = z.infer<typeof RegionTypeEnum>;
export type Region = z.infer<typeof RegionSchema>;
export type CreateRegionDto = z.infer<typeof CreateRegionSchema>;
export type UpdateRegionDto = z.infer<typeof UpdateRegionSchema>;
export type MasterRegionQueryDto = z.infer<typeof MasterRegionQuerySchema>;

export type WarehouseType = z.infer<typeof WarehouseTypeEnum>;
export type Warehouse = z.infer<typeof WarehouseSchema>;
export type CreateWarehouseDto = z.infer<typeof CreateWarehouseSchema>;
export type UpdateWarehouseDto = z.infer<typeof UpdateWarehouseSchema>;
export type WarehouseQueryDto = z.infer<typeof WarehouseQuerySchema>;

export type RouteTransportMode = z.infer<typeof RouteTransportModeEnum>;
export type Route = z.infer<typeof RouteSchema>;
export type CreateRouteDto = z.infer<typeof CreateRouteSchema>;
export type UpdateRouteDto = z.infer<typeof UpdateRouteSchema>;
export type RouteQueryDto = z.infer<typeof RouteQuerySchema>;

export type MasterFuturesExchange = z.infer<typeof MasterFuturesExchangeEnum>;
export type FuturesSymbol = z.infer<typeof FuturesSymbolSchema>;
export type CreateFuturesSymbolDto = z.infer<typeof CreateFuturesSymbolSchema>;
export type UpdateFuturesSymbolDto = z.infer<typeof UpdateFuturesSymbolSchema>;
export type FuturesSymbolQueryDto = z.infer<typeof FuturesSymbolQuerySchema>;

export type MetricDomain = z.infer<typeof MetricDomainEnum>;
export type MetricDataType = z.infer<typeof MetricDataTypeEnum>;
export type MetricFrequency = z.infer<typeof MetricFrequencyEnum>;
export type MetricDefinition = z.infer<typeof MetricDefinitionSchema>;
export type CreateMetricDefinitionDto = z.infer<typeof CreateMetricDefinitionSchema>;
export type UpdateMetricDefinitionDto = z.infer<typeof UpdateMetricDefinitionSchema>;
export type MetricDefinitionQueryDto = z.infer<typeof MetricDefinitionQuerySchema>;
