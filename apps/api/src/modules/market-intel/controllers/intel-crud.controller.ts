import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    BadRequestException,
} from '@nestjs/common';
import { IntelCrudService } from '../intel-crud.service';
import { IntelScoringService } from '../intel-scoring.service';
import { IntelSearchService } from '../intel-search.service';
import {
    CreateMarketIntelRequest,
    UpdateMarketIntelRequest,
    MarketIntelQueryRequest,
    PromoteToReportRequest,
} from '../dto';

@Controller('market-intel')
export class IntelCrudController {
    constructor(
        private readonly intelCrudService: IntelCrudService,
        private readonly intelScoringService: IntelScoringService,
        private readonly intelSearchService: IntelSearchService,
    ) { }

    @Post()
    async create(@Body() dto: CreateMarketIntelRequest) {
        const authorId = 'system-user-placeholder';
        return this.intelCrudService.create(dto, authorId);
    }

    @Get()
    async findAll(@Query() query: MarketIntelQueryRequest) {
        return this.intelCrudService.findAll(query);
    }

    @Get('stats')
    async getStats() {
        return this.intelScoringService.getStats();
    }

    @Get('leaderboard')
    async getLeaderboard(
        @Query('limit') limit = '10',
        @Query('timeframe') timeframe: 'day' | 'week' | 'month' | 'year' = 'month',
    ) {
        return this.intelScoringService.getLeaderboard(parseInt(limit, 10), timeframe);
    }

    @Post('documents/batch-delete')
    async batchDelete(@Body() body: { ids: string[] }) {
        if (!body.ids || !Array.isArray(body.ids)) {
            throw new BadRequestException('ids array is required');
        }
        return this.intelCrudService.batchDelete(body.ids);
    }

    @Post('documents/batch-tags')
    async batchUpdateTags(
        @Body() body: { ids: string[]; addTags?: string[]; removeTags?: string[] },
    ) {
        if (!body.ids || !Array.isArray(body.ids)) {
            throw new BadRequestException('ids array is required');
        }
        return this.intelCrudService.batchUpdateTags(
            body.ids,
            body.addTags || [],
            body.removeTags || [],
        );
    }

    @Get('documents/stats')
    async getDocStats(@Query('days') days?: number) {
        return this.intelCrudService.getDocStats(days ? Number(days) : 30);
    }

    @Patch(':id/tags')
    async updateTags(@Param('id') id: string, @Body() body: { tags: string[] }) {
        if (!body.tags || !Array.isArray(body.tags)) {
            throw new BadRequestException('tags array is required');
        }
        return this.intelCrudService.updateTags(id, body.tags);
    }

    @Post(':id/actions/promote-to-report')
    async promoteToReport(@Param('id') intelId: string, @Body() dto: PromoteToReportRequest) {
        return this.intelCrudService.promoteToReport(intelId, dto);
    }

    @Get(':id/related')
    async getRelatedIntel(@Param('id') intelId: string, @Query('limit') limit = '8') {
        return this.intelSearchService.getRelatedIntel(intelId, parseInt(limit, 10));
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.intelCrudService.findOne(id);
    }

    @Patch(':id')
    async update(@Param('id') id: string, @Body() dto: UpdateMarketIntelRequest) {
        return this.intelCrudService.update(id, dto);
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        return this.intelCrudService.remove(id);
    }
}
