import { Module } from '@nestjs/common';
import { ExecutionAnalyticsController } from './execution-analytics.controller';
import { ExecutionAnalyticsService } from './execution-analytics.service';

@Module({
  controllers: [ExecutionAnalyticsController],
  providers: [ExecutionAnalyticsService],
  exports: [ExecutionAnalyticsService],
})
export class ExecutionAnalyticsModule {}
