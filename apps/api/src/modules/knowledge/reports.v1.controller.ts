import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeSearchService } from './knowledge-search.service';
import { KnowledgeAggregationService } from './knowledge-aggregation.service';
import { KnowledgeStatus } from '@prisma/client';
import { Response } from 'express';

@Controller('v1/reports')
export class ReportsV1Controller {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly searchService: KnowledgeSearchService,
    private readonly aggService: KnowledgeAggregationService,
  ) {}

  @Post()
  createReport(
    @Body()
    body: {
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
    },
  ) {
    if (!body.title || !body.contentPlain || !body.authorId) {
      throw new BadRequestException('title, contentPlain, authorId are required');
    }
    return this.knowledgeService.createResearchReport({
      ...body,
      publishAt: body.publishAt ? new Date(body.publishAt) : undefined,
    });
  }

  @Get()
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

  @Get('stats')
  getReportStats(@Query('days') days?: string) {
    return this.aggService.getReportStats({ days: days ? parseInt(days, 10) : undefined });
  }

  @Get(':id')
  findOneReport(@Param('id') id: string) {
    return this.searchService.findOneReport(id);
  }

  @Patch(':id')
  updateReport(
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      contentPlain?: string;
      contentRich?: string;
      reportType?: string;
      reportPeriod?: string;
      publishAt?: string;
      sourceType?: string;
      commodities?: string[];
      region?: string[];
      authorId?: string;
      summary?: string;
      keyPoints?: unknown;
      prediction?: unknown;
      status?: string;
      attachmentIds?: string[];
    },
  ) {
    if (!body.authorId) {
      throw new BadRequestException('authorId is required');
    }
    return this.knowledgeService.updateResearchReport(id, {
      ...body,
      publishAt: body.publishAt ? new Date(body.publishAt) : undefined,
    });
  }

  @Delete(':id')
  deleteReport(@Param('id') id: string) {
    return this.knowledgeService.deleteReport(id);
  }

  @Post(':id/submit')
  submitDraftReport(
    @Param('id') id: string,
    @Body('taskId') taskId?: string,
    @Body('authorId') authorId?: string,
  ) {
    return this.knowledgeService.submitDraftReport(id, taskId, authorId);
  }

  @Post('batch-delete')
  batchDeleteReports(@Body() body: { ids: string[] }) {
    if (!body.ids || !Array.isArray(body.ids)) {
      throw new BadRequestException('ids array is required');
    }
    return this.knowledgeService.batchDeleteReports(body.ids);
  }

  @Post(':id/view')
  incrementReportView(@Param('id') id: string) {
    return this.knowledgeService.incrementReportViewCount(id);
  }

  @Post(':id/download')
  incrementReportDownload(@Param('id') id: string) {
    return this.knowledgeService.incrementReportDownloadCount(id);
  }

  @Post('export')
  async exportReports(
    @Body()
    body: {
      ids?: string[];
      query?: {
        reportType?: string;
        status?: KnowledgeStatus;
        commodity?: string;
        region?: string;
        startDate?: string;
        endDate?: string;
      };
    },
    @Res() res: Response,
  ) {
    const query = body.query
      ? {
          ...body.query,
          status: body.query.status as KnowledgeStatus | undefined,
          startDate: body.query.startDate ? new Date(body.query.startDate) : undefined,
          endDate: body.query.endDate ? new Date(body.query.endDate) : undefined,
        }
      : undefined;
    const buffer = await this.aggService.exportReports(body.ids, query);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="reports-export.xlsx"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Post(':id/review')
  reviewReport(
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
