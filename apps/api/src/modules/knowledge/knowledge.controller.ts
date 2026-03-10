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
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import {
  KnowledgePeriodType,
  KnowledgeRelationType,
  KnowledgeStatus,
  KnowledgeType,
} from '@prisma/client';
import { KnowledgeService, CreateKnowledgeInput, UpdateKnowledgeInput } from './knowledge.service';
import { KnowledgeSyncService } from './knowledge-sync.service';
import { KnowledgeSearchService } from './knowledge-search.service';
import { KnowledgeAggregationService } from './knowledge-aggregation.service';
import { setDeprecationHeaders } from '../../common/utils/deprecation';

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService, private readonly syncService: KnowledgeSyncService, private readonly searchService: KnowledgeSearchService, private readonly aggService: KnowledgeAggregationService) { }

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
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, '/v1/knowledge-items');
    }
    return this.searchService.findAll({
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
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, '/v1/knowledge-items/pending-review');
    }
    return this.knowledgeService.getPendingReviewList(page, pageSize);
  }

  @Get('items/:id')
  findOne(@Param('id') id: string, @Res({ passthrough: true }) res?: Response) {
    if (res) {
      setDeprecationHeaders(res, `/v1/knowledge-items/${id}`);
    }
    return this.searchService.findOne(id);
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
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, '/v1/knowledge-items/actions/submit-report');
    }
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
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, `/v1/knowledge-items/${id}/report`);
    }
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
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, `/v1/knowledge-items/${id}/actions/review`);
    }
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
  create(@Body() body: CreateKnowledgeInput, @Res({ passthrough: true }) res?: Response) {
    if (res) {
      setDeprecationHeaders(res, '/v1/knowledge-items');
    }
    return this.knowledgeService.create(body);
  }

  @Patch('items/:id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateKnowledgeInput,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, `/v1/knowledge-items/${id}`);
    }
    return this.knowledgeService.update(id, body);
  }

  @Post('items/:id/reanalyze')
  reanalyze(
    @Param('id') id: string,
    @Body('triggerDeepAnalysis', new DefaultValuePipe(true), ParseBoolPipe)
    triggerDeepAnalysis: boolean,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, `/v1/knowledge-items/${id}/actions/reanalyze`);
    }
    return this.knowledgeService.reanalyze(id, triggerDeepAnalysis);
  }

  @Post('relations')
  createRelation(
    @Body('fromKnowledgeId') fromKnowledgeId: string,
    @Body('toKnowledgeId') toKnowledgeId: string,
    @Body('relationType') relationType: KnowledgeRelationType,
    @Body('weight', new DefaultValuePipe(50), ParseIntPipe) weight: number,
    @Body('evidence') evidence?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, '/v1/knowledge-items/relations');
    }
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

    return this.searchService.getRelations(id, {
      types: parsedTypes,
      minWeight,
      limit,
      direction,
    });
  }

  @Get('analytics/trend')
  getTrend(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, '/v1/knowledge/analytics/trend');
    }
    return this.aggService.getTrend(days);
  }

  @Get('analytics/weekly-overview')
  getWeeklyOverview(@Query('periodKey') periodKey?: string, @Res({ passthrough: true }) res?: Response) {
    if (res) {
      setDeprecationHeaders(res, '/v1/knowledge/analytics/weekly-overview');
    }
    return this.aggService.getWeeklyOverview(periodKey);
  }

  @Get('analytics/topic-evolution')
  getTopicEvolution(
    @Query('commodity') commodity?: string,
    @Query('weeks', new DefaultValuePipe(8), ParseIntPipe) weeks?: number,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, '/v1/knowledge/analytics/topic-evolution');
    }
    return this.aggService.getTopicEvolution(commodity, weeks);
  }

  @Get('search')
  search(
    @Query('keyword') keyword?: string,
    @Query('type') type?: KnowledgeType,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize?: number,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, '/v1/knowledge/search');
    }
    return this.searchService.findAll({ keyword, type, page, pageSize });
  }

  @Post('admin/backfill')
  backfill(
    @Body('limit', new DefaultValuePipe(500), ParseIntPipe) limit: number,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, '/v1/knowledge/admin/backfill');
    }
    return this.syncService.backfillFromLegacy(limit);
  }

  @Get('admin/consistency')
  consistency(
    @Query('sampleSize', new DefaultValuePipe(50), ParseIntPipe) sampleSize: number,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, '/v1/knowledge/admin/consistency');
    }
    return this.syncService.checkLegacyConsistency(sampleSize);
  }

  @Get('legacy/:source/:id')
  resolveLegacy(
    @Param('source') source: 'intel' | 'report',
    @Param('id') id: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, `/v1/knowledge/legacy/${source}/${id}`);
    }
    return this.syncService.resolveLegacy(source, id);
  }

  @Post('admin/weekly-rollup')
  weeklyRollup(
    @Body('targetDate') targetDate?: string,
    @Body('authorId') authorId?: string,
    @Body('triggerAnalysis', new DefaultValuePipe(true), ParseBoolPipe) triggerAnalysis?: boolean,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, '/v1/knowledge/admin/weekly-rollup');
    }
    return this.searchService.generateWeeklyRollup({
      targetDate: targetDate ? new Date(targetDate) : undefined,
      authorId,
      triggerAnalysis,
    });
  }

  @Get('graph')
  getGraphData(
    @Query('intelId') intelId?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, '/v1/knowledge/graph');
    }
    return this.searchService.getGraphData({ intelId, limit });
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
    triggerAnalysis?: boolean;
    intelId?: string;
    attachmentIds?: string[];
  }, @Res({ passthrough: true }) res?: Response) {
    if (res) {
      setDeprecationHeaders(res, '/v1/reports');
    }
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
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, '/v1/reports');
    }
    return this.searchService.findAllReports({
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
  getReportStats(@Query('days') days?: string, @Res({ passthrough: true }) res?: Response) {
    if (res) {
      setDeprecationHeaders(res, '/v1/reports/stats');
    }
    return this.aggService.getReportStats({ days: days ? parseInt(days, 10) : undefined });
  }

  @Get('reports/:id')
  findOneReport(@Param('id') id: string, @Res({ passthrough: true }) res?: Response) {
    if (res) {
      setDeprecationHeaders(res, `/v1/reports/${id}`);
    }
    return this.searchService.findOneReport(id);
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
      intelId?: string;
      attachmentIds?: string[];
    },
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, `/v1/reports/${id}`);
    }
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
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, `/v1/reports/${id}/submit`);
    }
    return this.knowledgeService.submitDraftReport(id, taskId, authorId);
  }

  @Delete('reports/:id')
  deleteReport(@Param('id') id: string, @Res({ passthrough: true }) res?: Response) {
    if (res) {
      setDeprecationHeaders(res, `/v1/reports/${id}`);
    }
    return this.knowledgeService.deleteReport(id);
  }

  @Post('reports/batch-delete')
  batchDeleteReports(@Body() body: { ids: string[] }, @Res({ passthrough: true }) res?: Response) {
    if (res) {
      setDeprecationHeaders(res, '/v1/reports/batch-delete');
    }
    if (!body.ids || !Array.isArray(body.ids)) {
      throw new BadRequestException('ids array is required');
    }
    return this.knowledgeService.batchDeleteReports(body.ids);
  }

  @Post('reports/:id/view')
  incrementReportView(@Param('id') id: string, @Res({ passthrough: true }) res?: Response) {
    if (res) {
      setDeprecationHeaders(res, `/v1/reports/${id}/view`);
    }
    return this.knowledgeService.incrementReportViewCount(id);
  }

  @Post('reports/:id/download')
  incrementReportDownload(@Param('id') id: string, @Res({ passthrough: true }) res?: Response) {
    if (res) {
      setDeprecationHeaders(res, `/v1/reports/${id}/download`);
    }
    return this.knowledgeService.incrementReportDownloadCount(id);
  }

  @Post('reports/export')
  async exportReports(
    @Body() body: { ids?: string[]; query?: { reportType?: string; status?: KnowledgeStatus; commodity?: string; region?: string; startDate?: string; endDate?: string } },
    @Res() res: Response,
  ) {
    setDeprecationHeaders(res, '/v1/reports/export');
    const query = body.query ? {
      ...body.query,
      status: body.query.status as KnowledgeStatus | undefined,
      startDate: body.query.startDate ? new Date(body.query.startDate) : undefined,
      endDate: body.query.endDate ? new Date(body.query.endDate) : undefined,
    } : undefined;
    const buffer = await this.aggService.exportReports(body.ids, query);
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
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (res) {
      setDeprecationHeaders(res, `/v1/reports/${id}/review`);
    }
    if (!action || !reviewerId) {
      throw new BadRequestException('action and reviewerId are required');
    }
    return this.knowledgeService.reviewReport(id, { action, reviewerId, rejectReason });
  }

  @Get('attachments/:id/download')
  async downloadAttachment(
    @Param('id') id: string,
    @Query('inline') inline: string,
    @Res() res: Response,
  ) {
    setDeprecationHeaders(res, `/v1/knowledge/attachments/${id}/download`);
    const attachment = await this.searchService.findAttachment(id);
    if (!attachment) {
      throw new NotFoundException(`Attachment ID ${id} not found`);
    }

    const disposition = inline === 'true' ? 'inline' : 'attachment';

    if (inline === 'true') {
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader(
        'Content-Disposition',
        `${disposition}; filename="${encodeURIComponent(attachment.filename)}"`,
      );
      return res.sendFile(attachment.storagePath);
    }

    res.download(attachment.storagePath, attachment.filename);
  }
}
