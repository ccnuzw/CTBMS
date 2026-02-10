import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Put,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { MarketIntelService } from './market-intel.service';
import { PriceDataService } from './price-data.service';

import { ResearchReportService } from './research-report.service';
import {
  CreateMarketIntelRequest,
  UpdateMarketIntelRequest,
  MarketIntelQueryRequest,
  AnalyzeContentRequest,
  CreateManualResearchReportRequest,
  PromoteToReportRequest,
} from './dto';
import {
  CreatePriceDataDto,
  PriceDataQuery,
  ContentType,
  IntelCategory,
  IntelSourceType,
  CreateResearchReportDto,
  UpdateResearchReportDto,
  ResearchReportQuery,
  ReviewStatus,
} from '@packages/types';
import { IntelAttachmentService } from './intel-attachment.service';

import { DocumentParserService } from './document-parser.service';

@Controller('market-intel')
export class MarketIntelController {
  constructor(
    private readonly marketIntelService: MarketIntelService,
    private readonly priceDataService: PriceDataService,
    private readonly researchReportService: ResearchReportService,
    private readonly intelAttachmentService: IntelAttachmentService,
    private readonly documentParserService: DocumentParserService,
  ) {}

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
  async getLeaderboard(
    @Query('limit') limit = '10',
    @Query('timeframe') timeframe: 'day' | 'week' | 'month' | 'year' = 'month',
  ) {
    return this.marketIntelService.getLeaderboard(parseInt(limit, 10), timeframe);
  }

  @Post('analyze')
  async analyze(@Body() dto: AnalyzeContentRequest) {
    return this.marketIntelService.analyze(
      dto.content as string,
      dto.category as IntelCategory,
      dto.location,
      dto.base64Image,
      dto.mimeType,
      dto.contentType,
    );
  }

  @Post('generate-insight')
  async generateInsight(@Body() dto: { content: string }) {
    return { summary: await this.marketIntelService.generateInsight(dto.content) };
  }

  @Get('test-ai')
  async testAI() {
    return this.marketIntelService.testAI();
  }

  /**
   * 全景检索：聚合搜索接口
   * 一次请求返回价格数据、市场情报、文档三类数据及统计摘要
   */
  @Get('universal-search')
  async universalSearch(
    @Query('keyword') keyword: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('sentiment') sentiment?: 'positive' | 'negative' | 'neutral',
    @Query('commodities') commodities?: string,
    @Query('sourceTypes') sourceTypes?: string,
    @Query('regionCodes') regionCodes?: string,
    @Query('pricePageSize') pricePageSize = '20',
    @Query('intelPageSize') intelPageSize = '10',
    @Query('docPageSize') docPageSize = '10',
  ) {
    if (!keyword || !keyword.trim()) {
      throw new BadRequestException('keyword is required');
    }
    const split = (s?: string) => (s ? s.split(',').filter(Boolean) : undefined);
    return this.marketIntelService.universalSearch({
      keyword: keyword.trim(),
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      sentiment,
      commodities: split(commodities),
      sourceTypes: split(sourceTypes),
      regionCodes: split(regionCodes),
      pricePageSize: parseInt(pricePageSize, 10),
      intelPageSize: parseInt(intelPageSize, 10),
      docPageSize: parseInt(docPageSize, 10),
    });
  }

  /**
   * 搜索建议：提供自动补全功能
   */
  @Get('search-suggestions')
  async getSearchSuggestions(@Query('prefix') prefix: string, @Query('limit') limit = '10') {
    return this.marketIntelService.getSearchSuggestions(prefix || '', parseInt(limit, 10));
  }

  /**
   * 全文搜索增强：支持多关键词、相关性评分、分页
   */
  @Get('full-text-search')
  async fullTextSearch(
    @Query('keywords') keywords: string,
    @Query('category') category?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    if (!keywords || !keywords.trim()) {
      throw new BadRequestException('keywords is required');
    }
    return this.marketIntelService.fullTextSearch({
      keywords: keywords.trim(),
      category: category as IntelCategory | undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    });
  }

  /**
   * 知识图谱关联：基于标签、品种、区域查找关联内容
   */
  @Get('related-content')
  async getRelatedContent(
    @Query('intelId') intelId?: string,
    @Query('tags') tags?: string,
    @Query('commodities') commodities?: string,
    @Query('regionCodes') regionCodes?: string,
    @Query('limit') limit = '10',
  ) {
    const split = (v?: string) => (v ? v.split(',').filter(Boolean) : []);
    return this.marketIntelService.getRelatedContent({
      intelId,
      tags: split(tags),
      commodities: split(commodities),
      regionCodes: split(regionCodes),
      limit: parseInt(limit, 10),
    });
  }

  @Post('documents/batch-delete')
  async batchDelete(@Body() body: { ids: string[] }) {
    if (!body.ids || !Array.isArray(body.ids)) {
      throw new BadRequestException('ids array is required');
    }
    return this.marketIntelService.batchDelete(body.ids);
  }

  @Post('documents/batch-tags')
  async batchUpdateTags(
    @Body() body: { ids: string[]; addTags?: string[]; removeTags?: string[] },
  ) {
    if (!body.ids || !Array.isArray(body.ids)) {
      throw new BadRequestException('ids array is required');
    }
    return this.marketIntelService.batchUpdateTags(
      body.ids,
      body.addTags || [],
      body.removeTags || [],
    );
  }

  @Get('documents/stats')
  async getDocStats(@Query('days') days?: number) {
    return this.marketIntelService.getDocStats(days ? Number(days) : 30);
  }

  @Patch(':id/tags')
  async updateTags(@Param('id') id: string, @Body() body: { tags: string[] }) {
    if (!body.tags || !Array.isArray(body.tags)) {
      throw new BadRequestException('tags array is required');
    }
    return this.marketIntelService.updateTags(id, body.tags);
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

  @Get('price-data/continuity-health')
  async getPriceContinuityHealth(@Query() query: PriceDataQuery & { days?: string }) {
    return this.priceDataService.getContinuityHealth(query);
  }

  @Get('alerts/rules')
  async getAlertRules() {
    return this.priceDataService.listAlertRules();
  }

  @Post('alerts/rules')
  async createAlertRule(
    @Body()
    body: {
      name: string;
      type: 'DAY_CHANGE_ABS' | 'DAY_CHANGE_PCT' | 'DEVIATION_FROM_MEAN_PCT' | 'CONTINUOUS_DAYS';
      threshold?: number;
      days?: number;
      direction?: 'UP' | 'DOWN' | 'BOTH';
      severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      priority?: number;
      isActive?: boolean;
    },
  ) {
    return this.priceDataService.createAlertRule(body);
  }

  @Put('alerts/rules/:id')
  async updateAlertRule(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      type?: 'DAY_CHANGE_ABS' | 'DAY_CHANGE_PCT' | 'DEVIATION_FROM_MEAN_PCT' | 'CONTINUOUS_DAYS';
      threshold?: number;
      days?: number;
      direction?: 'UP' | 'DOWN' | 'BOTH';
      severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      priority?: number;
      isActive?: boolean;
    },
  ) {
    return this.priceDataService.updateAlertRule(id, body);
  }

  @Delete('alerts/rules/:id')
  async deleteAlertRule(@Param('id') id: string) {
    return this.priceDataService.removeAlertRule(id);
  }

  @Post('alerts/evaluate')
  async evaluateAlerts(
    @Query()
    query: PriceDataQuery & {
      days?: string;
      limit?: string;
    },
  ) {
    return this.priceDataService.evaluateAlerts(query);
  }

  @Get('alerts')
  async getAlerts(
    @Query()
    query: PriceDataQuery & {
      days?: string;
      severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      status?: 'OPEN' | 'ACKNOWLEDGED' | 'CLOSED';
      limit?: string;
      refresh?: string;
    },
  ) {
    return this.priceDataService.getAlerts(query);
  }

  @Get('alerts/:id/logs')
  async getAlertLogs(@Param('id') id: string) {
    return this.priceDataService.listAlertLogs(id);
  }

  @Patch('alerts/:id/status')
  async updateAlertStatus(
    @Param('id') id: string,
    @Body()
    body: {
      status: 'OPEN' | 'ACKNOWLEDGED' | 'CLOSED';
      note?: string;
      reason?: string;
      operator?: string;
    },
  ) {
    return this.priceDataService.updateAlertStatus(
      id,
      body.status,
      body.note,
      body.reason,
      body.operator,
    );
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
  async getPriceHeatmap(@Query('commodity') commodity: string, @Query('date') date?: string) {
    return this.priceDataService.getHeatmap(commodity, date ? new Date(date) : undefined);
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
    @Query('reviewScope') reviewScope?: string,
    @Query('sourceScope') sourceScope?: string,
  ) {
    return this.priceDataService.getByCollectionPoint(
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
    @Query('reviewScope') reviewScope?: string,
    @Query('sourceScope') sourceScope?: string,
    @Query('includeData') includeData?: string,
  ) {
    return this.priceDataService.getByRegion(
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
    @Query('reviewScope') reviewScope?: string,
    @Query('sourceScope') sourceScope?: string,
  ) {
    const collectionPointIds = ids.split(',').filter((id) => id.trim());
    return this.priceDataService.getMultiPointTrend(
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

  /**
   * 对比分析聚合数据（排行/分布/区域统计/质量概览）
   */
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
    return this.priceDataService.getCompareAnalytics({
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
    const split = (s?: string) => (s ? s.split(',').filter(Boolean) : undefined);
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
  async generateSmartBriefing(
    @Body() body: { startDate?: string; endDate?: string; [key: string]: unknown },
  ) {
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
      page: query.page ? Number(query.page) : 1,
      pageSize: query.pageSize ? Number(query.pageSize) : 20,
    };
    return this.researchReportService.findAll(options);
  }

  @Post('research-reports/manual')
  async createManualResearchReport(@Body() dto: CreateManualResearchReportRequest) {
    return this.researchReportService.createManual(dto);
  }

  @Get('research-reports/stats')
  async getResearchReportStats(@Query('days') days?: string) {
    return this.researchReportService.getStats({ days: days ? parseInt(days, 10) : undefined });
  }

  @Get('research-reports/by-intel/:intelId')
  async findResearchReportByIntelId(@Param('intelId') intelId: string) {
    return this.researchReportService.findByIntelId(intelId);
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

  @Post('research-reports/batch-delete')
  async batchRemoveResearchReports(@Body() body: { ids: string[] }) {
    return this.researchReportService.batchRemove(body.ids);
  }

  @Post('research-reports/batch-review')
  async batchReviewResearchReports(
    @Body() body: { ids: string[]; status: ReviewStatus; reviewerId: string },
  ) {
    if (!body.ids || !Array.isArray(body.ids)) {
      throw new BadRequestException('ids array is required');
    }
    return this.researchReportService.batchUpdateReviewStatus(
      body.ids,
      body.status,
      body.reviewerId,
    );
  }

  @Post('research-reports/export')
  async exportResearchReports(
    @Body() body: { ids?: string[]; query?: ResearchReportQuery },
    @Res() res: Response,
  ) {
    const buffer = await this.researchReportService.export(body.ids, body.query);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="research-reports-export.xlsx"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Post('research-reports/:id/view')
  async incrementResearchReportView(@Param('id') id: string) {
    return this.researchReportService.incrementViewCount(id);
  }

  @Post('research-reports/:id/download')
  async incrementResearchReportDownload(@Param('id') id: string) {
    return this.researchReportService.incrementDownloadCount(id);
  }

  @Put('research-reports/:id/review')
  async updateResearchReportReview(
    @Param('id') id: string,
    @Body() body: { status: 'PENDING' | 'APPROVED' | 'REJECTED'; reviewerId: string },
  ) {
    return this.researchReportService.updateReviewStatus(id, body.status, body.reviewerId);
  }

  // --- 文档升级为研报 (Promote to Report) ---

  @Post(':id/promote-to-report')
  async promoteToReport(@Param('id') intelId: string, @Body() dto: PromoteToReportRequest) {
    return this.researchReportService.promoteToReport(intelId, dto);
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
      const arr = str
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
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
      sourceTypes: splitOrUndefined(sourceTypes),
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

  // --- 任务调度 --- (已迁移至 IntelTaskController)

  // --- C类：附件/文档管理 ---

  /**
   * 上传文档（C类核心接口）
   * 支持 PDF/Word/Excel/图片
   */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
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
    }),
  )
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
    let extractedHtml = '';
    let parseError = '';
    try {
      const parseResult = await this.documentParserService.parse(file.buffer, file.mimetype);
      extractedText = parseResult.text || '';
      extractedHtml = parseResult.html || '';
    } catch (error) {
      parseError = error instanceof Error ? error.message : '文档解析失败';
    }

    // 2. 准备内容并创建 MarketIntel 记录
    // 优先使用 HTML (保留排版)，否则使用纯文本。不再进行 5000 字符截断。
    const contentToSave = extractedHtml || extractedText;
    const rawContent = contentToSave
      ? contentToSave
      : `[文档上传] ${file.originalname}${parseError ? `\n\n[解析警告] ${parseError}` : ''}`;

    // Map ContentType to Category (Legacy Support)
    const inputContentType = (contentType as ContentType) || ContentType.DAILY_REPORT;
    let mappedCategory = IntelCategory.C_DOCUMENT;
    if (inputContentType === ContentType.DAILY_REPORT) {
      mappedCategory = IntelCategory.B_SEMI_STRUCTURED;
    }

    const resolvedSourceType = Object.values(IntelSourceType).includes(
      sourceType as IntelSourceType,
    )
      ? (sourceType as IntelSourceType)
      : IntelSourceType.OFFICIAL;

    const intel = await this.marketIntelService.create(
      {
        category: mappedCategory,
        contentType: inputContentType,
        sourceType: resolvedSourceType,
        rawContent,
        effectiveTime: new Date(),
        location: location || '未指定',
        region: region ? region.split(',') : [],
        gpsVerified: false,
        completenessScore: extractedText ? 70 : 50, // 解析成功得分更高
        scarcityScore: 50,
        validationScore: 0,
        totalScore: extractedText ? 60 : 50,
        isFlagged: false,
      },
      authorId,
    );

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
  async searchAttachments(@Query('keyword') keyword: string, @Query('limit') limit = '20') {
    return this.intelAttachmentService.searchByOcrText(keyword, parseInt(limit, 10));
  }

  @Delete('attachments/:id')
  async removeAttachment(@Param('id') id: string) {
    return this.intelAttachmentService.remove(id);
  }

  @Get('attachments/:id/download')
  async downloadAttachment(
    @Param('id') id: string,
    @Query('inline') inline: string,
    @Res() res: Response,
  ) {
    const attachment = await this.intelAttachmentService.findOne(id);

    // Since we are not using a dedicated file storage service (S3/MinIO), we assume local fs
    // and we need to verify the file exists.
    // NOTE: In a real app, abstract this into `StorageProvider`.

    const disposition = inline === 'true' ? 'inline' : 'attachment';

    // Set headers manually for inline to ensure correct mime type handling by browser
    if (inline === 'true') {
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader(
        'Content-Disposition',
        `${disposition}; filename="${encodeURIComponent(attachment.filename)}"`,
      );
      return res.sendFile(attachment.storagePath);
    }

    // We defer to express's res.download which handles streams and headers
    return res.download(attachment.storagePath, attachment.filename, (err) => {
      if (err) {
        // Handle error, but response might have started
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).send('Download failed');
        }
      }
    });
  }

  // =============================================
  // 动态路由 (必须放在最后)
  // =============================================

  @Get(':id/related')
  async getRelatedIntel(@Param('id') intelId: string, @Query('limit') limit = '8') {
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
}
