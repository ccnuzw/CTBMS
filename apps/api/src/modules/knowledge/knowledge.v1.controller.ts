import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { KnowledgeAggregationService } from './knowledge-aggregation.service';
import { KnowledgeSearchService } from './knowledge-search.service';
import { KnowledgeSyncService } from './knowledge-sync.service';
import { KnowledgeType } from '@prisma/client';

@Controller('v1/knowledge')
export class KnowledgeV1Controller {
  constructor(
    private readonly searchService: KnowledgeSearchService,
    private readonly aggService: KnowledgeAggregationService,
    private readonly syncService: KnowledgeSyncService,
  ) {}

  @Get('analytics/trend')
  getTrend(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.aggService.getTrend(days);
  }

  @Get('analytics/weekly-overview')
  getWeeklyOverview(@Query('periodKey') periodKey?: string) {
    return this.aggService.getWeeklyOverview(periodKey);
  }

  @Get('analytics/topic-evolution')
  getTopicEvolution(
    @Query('commodity') commodity?: string,
    @Query('weeks', new DefaultValuePipe(8), ParseIntPipe) weeks?: number,
  ) {
    return this.aggService.getTopicEvolution(commodity, weeks);
  }

  @Get('search')
  search(
    @Query('keyword') keyword?: string,
    @Query('type') type?: KnowledgeType,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize?: number,
  ) {
    return this.searchService.findAll({ keyword, type, page, pageSize });
  }

  @Post('admin/backfill')
  backfill(@Body('limit', new DefaultValuePipe(500), ParseIntPipe) limit: number) {
    return this.syncService.backfillFromLegacy(limit);
  }

  @Get('admin/consistency')
  consistency(@Query('sampleSize', new DefaultValuePipe(50), ParseIntPipe) sampleSize: number) {
    return this.syncService.checkLegacyConsistency(sampleSize);
  }

  @Post('admin/weekly-rollup')
  weeklyRollup(
    @Body('targetDate') targetDate?: string,
    @Body('authorId') authorId?: string,
    @Body('triggerAnalysis', new DefaultValuePipe(true), ParseBoolPipe) triggerAnalysis?: boolean,
  ) {
    return this.searchService.generateWeeklyRollup({
      targetDate: targetDate ? new Date(targetDate) : undefined,
      authorId,
      triggerAnalysis,
    });
  }

  @Get('legacy/:source/:id')
  resolveLegacy(@Param('source') source: 'intel' | 'report', @Param('id') id: string) {
    return this.syncService.resolveLegacy(source, id);
  }

  @Get('graph')
  getGraphData(
    @Query('intelId') intelId?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
  ) {
    return this.searchService.getGraphData({ intelId, limit });
  }

  @Get('attachments/:id/download')
  async downloadAttachment(
    @Param('id') id: string,
    @Query('inline') inline: string,
    @Res() res: Response,
  ) {
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

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(attachment.filename)}"`,
    );
    return res.sendFile(attachment.storagePath);
  }
}
