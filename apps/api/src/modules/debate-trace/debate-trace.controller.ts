import { Controller, Get, Param, Query } from '@nestjs/common';
import { DebateTraceService } from './debate-trace.service';

@Controller('debate-traces')
export class DebateTraceController {
    constructor(private readonly debateTraceService: DebateTraceService) { }

    /**
     * GET /debate-traces/:executionId
     * 查询指定执行实例的辩论轨迹
     */
    @Get(':executionId')
    async findByExecution(
        @Param('executionId') executionId: string,
        @Query('roundNumber') roundNumber?: string,
        @Query('participantCode') participantCode?: string,
        @Query('isJudgement') isJudgement?: string,
    ) {
        return this.debateTraceService.findByExecution({
            workflowExecutionId: executionId,
            roundNumber: roundNumber ? parseInt(roundNumber, 10) : undefined,
            participantCode: participantCode || undefined,
            isJudgement: isJudgement === 'true' ? true : isJudgement === 'false' ? false : undefined,
        });
    }

    /**
     * GET /debate-traces/:executionId/timeline
     * 组装时间线视图
     */
    @Get(':executionId/timeline')
    async getTimeline(@Param('executionId') executionId: string) {
        return this.debateTraceService.getDebateTimeline(executionId);
    }
}
