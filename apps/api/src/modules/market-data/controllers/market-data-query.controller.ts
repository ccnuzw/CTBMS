import {
    Body,
    Controller,
    Get,
    Post,
    Query,
    Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import {
    MarketDataAggregateRequest,
    MarketDataQueryRequest,
    MarketDataLineageQueryRequest,
    StandardizationPreviewRequest,
    WeatherLogisticsImpactIndexQueryRequest,
} from '../dto';
import { MarketDataService } from '../market-data.service';
import { MarketDataBaseController } from './market-data-base.controller';

@Controller('market-data')
export class MarketDataQueryController extends MarketDataBaseController {
    constructor(protected readonly marketDataService: MarketDataService) {
        super();
    }

    @Post('aggregate')
    async aggregateMarketData(
        @Body() dto: MarketDataAggregateRequest,
        @Request() req: ExpressRequest & { user?: { id?: string } },
    ) {
        this.getUserId(req);
        const from = dto.timeRange?.from ? new Date(dto.timeRange.from) : undefined;
        const to = dto.timeRange?.to ? new Date(dto.timeRange.to) : undefined;

        const result = await this.marketDataService.aggregateStandardizedData(
            dto.dataset,
            {
                from,
                to,
                filters: dto.dimensions,
                limit: dto.limit,
                enforceReconciliationGate: true,
            },
            dto.groupBy,
            dto.metrics,
        );

        return this.success(req, {
            rows: result.rows,
            meta: result.meta,
        });
    }

    @Post('query')
    async queryMarketData(
        @Body() dto: MarketDataQueryRequest,
        @Request() req: ExpressRequest & { user?: { id?: string } },
    ) {
        this.getUserId(req);
        const from = dto.timeRange?.from ? new Date(dto.timeRange.from) : undefined;
        const to = dto.timeRange?.to ? new Date(dto.timeRange.to) : undefined;

        const result = await this.marketDataService.queryStandardizedData(dto.dataset, {
            from,
            to,
            filters: dto.dimensions,
            limit: dto.limit,
            enforceReconciliationGate: true,
        });

        return this.success(req, {
            rows: result.rows,
            meta: result.meta,
        });
    }

    @Get('weather-logistics/impact-index')
    async getWeatherLogisticsImpactIndex(
        @Query() query: WeatherLogisticsImpactIndexQueryRequest,
        @Request() req: ExpressRequest & { user?: { id?: string } },
    ) {
        this.getUserId(req);
        const data = await this.marketDataService.getWeatherLogisticsImpactIndex(query);
        return this.success(req, data);
    }

    @Post('standardization/preview')
    async previewStandardization(
        @Body() dto: StandardizationPreviewRequest,
        @Request() req: ExpressRequest & { user?: { id?: string } },
    ) {
        this.getUserId(req);
        const data = await this.marketDataService.previewStandardization(dto);
        return this.success(req, data);
    }

    @Get('lineage')
    async getLineage(
        @Query() query: MarketDataLineageQueryRequest,
        @Request() req: ExpressRequest & { user?: { id?: string } },
    ) {
        this.getUserId(req);
        const data = await this.marketDataService.getLineage(query.dataset, query.recordId);
        return this.success(req, data);
    }
}
