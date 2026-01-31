import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Request,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PriceSubmissionService } from './price-submission.service';
import {
  CreatePriceSubmissionDto,
  QueryPriceSubmissionDto,
  SubmitPriceEntryDto,
  BulkSubmitPriceEntriesDto,
  ReviewPriceDataDto,
  BatchReviewPriceDataDto,
  ReviewPriceSubmissionDto,
} from './dto';

@Controller('price-submissions')
export class PriceSubmissionController {
  constructor(private readonly submissionService: PriceSubmissionService) {}

  @Post()
  @ApiOperation({ summary: '创建填报批次' })
  @ApiResponse({ status: 201, description: '创建成功' })
  create(@Body() dto: CreatePriceSubmissionDto, @Request() req: any) {
    const userId = req.user?.id;
    return this.submissionService.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: '查询填报批次列表' })
  @ApiResponse({ status: 200, description: '批次列表' })
  findAll(@Query() query: QueryPriceSubmissionDto) {
    return this.submissionService.findAll(query);
  }

  @Get('statistics')
  @ApiOperation({ summary: '获取填报统计' })
  @ApiResponse({ status: 200, description: '统计数据' })
  getStatistics(@Request() req: any) {
    const userId = req.user?.id;
    return this.submissionService.getStatistics(userId);
  }

  @Get('pending-reviews')
  @ApiOperation({ summary: '获取待审核列表' })
  @ApiResponse({ status: 200, description: '待审核列表' })
  getPendingReviews(@Query('page') page?: number, @Query('pageSize') pageSize?: number) {
    return this.submissionService.getPendingReviews({ page, pageSize });
  }

  @Get('my')
  @ApiOperation({ summary: '获取我的填报列表' })
  @ApiResponse({ status: 200, description: '我的填报列表' })
  findMy(@Request() req: any, @Query() query: QueryPriceSubmissionDto) {
    const userId = req.user?.id;
    return this.submissionService.findAll({ ...query, submittedById: userId });
  }

  @Get('point/:collectionPointId/history')
  @ApiOperation({ summary: '获取采集点历史价格' })
  @ApiResponse({ status: 200, description: '历史价格数据' })
  getPointHistory(@Param('collectionPointId') collectionPointId: string, @Query('days') days?: number) {
    return this.submissionService.getCollectionPointPriceHistory(collectionPointId, days);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取填报批次详情' })
  @ApiResponse({ status: 200, description: '批次详情' })
  findOne(@Param('id') id: string) {
    return this.submissionService.findOne(id);
  }

  @Post(':id/entries')
  @ApiOperation({ summary: '添加价格条目' })
  @ApiResponse({ status: 201, description: '添加成功' })
  addEntry(@Param('id') id: string, @Body() dto: SubmitPriceEntryDto, @Request() req: any) {
    const userId = req.user?.id;
    return this.submissionService.addEntry(id, dto, userId);
  }

  @Post(':id/entries/bulk')
  @ApiOperation({ summary: '批量添加价格条目' })
  @ApiResponse({ status: 201, description: '批量添加成功' })
  addEntries(@Param('id') id: string, @Body() dto: BulkSubmitPriceEntriesDto, @Request() req: any) {
    const userId = req.user?.id;
    return this.submissionService.addEntries(id, dto, userId);
  }

  @Patch(':id/entries/:entryId')
  @ApiOperation({ summary: '修改价格条目' })
  @ApiResponse({ status: 200, description: '修改成功' })
  updateEntry(@Param('id') id: string, @Param('entryId') entryId: string, @Body() dto: SubmitPriceEntryDto) {
    return this.submissionService.updateEntry(id, entryId, dto);
  }

  @Delete(':id/entries/:entryId')
  @ApiOperation({ summary: '删除价格条目' })
  @ApiResponse({ status: 200, description: '删除成功' })
  removeEntry(@Param('id') id: string, @Param('entryId') entryId: string) {
    return this.submissionService.removeEntry(id, entryId);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: '提交批次审核' })
  @ApiResponse({ status: 200, description: '提交成功' })
  submit(@Param('id') id: string) {
    return this.submissionService.submit(id);
  }

  @Post(':id/copy-yesterday')
  @ApiOperation({ summary: '复制昨日数据' })
  @ApiResponse({ status: 200, description: '复制成功' })
  copyYesterday(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.id;
    return this.submissionService.copyYesterdayData(id, userId);
  }

  @Post(':id/review')
  @ApiOperation({ summary: '审核整个填报批次' })
  @ApiResponse({ status: 200, description: '审核成功' })
  reviewSubmission(@Param('id') id: string, @Body() dto: ReviewPriceSubmissionDto, @Request() req: any) {
    const userId = req.user?.id;
    return this.submissionService.reviewSubmission(id, dto, userId);
  }
}

@ApiTags('价格数据审核')
@Controller('price-data')
export class PriceDataReviewController {
  constructor(private readonly submissionService: PriceSubmissionService) {}

  @Post(':id/review')
  @ApiOperation({ summary: '审核单条价格数据' })
  @ApiResponse({ status: 200, description: '审核成功' })
  reviewPriceData(@Param('id') id: string, @Body() dto: ReviewPriceDataDto, @Request() req: any) {
    const userId = req.user?.id;
    return this.submissionService.reviewPriceData(id, dto, userId);
  }

  @Post('batch-review')
  @ApiOperation({ summary: '批量审核价格数据' })
  @ApiResponse({ status: 200, description: '批量审核成功' })
  batchReviewPriceData(@Body() dto: BatchReviewPriceDataDto, @Request() req: any) {
    const userId = req.user?.id;
    return this.submissionService.batchReviewPriceData(dto, userId);
  }
}
