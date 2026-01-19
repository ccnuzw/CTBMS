import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
} from '@nestjs/common';
import { MarketIntelService } from './market-intel.service';
import { PriceDataService } from './price-data.service';
import { IntelTaskService } from './intel-task.service';
import {
    CreateMarketIntelRequest,
    UpdateMarketIntelRequest,
    MarketIntelQueryRequest,
    AnalyzeContentRequest,
} from './dto';
import {
    CreatePriceDataDto,
    PriceDataQuery,
    CreateIntelTaskDto,
    UpdateIntelTaskDto,
    IntelTaskQuery,
} from '@packages/types';
import { IntelAttachmentService } from './intel-attachment.service';
import { IntelEntityService } from './intel-entity.service';

@Controller('market-intel')
export class MarketIntelController {
    constructor(
        private readonly marketIntelService: MarketIntelService,
        private readonly priceDataService: PriceDataService,
        private readonly intelTaskService: IntelTaskService,
        private readonly intelAttachmentService: IntelAttachmentService,
        private readonly intelEntityService: IntelEntityService,
    ) { }

    // =============================================
    // 静态路由 (必须在动态路由 :id 之前)
    // =============================================

    // --- 情报基础 ---

    @Post()
    async create(@Body() dto: CreateMarketIntelRequest) {
        const authorId = 'system-user-placeholder';
        return this.marketIntelService.create(dto, authorId);
    }

    @Get()
    async findAll(@Query() query: MarketIntelQueryRequest) {
        return this.marketIntelService.findAll(query);
    }

    @Get('stats')
    async getStats() {
        return this.marketIntelService.getStats();
    }

    @Get('leaderboard')
    async getLeaderboard(@Query('limit') limit = '10') {
        return this.marketIntelService.getLeaderboard(parseInt(limit, 10));
    }

    @Post('analyze')
    async analyze(@Body() dto: AnalyzeContentRequest) {
        return this.marketIntelService.analyze(dto.content as string, dto.category, dto.location);
    }

    // --- A类：价格数据 ---

    @Post('price-data')
    async createPriceData(@Body() dto: CreatePriceDataDto) {
        const authorId = 'system-user-placeholder';
        return this.priceDataService.create(dto, authorId);
    }

    @Get('price-data')
    async findAllPriceData(@Query() query: PriceDataQuery) {
        return this.priceDataService.findAll(query);
    }

    @Get('price-data/trend')
    async getPriceTrend(
        @Query('commodity') commodity: string,
        @Query('location') location: string,
        @Query('days') days = '30',
    ) {
        return this.priceDataService.getTrend(commodity, location, parseInt(days, 10));
    }

    @Get('price-data/heatmap')
    async getPriceHeatmap(
        @Query('commodity') commodity: string,
        @Query('date') date?: string,
    ) {
        return this.priceDataService.getHeatmap(
            commodity,
            date ? new Date(date) : undefined,
        );
    }

    // --- 任务调度 ---

    @Post('tasks')
    async createTask(@Body() dto: CreateIntelTaskDto) {
        return this.intelTaskService.create(dto);
    }

    @Get('tasks')
    async findAllTasks(@Query() query: IntelTaskQuery) {
        return this.intelTaskService.findAll(query);
    }

    @Get('tasks/my')
    async getMyTasks(@Query('userId') userId: string) {
        return this.intelTaskService.getMyTasks(userId);
    }

    @Post('tasks/check-overdue')
    async checkOverdueTasks() {
        return this.intelTaskService.checkOverdueTasks();
    }

    @Put('tasks/:id')
    async updateTask(@Param('id') id: string, @Body() dto: UpdateIntelTaskDto) {
        return this.intelTaskService.update(id, dto);
    }

    @Post('tasks/:id/complete')
    async completeTask(
        @Param('id') id: string,
        @Body('intelId') intelId?: string,
    ) {
        return this.intelTaskService.complete(id, intelId);
    }

    @Delete('tasks/:id')
    async removeTask(@Param('id') id: string) {
        return this.intelTaskService.remove(id);
    }

    // --- 附件管理 ---

    @Get('attachments/search')
    async searchAttachments(
        @Query('keyword') keyword: string,
        @Query('limit') limit = '20',
    ) {
        return this.intelAttachmentService.searchByOcrText(keyword, parseInt(limit, 10));
    }

    @Delete('attachments/:id')
    async removeAttachment(@Param('id') id: string) {
        return this.intelAttachmentService.remove(id);
    }

    // --- 企业关联 ---

    @Get('enterprises/:id/intels')
    async getEnterpriseIntels(
        @Param('id') enterpriseId: string,
        @Query('limit') limit = '20',
    ) {
        return this.intelEntityService.findByEnterprise(enterpriseId, parseInt(limit, 10));
    }

    @Get('enterprises/:id/timeline')
    async getEnterpriseTimeline(@Param('id') enterpriseId: string) {
        return this.intelEntityService.getEnterpriseTimeline(enterpriseId);
    }

    // =============================================
    // 动态路由 (必须放在最后)
    // =============================================

    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.marketIntelService.findOne(id);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() dto: UpdateMarketIntelRequest) {
        return this.marketIntelService.update(id, dto);
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        return this.marketIntelService.remove(id);
    }

    @Get(':id/attachments')
    async getAttachments(@Param('id') intelId: string) {
        return this.intelAttachmentService.findByIntel(intelId);
    }

    @Get(':id/entities')
    async getIntelEntities(@Param('id') intelId: string) {
        return this.intelEntityService.findByIntel(intelId);
    }

    @Post(':id/entities')
    async linkEntity(
        @Param('id') intelId: string,
        @Body('enterpriseId') enterpriseId: string,
        @Body('linkType') linkType?: string,
    ) {
        return this.intelEntityService.createLink({
            intelId,
            enterpriseId,
            linkType: linkType as any,
        });
    }

    @Delete(':intelId/entities/:enterpriseId')
    async unlinkEntity(
        @Param('intelId') intelId: string,
        @Param('enterpriseId') enterpriseId: string,
    ) {
        return this.intelEntityService.removeLink(intelId, enterpriseId);
    }
}
