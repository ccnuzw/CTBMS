import { createZodDto } from 'nestjs-zod';
import {
    CreateCommoditySchema,
    UpdateCommoditySchema,
    CommodityQuerySchema,
    CreateRegionSchema,
    UpdateRegionSchema,
    MasterRegionQuerySchema,
    CreateWarehouseSchema,
    UpdateWarehouseSchema,
    WarehouseQuerySchema,
    CreateRouteSchema,
    UpdateRouteSchema,
    RouteQuerySchema,
    CreateFuturesSymbolSchema,
    UpdateFuturesSymbolSchema,
    FuturesSymbolQuerySchema,
    CreateMetricDefinitionSchema,
    UpdateMetricDefinitionSchema,
    MetricDefinitionQuerySchema,
} from '@packages/types';

// ── Commodity DTOs ──
export class CreateCommodityDto extends createZodDto(CreateCommoditySchema) { }
export class UpdateCommodityDto extends createZodDto(UpdateCommoditySchema) { }
export class CommodityQueryDto extends createZodDto(CommodityQuerySchema) { }

// ── Region DTOs ──
export class CreateRegionDto extends createZodDto(CreateRegionSchema) { }
export class UpdateRegionDto extends createZodDto(UpdateRegionSchema) { }
export class MasterRegionQueryDto extends createZodDto(MasterRegionQuerySchema) { }

// ── Warehouse DTOs ──
export class CreateWarehouseDto extends createZodDto(CreateWarehouseSchema) { }
export class UpdateWarehouseDto extends createZodDto(UpdateWarehouseSchema) { }
export class WarehouseQueryDto extends createZodDto(WarehouseQuerySchema) { }

// ── Route DTOs ──
export class CreateRouteDto extends createZodDto(CreateRouteSchema) { }
export class UpdateRouteDto extends createZodDto(UpdateRouteSchema) { }
export class RouteQueryDto extends createZodDto(RouteQuerySchema) { }

// ── FuturesSymbol DTOs ──
export class CreateFuturesSymbolDto extends createZodDto(CreateFuturesSymbolSchema) { }
export class UpdateFuturesSymbolDto extends createZodDto(UpdateFuturesSymbolSchema) { }
export class FuturesSymbolQueryDto extends createZodDto(FuturesSymbolQuerySchema) { }

// ── MetricDefinition DTOs ──
export class CreateMetricDefinitionDto extends createZodDto(CreateMetricDefinitionSchema) { }
export class UpdateMetricDefinitionDto extends createZodDto(UpdateMetricDefinitionSchema) { }
export class MetricDefinitionQueryDto extends createZodDto(MetricDefinitionQuerySchema) { }
