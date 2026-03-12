import {
    Controller,
    Get,
    Param,
    Query,
} from '@nestjs/common';
import { IntelEventInsightService } from '../intel-event-insight.service';

@Controller('market-intel')
export class EventInsightController {
    constructor(
        private readonly intelEventInsightService: IntelEventInsightService,
    ) { }

    @Get('filter-options')
    async getFilterOptions() {
        return this.intelEventInsightService.getFilterOptions();
    }

    @Get('events')
    async findEvents(
        @Query('eventTypeId') eventTypeId?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('collectionPointId') collectionPointId?: string,
        @Query('commodity') commodity?: string,
        @Query('sentiment') sentiment?: string,
        @Query('impactLevel') impactLevel?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('keyword') keyword?: string,
        @Query('page') page = '1',
        @Query('pageSize') pageSize = '20',
    ) {
        return this.intelEventInsightService.findEvents({
            eventTypeId,
            collectionPointId,
            commodity,
            sentiment,
            impactLevel,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            keyword,
            page: parseInt(page, 10),
            pageSize: parseInt(pageSize, 10),
        });
    }

    @Get('events/stats')
    async getEventStats(
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('commodities') commodities?: string,
        @Query('regions') regions?: string,
    ) {
        return this.intelEventInsightService.getEventStats({
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            commodities: commodities ? commodities.split(',') : undefined,
            regions: regions ? regions.split(',') : undefined,
        });
    }

    @Get('events/:id')
    async findEventById(@Param('id') id: string) {
        return this.intelEventInsightService.findEventById(id);
    }

    @Get('insights')
    async findInsights(
        @Query('insightTypeId') insightTypeId?: string,
        @Query('direction') direction?: string,
        @Query('timeframe') timeframe?: string,
        @Query('commodity') commodity?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('keyword') keyword?: string,
        @Query('page') page = '1',
        @Query('pageSize') pageSize = '20',
    ) {
        return this.intelEventInsightService.findInsights({
            insightTypeId,
            direction,
            timeframe,
            commodity,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            keyword,
            page: parseInt(page, 10),
            pageSize: parseInt(pageSize, 10),
        });
    }

    @Get('insights/stats')
    async getInsightStats() {
        return this.intelEventInsightService.getInsightStats();
    }

    @Get('insights/:id')
    async findInsightById(@Param('id') id: string) {
        return this.intelEventInsightService.findInsightById(id);
    }
}
