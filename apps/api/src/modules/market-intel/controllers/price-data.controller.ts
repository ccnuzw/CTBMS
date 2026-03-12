import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Query,
} from '@nestjs/common';
import { PriceDataService } from '../price-data.service';
import { PriceAnalyticsService } from '../price-analytics.service';
import { PriceTimeseriesService } from '../price-timeseries.service';
import { CreatePriceDataDto, PriceDataQuery } from '@packages/types';

@Controller('market-intel')
export class PriceDataController {
    constructor(
        private readonly priceDataService: PriceDataService,
        private readonly priceAnalyticsService: PriceAnalyticsService,
        private readonly priceTimeseriesService: PriceTimeseriesService,
    ) { }

    @Post('price-data')
    async createPriceData(@Body() dto: CreatePriceDataDto) {
        const authorId = 'system-user-placeholder';
        return this.priceDataService.create(dto, authorId);
    }

    @Get('price-data')
    async findAllPriceData(@Query() query: PriceDataQuery) {
        return this.priceDataService.findAll(query);
    }

    @Get('price-data/continuity-health')
    async getPriceContinuityHealth(@Query() query: PriceDataQuery & { days?: string }) {
        return this.priceAnalyticsService.getContinuityHealth(query);
    }

    @Get('price-data/trend')
    async getPriceTrend(
        @Query('commodity') commodity: string,
        @Query('location') location: string,
        @Query('days') days = '30',
    ) {
        return this.priceTimeseriesService.getTrend(commodity, location, parseInt(days, 10));
    }

    @Get('price-data/heatmap')
    async getPriceHeatmap(@Query('commodity') commodity: string, @Query('date') date?: string) {
        return this.priceTimeseriesService.getHeatmap(commodity, date ? new Date(date) : undefined);
    }

    @Get('price-data/by-collection-point/:id')
    async getPriceByCollectionPoint(
        @Param('id') collectionPointId: string,
        @Query('commodity') commodity?: string,
        @Query('days') days = '30',
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('subTypes') subTypes?: string,
        @Query('reviewScope') reviewScope?: string,
        @Query('sourceScope') sourceScope?: string,
    ) {
        return this.priceTimeseriesService.getByCollectionPoint(
            collectionPointId,
            commodity,
            parseInt(days, 10),
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined,
            subTypes,
            reviewScope,
            sourceScope,
        );
    }

    @Get('price-data/by-region/:code')
    async getPriceByRegion(
        @Param('code') regionCode: string,
        @Query('commodity') commodity?: string,
        @Query('days') days = '30',
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('subTypes') subTypes?: string,
        @Query('reviewScope') reviewScope?: string,
        @Query('sourceScope') sourceScope?: string,
        @Query('includeData') includeData?: string,
    ) {
        return this.priceTimeseriesService.getByRegion(
            regionCode,
            commodity,
            parseInt(days, 10),
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined,
            subTypes,
            reviewScope,
            sourceScope,
            ['true', '1', 'yes'].includes((includeData || '').toLowerCase()),
        );
    }

    @Get('price-data/compare')
    async getMultiPointTrend(
        @Query('ids') ids: string,
        @Query('commodity') commodity: string,
        @Query('days') days = '30',
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('subTypes') subTypes?: string,
        @Query('reviewScope') reviewScope?: string,
        @Query('sourceScope') sourceScope?: string,
    ) {
        const collectionPointIds = ids.split(',').filter((id) => id.trim());
        return this.priceTimeseriesService.getMultiPointTrend(
            collectionPointIds,
            commodity,
            parseInt(days, 10),
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined,
            subTypes,
            reviewScope,
            sourceScope,
        );
    }

    @Get('price-data/compare-analytics')
    async getPriceCompareAnalytics(
        @Query('ids') ids?: string,
        @Query('commodity') commodity?: string,
        @Query('days') days = '30',
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('subTypes') subTypes?: string,
        @Query('regionCode') regionCode?: string,
        @Query('pointTypes') pointTypes?: string,
        @Query('reviewScope') reviewScope?: string,
        @Query('sourceScope') sourceScope?: string,
        @Query('regionLevel') regionLevel?: string,
        @Query('regionWindow') regionWindow?: string,
    ) {
        const collectionPointIds = (ids || '').split(',').filter((id) => id.trim());
        return this.priceAnalyticsService.getCompareAnalytics({
            collectionPointIds,
            commodity,
            days: parseInt(days, 10),
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            subTypes,
            regionCode,
            pointTypes,
            reviewScope,
            sourceScope,
            regionLevel,
            regionWindow,
        });
    }
}
