import { Module } from '@nestjs/common';
import { ExecutionAnalyticsController } from './execution-analytics.controller';
import { ExecutionAnalyticsService } from './execution-analytics.service';
import { DataQualityService } from './data-quality.service';

@Module({
  controllers: [ExecutionAnalyticsController],
  providers: [ExecutionAnalyticsService, DataQualityService],
  exports: [ExecutionAnalyticsService, DataQualityService],
})
export class ExecutionAnalyticsModule { }
