import { Module } from '@nestjs/common';
import { WorkflowExecutionModule } from '../workflow-execution';

// Re-import from existing modules
import { ExecutionAnalyticsController } from '../execution-analytics/execution-analytics.controller';
import { ExecutionAnalyticsService } from '../execution-analytics/execution-analytics.service';
import { DataQualityService } from '../execution-analytics/data-quality.service';
import { WorkflowReplayController } from '../workflow-replay/workflow-replay.controller';

/**
 * ExecutionInsightModule — 执行洞察统一模块
 *
 * 合并原有 2 个模块：
 *   - ExecutionAnalyticsModule → 执行统计 + 数据质量
 *   - WorkflowReplayModule    → 回放评估
 *
 * debate-trace 保留独立（被 workflow-execution 耦合引用）。
 */
@Module({
    imports: [WorkflowExecutionModule],
    controllers: [ExecutionAnalyticsController, WorkflowReplayController],
    providers: [ExecutionAnalyticsService, DataQualityService],
    exports: [ExecutionAnalyticsService, DataQualityService],
})
export class ExecutionInsightModule { }
