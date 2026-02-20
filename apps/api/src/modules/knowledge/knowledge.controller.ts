import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  KnowledgePeriodType,
  KnowledgeRelationType,
  KnowledgeStatus,
  KnowledgeType,
} from '@prisma/client';
import { KnowledgeService, CreateKnowledgeInput, UpdateKnowledgeInput } from './knowledge.service';

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) { }

  @Get('items')
  findAll(
    @Query('type') type?: KnowledgeType,
    @Query('status') status?: KnowledgeStatus,
    @Query('periodType') periodType?: KnowledgePeriodType,
    @Query('periodKey') periodKey?: string,
    @Query('sourceType') sourceType?: string,
    @Query('commodity') commodity?: string,
    @Query('region') region?: string,
    @Query('keyword') keyword?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize?: number,
    @Query('authorId') authorId?: string,
  ) {
    return this.knowledgeService.findAll({
      type,
      status,
      periodType,
      periodKey,
      sourceType,
      commodity,
      region,
      keyword,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page,
      pageSize,
      authorId,
    });
  }

  @Get('items/pending-review')
  getPendingReviewList(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize?: number,
  ) {
    return this.knowledgeService.getPendingReviewList(page, pageSize);
  }

  @Get('items/:id')
  findOne(@Param('id') id: string) {
    return this.knowledgeService.findOne(id);
  }

  @Post('items/submit-report')
  submitReport(
    @Body('type') type: 'DAILY' | 'WEEKLY' | 'MONTHLY',
    @Body('title') title: string,
    @Body('contentPlain') contentPlain: string,
    @Body('contentRich') contentRich?: string,
    @Body('commodities') commodities?: string[],
    @Body('region') region?: string[],
    @Body('authorId') authorId?: string,
    @Body('taskId') taskId?: string,
    @Body('triggerAnalysis', new DefaultValuePipe(true), ParseBoolPipe) triggerAnalysis?: boolean,
  ) {
    if (!type || !title || !contentPlain || !authorId) {
      throw new BadRequestException(
        'type, title, contentPlain, authorId are required',
      );
    }
    return this.knowledgeService.submitReport({
      type,
      title,
      contentPlain,
      contentRich,
      commodities,
      region,
      authorId,
      taskId,
      triggerAnalysis,
    });
  }

  @Patch('items/:id/report')
  updateReport(
    @Param('id') id: string,
    @Body('title') title?: string,
    @Body('contentPlain') contentPlain?: string,
    @Body('contentRich') contentRich?: string,
    @Body('commodities') commodities?: string[],
    @Body('region') region?: string[],
    @Body('authorId') authorId?: string,
  ) {
    if (!authorId) {
      throw new BadRequestException('authorId is required');
    }
    return this.knowledgeService.updateReport(id, {
      title,
      contentPlain,
      contentRich,
      commodities,
      region,
      authorId,
    });
  }





  @Post('items/:id/review')
  reviewReport(
    @Param('id') id: string,
    @Body('action') action: 'APPROVE' | 'REJECT',
    @Body('reviewerId') reviewerId: string,
    @Body('rejectReason') rejectReason?: string,
  ) {
    if (!action || !reviewerId) {
      throw new BadRequestException('action and reviewerId are required');
    }
    if (action === 'REJECT' && !rejectReason) {
      throw new BadRequestException('rejectReason is required when rejecting');
    }
    return this.knowledgeService.reviewReport(id, {
      action,
      reviewerId,
      rejectReason,
    });
  }

  @Post('items')
  create(@Body() body: CreateKnowledgeInput) {
    return this.knowledgeService.create(body);
  }

  @Patch('items/:id')
  update(@Param('id') id: string, @Body() body: UpdateKnowledgeInput) {
    return this.knowledgeService.update(id, body);
  }

  @Post('items/:id/reanalyze')
  reanalyze(
    @Param('id') id: string,
    @Body('triggerDeepAnalysis', new DefaultValuePipe(true), ParseBoolPipe)
    triggerDeepAnalysis: boolean,
  ) {
    return this.knowledgeService.reanalyze(id, triggerDeepAnalysis);
  }

  @Post('relations')
  createRelation(
    @Body('fromKnowledgeId') fromKnowledgeId: string,
    @Body('toKnowledgeId') toKnowledgeId: string,
    @Body('relationType') relationType: KnowledgeRelationType,
    @Body('weight', new DefaultValuePipe(50), ParseIntPipe) weight: number,
    @Body('evidence') evidence?: string,
  ) {
    return this.knowledgeService.createRelation(
      fromKnowledgeId,
      toKnowledgeId,
      relationType,
      weight,
      evidence,
    );
  }

  @Get('items/:id/relations')
  getRelations(
    @Param('id') id: string,
    @Query('types') types?: string,
    @Query('minWeight', new DefaultValuePipe(0), ParseIntPipe) minWeight?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('direction') direction?: 'incoming' | 'outgoing' | 'both',
  ) {
    const parsedTypes = types
      ? types
        .split(',')
        .map((item) => item.trim())
        .filter((item): item is KnowledgeRelationType =>
          Object.values(KnowledgeRelationType).includes(item as KnowledgeRelationType),
        )
      : undefined;

    return this.knowledgeService.getRelations(id, {
      types: parsedTypes,
      minWeight,
      limit,
      direction,
    });
  }

  @Get('analytics/trend')
  getTrend(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.knowledgeService.getTrend(days);
  }

  @Get('analytics/weekly-overview')
  getWeeklyOverview(@Query('periodKey') periodKey?: string) {
    return this.knowledgeService.getWeeklyOverview(periodKey);
  }

  @Get('analytics/topic-evolution')
  getTopicEvolution(
    @Query('commodity') commodity?: string,
    @Query('weeks', new DefaultValuePipe(8), ParseIntPipe) weeks?: number,
  ) {
    return this.knowledgeService.getTopicEvolution(commodity, weeks);
  }

  @Get('search')
  search(
    @Query('keyword') keyword?: string,
    @Query('type') type?: KnowledgeType,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize?: number,
  ) {
    return this.knowledgeService.findAll({ keyword, type, page, pageSize });
  }

  @Post('admin/backfill')
  backfill(@Body('limit', new DefaultValuePipe(500), ParseIntPipe) limit: number) {
    return this.knowledgeService.backfillFromLegacy(limit);
  }

  @Get('admin/consistency')
  consistency(@Query('sampleSize', new DefaultValuePipe(50), ParseIntPipe) sampleSize: number) {
    return this.knowledgeService.checkLegacyConsistency(sampleSize);
  }

  @Get('legacy/:source/:id')
  resolveLegacy(@Param('source') source: 'intel' | 'report', @Param('id') id: string) {
    return this.knowledgeService.resolveLegacy(source, id);
  }

  @Post('admin/weekly-rollup')
  weeklyRollup(
    @Body('targetDate') targetDate?: string,
    @Body('authorId') authorId?: string,
    @Body('triggerAnalysis', new DefaultValuePipe(true), ParseBoolPipe) triggerAnalysis?: boolean,
  ) {
    return this.knowledgeService.generateWeeklyRollup({
      targetDate: targetDate ? new Date(targetDate) : undefined,
      authorId,
      triggerAnalysis,
    });
  }

  @Get('graph')
  getGraphData(
    @Query('intelId') intelId?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
  ) {
    return this.knowledgeService.getGraphData({ intelId, limit });
  }

  // =============================================
  // 研报路由 (统一到 Knowledge 域)
  // =============================================

  @Post('reports')
  createReport(@Body() body: {
    title: string;
    contentPlain: string;
    contentRich?: string;
    reportType?: string;
    reportPeriod?: string;
    publishAt?: string;
    sourceType?: string;
    commodities?: string[];
    region?: string[];
    authorId: string;
    summary?: string;
    keyPoints?: unknown;
    prediction?: unknown;
    dataPoints?: unknown;
    triggerAnalysis?: boolean;
  }) {
    if (!body.title || !body.contentPlain || !body.authorId) {
      throw new BadRequestException('title, contentPlain, authorId are required');
    }
    return this.knowledgeService.createResearchReport({
      ...body,
      publishAt: body.publishAt ? new Date(body.publishAt) : undefined,
    });
  }

  @Get('reports')
  findAllReports(
    @Query('reportType') reportType?: string,
    @Query('status') reportStatus?: KnowledgeStatus,
    @Query('commodity') commodity?: string,
    @Query('region') region?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('keyword') keyword?: string,
    @Query('title') title?: string,
    @Query('sourceType') sourceType?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize?: number,
  ) {
    return this.knowledgeService.findAllReports({
      reportType,
      status: reportStatus,
      commodity,
      region,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      keyword,
      title,
      sourceType,
      page,
      pageSize,
    });
  }

  @Get('reports/stats')
  getReportStats(@Query('days') days?: string) {
    return this.knowledgeService.getReportStats({ days: days ? parseInt(days, 10) : undefined });
  }

  @Get('reports/:id')
  findOneReport(@Param('id') id: string) {
    return this.knowledgeService.findOneReport(id);
  }

  @Patch('reports/:id')
  updateReport2(
    @Param('id') id: string,
    @Body() body: {
      title?: string;
      contentPlain?: string;
      contentRich?: string;
      reportType?: string;
      reportPeriod?: string;
      publishAt?: string;
      sourceType?: string;
      commodities?: string[];
      region?: string[];
      summary?: string;
      keyPoints?: unknown;
      prediction?: unknown;
      dataPoints?: unknown;
    },
  ) {
    return this.knowledgeService.updateResearchReport(id, {
      ...body,
      publishAt: body.publishAt ? new Date(body.publishAt) : undefined,
    });
  }

  @Post('reports/:id/submit')
  submitDraftReport(
    @Param('id') id: string,
    @Body('taskId') taskId?: string,
    @Body('authorId') authorId?: string,
  ) {
    return this.knowledgeService.submitDraftReport(id, taskId, authorId);
  }

  @Delete('reports/:id')
  deleteReport(@Param('id') id: string) {
    return this.knowledgeService.deleteReport(id);
  }

  @Post('reports/batch-delete')
  batchDeleteReports(@Body() body: { ids: string[] }) {
    if (!body.ids || !Array.isArray(body.ids)) {
      throw new BadRequestException('ids array is required');
    }
    return this.knowledgeService.batchDeleteReports(body.ids);
  }

  @Post('reports/:id/view')
  incrementReportView(@Param('id') id: string) {
    return this.knowledgeService.incrementReportViewCount(id);
  }

  @Post('reports/:id/download')
  incrementReportDownload(@Param('id') id: string) {
    return this.knowledgeService.incrementReportDownloadCount(id);
  }

  @Post('reports/export')
  async exportReports(
    @Body() body: { ids?: string[]; query?: { reportType?: string; status?: KnowledgeStatus; commodity?: string; region?: string; startDate?: string; endDate?: string } },
    @Res() res: Response,
  ) {
    const query = body.query ? {
      ...body.query,
      status: body.query.status as KnowledgeStatus | undefined,
      startDate: body.query.startDate ? new Date(body.query.startDate) : undefined,
      endDate: body.query.endDate ? new Date(body.query.endDate) : undefined,
    } : undefined;
    const buffer = await this.knowledgeService.exportReports(body.ids, query);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="reports-export.xlsx"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Post('reports/:id/review')
  reviewReport2(
    @Param('id') id: string,
    @Body('action') action: 'APPROVE' | 'REJECT',
    @Body('reviewerId') reviewerId: string,
    @Body('rejectReason') rejectReason?: string,
  ) {
    if (!action || !reviewerId) {
      throw new BadRequestException('action and reviewerId are required');
    }
    return this.knowledgeService.reviewReport(id, { action, reviewerId, rejectReason });
  }
}
