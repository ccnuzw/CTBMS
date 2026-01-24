import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MarketIntelService } from './market-intel.service';
import { PriceDataService } from './price-data.service';
import { IntelTaskService } from './intel-task.service';
import { ResearchReportService } from './research-report.service';
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
    ContentType,
    IntelCategory,
    CreateResearchReportDto,
    UpdateResearchReportDto,
    ResearchReportQuery,
} from '@packages/types';
import { IntelAttachmentService } from './intel-attachment.service';
import { IntelEntityService } from './intel-entity.service';
import { DocumentParserService } from './document-parser.service';

@Controller('market-intel')
export class MarketIntelController {
    constructor(
        private readonly marketIntelService: MarketIntelService,
        private readonly priceDataService: PriceDataService,
        private readonly intelTaskService: IntelTaskService,
        private readonly researchReportService: ResearchReportService,
        private readonly intelAttachmentService: IntelAttachmentService,
        private readonly intelEntityService: IntelEntityService,
        private readonly documentParserService: DocumentParserService,
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
        return this.marketIntelService.analyze(
            dto.content as string,
            dto.category,
            dto.location,
            dto.base64Image,
            dto.mimeType
        );
    }

    @Get('test-ai')
    async testAI() {
        return this.marketIntelService.testAI();
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

    /**
     * 按采集点查询历史价格（时间序列）
     */
    @Get('price-data/by-collection-point/:id')
    async getPriceByCollectionPoint(
        @Param('id') collectionPointId: string,
        @Query('commodity') commodity?: string,
        @Query('days') days = '30',
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('subTypes') subTypes?: string,
    ) {
        return this.priceDataService.getByCollectionPoint(
            collectionPointId,
            commodity,
            parseInt(days, 10),
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined,
            subTypes,
        );
    }

    /**
     * 按行政区划查询价格数据（支持聚合）
     */
    @Get('price-data/by-region/:code')
    async getPriceByRegion(
        @Param('code') regionCode: string,
        @Query('commodity') commodity?: string,
        @Query('days') days = '30',
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('subTypes') subTypes?: string,
    ) {
        return this.priceDataService.getByRegion(
            regionCode,
            commodity,
            parseInt(days, 10),
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined,
            subTypes,
        );
    }

    /**
     * 多采集点对比趋势
     */
    @Get('price-data/compare')
    async getMultiPointTrend(
        @Query('ids') ids: string,
        @Query('commodity') commodity: string,
        @Query('days') days = '30',
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('subTypes') subTypes?: string,
    ) {
        const collectionPointIds = ids.split(',').filter(id => id.trim());
        return this.priceDataService.getMultiPointTrend(
            collectionPointIds,
            commodity,
            parseInt(days, 10),
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined,
            subTypes,
        );
    }

    // --- B类增强：市场事件 ---

    @Get('filter-options')
    async getFilterOptions() {
        return this.marketIntelService.getFilterOptions();
    }

    @Get('dashboard/stats')
    async getDashboardStats(
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('sourceTypes') sourceTypes?: string,
        @Query('regionCodes') regionCodes?: string,
        @Query('commodities') commodities?: string,
        @Query('processingStatus') processingStatus?: string,
        @Query('qualityLevel') qualityLevel?: string,
        @Query('keyword') keyword?: string,
        @Query('minScore') minScore?: string,
        @Query('maxScore') maxScore?: string,
    ) {
        const split = (s?: string) => s ? s.split(',').filter(Boolean) : undefined;
        return this.marketIntelService.getDashboardStats({
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            sourceTypes: split(sourceTypes),
            regionCodes: split(regionCodes),
            commodities: split(commodities),
            processingStatus: split(processingStatus),
            qualityLevel: split(qualityLevel),
            keyword,
            minScore: minScore ? parseInt(minScore) : undefined,
            maxScore: maxScore ? parseInt(maxScore) : undefined,
        });
    }

    @Post('dashboard/briefing')
    async generateSmartBriefing(@Body() body: any) {
        return this.marketIntelService.generateSmartBriefing({
            ...body,
            startDate: body.startDate ? new Date(body.startDate) : undefined,
            endDate: body.endDate ? new Date(body.endDate) : undefined,
        });
    }

    @Get('trend-analysis')
    async getTrendAnalysis(
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('commodities') commodities?: string,
        @Query('regions') regions?: string,
    ) {
        return this.marketIntelService.getTrendAnalysis({
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            commodities: commodities ? commodities.split(',') : undefined,
            regions: regions ? regions.split(',') : undefined,
        });
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
        return this.marketIntelService.findEvents({
            eventTypeId,
            enterpriseId,
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
        return this.marketIntelService.getEventStats({
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            commodities: commodities ? commodities.split(',') : undefined,
            regions: regions ? regions.split(',') : undefined,
        });
    }

    @Get('events/:id')
    async findEventById(@Param('id') id: string) {
        return this.marketIntelService.findEventById(id);
    }

    // --- C类增强：市场洞察 ---

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
        return this.marketIntelService.findInsights({
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
        return this.marketIntelService.getInsightStats();
    }

    @Get('insights/:id')
    async findInsightById(@Param('id') id: string) {
        return this.marketIntelService.findInsightById(id);
    }

    // --- C类增强：研究报告 ---

    @Post('research-reports')
    async createResearchReport(@Body() dto: CreateResearchReportDto) {
        return this.researchReportService.create(dto);
    }

    @Get('research-reports')
    async findAllResearchReports(@Query() query: ResearchReportQuery) {
        // 转换日期字符串为 Date 对象
        const options = {
            ...query,
            startDate: query.startDate ? new Date(query.startDate) : undefined,
            endDate: query.endDate ? new Date(query.endDate) : undefined,
            page: query.page ? parseInt(query.page as any, 10) : 1,
            pageSize: query.pageSize ? parseInt(query.pageSize as any, 10) : 20,
        };
        return this.researchReportService.findAll(options);
    }

    @Get('research-reports/stats')
    async getResearchReportStats() {
        return this.researchReportService.getStats();
    }

    @Get('research-reports/:id')
    async findResearchReportById(@Param('id') id: string) {
        return this.researchReportService.findOne(id);
    }

    @Put('research-reports/:id')
    async updateResearchReport(@Param('id') id: string, @Body() dto: UpdateResearchReportDto) {
        return this.researchReportService.update(id, dto);
    }

    @Delete('research-reports/:id')
    async removeResearchReport(@Param('id') id: string) {
        return this.researchReportService.remove(id);
    }

    // --- 综合情报流 ---

    @Get('feed')
    async getIntelligenceFeed(
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('eventTypeIds') eventTypeIds?: string,
        @Query('insightTypeIds') insightTypeIds?: string,
        @Query('sentiments') sentiments?: string,
        @Query('commodities') commodities?: string,
        @Query('keyword') keyword?: string,
        @Query('limit') limit = '50',
        // 新增高级筛选
        @Query('sourceTypes') sourceTypes?: string,
        @Query('regionCodes') regionCodes?: string,
        @Query('minScore') minScore?: string,
        @Query('maxScore') maxScore?: string,
        @Query('processingStatus') processingStatus?: string,
        @Query('qualityLevel') qualityLevel?: string,
        @Query('contentTypes') contentTypes?: string,
    ) {
        // 辅助函数：将空字符串转为 undefined，非空字符串进行 split 并过滤空值
        const splitOrUndefined = (str: string | undefined): string[] | undefined => {
            if (!str || str.trim() === '') return undefined;
            const arr = str.split(',').map(s => s.trim()).filter(s => s.length > 0);
            return arr.length > 0 ? arr : undefined;
        };

        return this.marketIntelService.getIntelligenceFeed({
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            eventTypeIds: splitOrUndefined(eventTypeIds),
            insightTypeIds: splitOrUndefined(insightTypeIds),
            sentiments: splitOrUndefined(sentiments),
            commodities: splitOrUndefined(commodities),
            keyword: keyword?.trim() || undefined,
            limit: parseInt(limit, 10),
            sourceTypes: splitOrUndefined(sourceTypes) as any[] | undefined,
            regionCodes: splitOrUndefined(regionCodes),
            minScore: minScore ? parseInt(minScore, 10) : undefined,
            maxScore: maxScore ? parseInt(maxScore, 10) : undefined,
            processingStatus: splitOrUndefined(processingStatus),
            qualityLevel: splitOrUndefined(qualityLevel),
            contentTypes: splitOrUndefined(contentTypes),
        });
    }

    @Get('hot-topics')
    async getHotTopics(@Query('limit') limit = '20') {
        return this.marketIntelService.getHotTopics(parseInt(limit, 10));
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

    // --- C类：附件/文档管理 ---

    /**
     * 上传文档（C类核心接口）
     * 支持 PDF/Word/Excel/图片
     */
    @Post('upload')
    @UseInterceptors(FileInterceptor('file', {
        limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
        fileFilter: (_req, file, callback) => {
            const allowedMimes = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'image/jpeg',
                'image/png',
                'image/webp',
                'text/plain',
            ];
            if (allowedMimes.includes(file.mimetype)) {
                callback(null, true);
            } else {
                callback(new BadRequestException(`不支持的文件类型: ${file.mimetype}`), false);
            }
        },
    }))
    async uploadDocument(
        @UploadedFile() file: Express.Multer.File,
        @Body('sourceType') sourceType?: string,
        @Body('contentType') contentType?: string,
        @Body('location') location?: string,
        @Body('region') region?: string,
    ) {
        if (!file) {
            throw new BadRequestException('请上传文件');
        }

        // Fix Chinese filename encoding (Multer often defaults to latin1)
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');

        const authorId = 'system-user-placeholder';

        // 1. 解析文档内容
        let extractedText = '';
        let parseError = '';
        try {
            const parseResult = await this.documentParserService.parse(file.buffer, file.mimetype);
            extractedText = parseResult.text || '';
        } catch (error) {
            parseError = error instanceof Error ? error.message : '文档解析失败';
        }

        // 2. 准备内容并创建 MarketIntel 记录
        const rawContent = extractedText
            ? `[文档上传] ${file.originalname}\n\n--- 提取内容 ---\n${extractedText.substring(0, 5000)}${extractedText.length > 5000 ? '...(已截断)' : ''}`
            : `[文档上传] ${file.originalname}${parseError ? `\n\n[解析警告] ${parseError}` : ''}`;


        // Map ContentType to Category (Legacy Support)
        const inputContentType = (contentType as ContentType) || ContentType.DAILY_REPORT;
        let mappedCategory = IntelCategory.C_DOCUMENT;
        if (inputContentType === ContentType.DAILY_REPORT) {
            mappedCategory = IntelCategory.B_SEMI_STRUCTURED;
        }

        const intel = await this.marketIntelService.create({
            category: mappedCategory,
            contentType: inputContentType,
            sourceType: (sourceType as any) || 'OFFICIAL',
            rawContent,
            effectiveTime: new Date(),
            location: location || '未指定',
            region: region ? region.split(',') : [],
            gpsVerified: false,
            completenessScore: extractedText ? 70 : 50,  // 解析成功得分更高
            scarcityScore: 50,
            validationScore: 0,
            totalScore: extractedText ? 60 : 50,
            isFlagged: false,
        }, authorId);

        // 3. 保存文件并创建附件记录（关联 intelId）
        const attachment = await this.intelAttachmentService.saveFile(
            {
                buffer: file.buffer,
                originalname: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
            },
            intel.id, // 关联已创建的情报 ID
            extractedText, // 存储提取的文本作为 ocrText
        );

        return {
            success: true,
            intel,
            attachment: {
                id: attachment.id,
                filename: attachment.filename,
                mimeType: attachment.mimeType,
                fileSize: attachment.fileSize,
            },
            extractedTextLength: extractedText.length,
            parseError: parseError || undefined,
            message: extractedText
                ? `文档上传成功，已提取 ${extractedText.length} 字符`
                : '文档上传成功，内容解析待处理',
        };
    }

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

    @Get(':id/related')
    async getRelatedIntel(
        @Param('id') intelId: string,
        @Query('limit') limit = '8',
    ) {
        return this.marketIntelService.getRelatedIntel(intelId, parseInt(limit, 10));
    }

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
