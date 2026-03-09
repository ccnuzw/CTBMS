import {
  Controller,
  Get,
  Query,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { ExecutionAnalyticsService } from './execution-analytics.service';
import { DataQualityService, type DataQualityQueryDto } from './data-quality.service';
import { ExecutionAnalyticsQueryRequest } from './dto';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('execution-analytics')
export class ExecutionAnalyticsController {
  constructor(
    private readonly service: ExecutionAnalyticsService,
    private readonly qualityService: DataQualityService,
  ) { }

  private getUserId(req: AuthRequest): string {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('User not authenticated');
    return userId;
  }

  @Get()
  getAnalytics(@Request() req: AuthRequest, @Query() query: ExecutionAnalyticsQueryRequest) {
    return this.service.getAnalytics(this.getUserId(req), query);
  }

  @Get('data-quality')
  getDataQuality(@Query() query: DataQualityQueryDto) {
    return this.qualityService.getQualityAggregation(query);
  }
}
