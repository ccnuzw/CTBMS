import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  NotFoundException,
} from '@nestjs/common';
import {
  KnowledgePeriodType,
  KnowledgeRelationType,
  KnowledgeStatus,
  KnowledgeType,
} from '@prisma/client';
import { KnowledgeService, CreateKnowledgeInput, UpdateKnowledgeInput } from './knowledge.service';
import { KnowledgeSearchService } from './knowledge-search.service';

@Controller('v1/knowledge-items')
export class KnowledgeItemsV1Controller {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly searchService: KnowledgeSearchService,
  ) {}

  @Get()
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

  @Get('pending-review')
  getPendingReviewList(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize?: number,
  ) {
    return this.knowledgeService.getPendingReviewList(page, pageSize);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const result = await this.searchService.findOne(id);
    if (!result) {
      throw new NotFoundException('Knowledge item not found');
    }
    return result;
  }

  @Post()
  create(@Body() body: CreateKnowledgeInput) {
    return this.knowledgeService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateKnowledgeInput) {
    return this.knowledgeService.update(id, body);
  }

  @Patch(':id/report')
  updateReport(
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      contentPlain?: string;
      contentRich?: string;
      commodities?: string[];
      region?: string[];
      authorId: string;
    },
  ) {
    if (!body.authorId) {
      throw new BadRequestException('authorId is required');
    }
    return this.knowledgeService.updateReport(id, body);
  }

  @Post('actions/submit-report')
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
      throw new BadRequestException('type, title, contentPlain, authorId are required');
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

  @Post(':id/actions/reanalyze')
  reanalyze(
    @Param('id') id: string,
    @Body('triggerDeepAnalysis', new DefaultValuePipe(true), ParseBoolPipe)
    triggerDeepAnalysis: boolean,
  ) {
    return this.knowledgeService.reanalyze(id, triggerDeepAnalysis);
  }

  @Post(':id/actions/review')
  review(
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

  @Get(':id/relations')
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
}
