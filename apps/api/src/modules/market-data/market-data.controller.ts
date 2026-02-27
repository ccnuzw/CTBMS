import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { randomUUID } from 'node:crypto';
import {
  CancelReconciliationJobRequest,
  CreateReconciliationCutoverAutopilotRequest,
  CreateReconciliationCutoverDecisionRequest,
  CreateReconciliationM1ReadinessReportSnapshotRequest,
  CreateReconciliationRollbackDrillRequest,
  CreateReconciliationJobRequest,
  ExecuteReconciliationRollbackRequest,
  EvaluateReconciliationGateRequest,
  ListReconciliationCutoverDecisionsQueryRequest,
  ListReconciliationCutoverExecutionsQueryRequest,
  ListReconciliationJobsRequest,
  ListReconciliationM1ReadinessReportSnapshotsQueryRequest,
  ReconciliationDailyMetricsQueryRequest,
  ReconciliationMetricsSnapshotRequest,
  ReconciliationReadCoverageQueryRequest,
  ReconciliationCutoverExecutionOverviewQueryRequest,
  ReconciliationCutoverRuntimeStatusQueryRequest,
  ListReconciliationRollbackDrillsQueryRequest,
  ReconciliationM1ReadinessQueryRequest,
  ReconciliationM1ReadinessReportQueryRequest,
  RetryReconciliationCutoverCompensationRequest,
  ReconciliationWindowMetricsQueryRequest,
  MarketDataAggregateRequest,
  MarketDataQueryRequest,
  MarketDataLineageQueryRequest,
  StandardizationPreviewRequest,
} from './dto';
import { MarketDataService } from './market-data.service';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('market-data')
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @Post('aggregate')
  async aggregateMarketData(@Body() dto: MarketDataAggregateRequest, @Request() req: AuthRequest) {
    this.getUserId(req);
    const from = dto.timeRange?.from ? new Date(dto.timeRange.from) : undefined;
    const to = dto.timeRange?.to ? new Date(dto.timeRange.to) : undefined;

    const result = await this.marketDataService.aggregateStandardizedData(
      dto.dataset,
      {
        from,
        to,
        filters: dto.dimensions,
        limit: dto.limit,
      },
      dto.groupBy,
      dto.metrics,
    );

    return this.success(req, {
      rows: result.rows,
      meta: result.meta,
    });
  }

  @Post('query')
  async queryMarketData(@Body() dto: MarketDataQueryRequest, @Request() req: AuthRequest) {
    this.getUserId(req);
    const from = dto.timeRange?.from ? new Date(dto.timeRange.from) : undefined;
    const to = dto.timeRange?.to ? new Date(dto.timeRange.to) : undefined;

    const result = await this.marketDataService.queryStandardizedData(dto.dataset, {
      from,
      to,
      filters: dto.dimensions,
      limit: dto.limit,
    });

    return this.success(req, {
      rows: result.rows,
      meta: result.meta,
    });
  }

  @Post('standardization/preview')
  async previewStandardization(
    @Body() dto: StandardizationPreviewRequest,
    @Request() req: AuthRequest,
  ) {
    this.getUserId(req);
    const data = await this.marketDataService.previewStandardization(dto);
    return this.success(req, data);
  }

  @Get('lineage')
  async getLineage(@Query() query: MarketDataLineageQueryRequest, @Request() req: AuthRequest) {
    this.getUserId(req);
    const data = await this.marketDataService.getLineage(query.dataset, query.recordId);
    return this.success(req, data);
  }

  @Post('reconciliation/jobs')
  async createReconciliationJob(
    @Body() dto: CreateReconciliationJobRequest,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.createReconciliationJob(this.getUserId(req), dto);
    return this.success(req, data);
  }

  @Get('reconciliation/jobs')
  async listReconciliationJobs(
    @Query() query: ListReconciliationJobsRequest,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.listReconciliationJobs(this.getUserId(req), query);
    return this.success(req, data);
  }

  @Get('reconciliation/jobs/:jobId')
  async getReconciliationJob(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.getReconciliationJob(this.getUserId(req), jobId);
    return this.success(req, data);
  }

  @Post('reconciliation/jobs/:jobId/retry')
  async retryReconciliationJob(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.retryReconciliationJob(this.getUserId(req), jobId);
    return this.success(req, data);
  }

  @Post('reconciliation/jobs/:jobId/cancel')
  async cancelReconciliationJob(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: CancelReconciliationJobRequest,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.cancelReconciliationJob(
      this.getUserId(req),
      jobId,
      dto.reason,
    );
    return this.success(req, data);
  }

  @Post('reconciliation/gate/evaluate')
  async evaluateReconciliationGate(
    @Body() dto: EvaluateReconciliationGateRequest,
    @Request() req: AuthRequest,
  ) {
    this.getUserId(req);
    const data = await this.marketDataService.evaluateReconciliationGate(dto.dataset, {
      filters: dto.filters,
      maxAgeMinutes: dto.maxAgeMinutes,
    });
    return this.success(req, data);
  }

  @Get('reconciliation/metrics/window')
  async getReconciliationWindowMetrics(
    @Query() query: ReconciliationWindowMetricsQueryRequest,
    @Request() req: AuthRequest,
  ) {
    this.getUserId(req);
    const data = await this.marketDataService.getReconciliationWindowMetrics(query.dataset, {
      days: query.days,
    });
    return this.success(req, data);
  }

  @Post('reconciliation/metrics/snapshot')
  async snapshotReconciliationMetrics(
    @Body() dto: ReconciliationMetricsSnapshotRequest,
    @Request() req: AuthRequest,
  ) {
    this.getUserId(req);
    const data = await this.marketDataService.snapshotReconciliationWindowMetrics({
      windowDays: dto.windowDays,
      datasets: dto.datasets,
    });
    return this.success(req, data);
  }

  @Get('reconciliation/metrics/daily')
  async getReconciliationDailyMetrics(
    @Query() query: ReconciliationDailyMetricsQueryRequest,
    @Request() req: AuthRequest,
  ) {
    this.getUserId(req);
    const data = await this.marketDataService.getReconciliationDailyMetricsHistory(query.dataset, {
      windowDays: query.windowDays,
      days: query.days,
    });
    return this.success(req, data);
  }

  @Post('reconciliation/metrics/read-coverage')
  async getReconciliationReadCoverage(
    @Body() dto: ReconciliationReadCoverageQueryRequest,
    @Request() req: AuthRequest,
  ) {
    this.getUserId(req);
    const data = await this.marketDataService.getReconciliationReadCoverageMetrics({
      days: dto.days,
      workflowVersionIds: dto.workflowVersionIds,
      targetCoverageRate: dto.targetCoverageRate,
    });
    return this.success(req, data);
  }

  @Get('reconciliation/metrics/m1-readiness')
  async getReconciliationM1Readiness(
    @Query() query: ReconciliationM1ReadinessQueryRequest,
    @Request() req: AuthRequest,
  ) {
    this.getUserId(req);
    const data = await this.marketDataService.getReconciliationM1Readiness({
      windowDays: query.windowDays,
      targetCoverageRate: query.targetCoverageRate,
      datasets: query.datasets,
    });
    return this.success(req, data);
  }

  @Get('reconciliation/metrics/m1-readiness/report')
  async getReconciliationM1ReadinessReport(
    @Query() query: ReconciliationM1ReadinessReportQueryRequest,
    @Request() req: AuthRequest,
  ) {
    this.getUserId(req);
    const data = await this.marketDataService.getReconciliationM1ReadinessReport({
      format: query.format,
      windowDays: query.windowDays,
      targetCoverageRate: query.targetCoverageRate,
      datasets: query.datasets,
    });
    return this.success(req, data);
  }

  @Post('reconciliation/metrics/m1-readiness/report/snapshots')
  async createReconciliationM1ReadinessReportSnapshot(
    @Body() dto: CreateReconciliationM1ReadinessReportSnapshotRequest,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.createReconciliationM1ReadinessReportSnapshot(
      this.getUserId(req),
      dto,
    );
    return this.success(req, data);
  }

  @Get('reconciliation/metrics/m1-readiness/report/snapshots')
  async listReconciliationM1ReadinessReportSnapshots(
    @Query() query: ListReconciliationM1ReadinessReportSnapshotsQueryRequest,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.listReconciliationM1ReadinessReportSnapshots(
      this.getUserId(req),
      query,
    );
    return this.success(req, data);
  }

  @Get('reconciliation/metrics/m1-readiness/report/snapshots/:snapshotId')
  async getReconciliationM1ReadinessReportSnapshot(
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.getReconciliationM1ReadinessReportSnapshot(
      this.getUserId(req),
      snapshotId,
    );
    return this.success(req, data);
  }

  @Post('reconciliation/cutover/decisions')
  async createReconciliationCutoverDecision(
    @Body() dto: CreateReconciliationCutoverDecisionRequest,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.createReconciliationCutoverDecision(
      this.getUserId(req),
      dto,
    );
    return this.success(req, data);
  }

  @Post('reconciliation/cutover/execute')
  async executeReconciliationCutover(
    @Body() dto: CreateReconciliationCutoverDecisionRequest,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.executeReconciliationCutover(
      this.getUserId(req),
      dto,
    );
    return this.success(req, data);
  }

  @Post('reconciliation/cutover/autopilot')
  async executeReconciliationCutoverAutopilot(
    @Body() dto: CreateReconciliationCutoverAutopilotRequest,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.executeReconciliationCutoverAutopilot(
      this.getUserId(req),
      dto,
    );
    return this.success(req, data);
  }

  @Post('reconciliation/cutover/rollback')
  async executeReconciliationRollback(
    @Body() dto: ExecuteReconciliationRollbackRequest,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.executeReconciliationRollback(
      this.getUserId(req),
      dto,
    );
    return this.success(req, data);
  }

  @Get('reconciliation/cutover/runtime-status')
  async getReconciliationCutoverRuntimeStatus(
    @Query() query: ReconciliationCutoverRuntimeStatusQueryRequest,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.getReconciliationCutoverRuntimeStatus(
      this.getUserId(req),
      query,
    );
    return this.success(req, data);
  }

  @Get('reconciliation/cutover/executions')
  async listReconciliationCutoverExecutions(
    @Query() query: ListReconciliationCutoverExecutionsQueryRequest,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.listReconciliationCutoverExecutions(
      this.getUserId(req),
      query,
    );
    return this.success(req, data);
  }

  @Get('reconciliation/cutover/executions/overview')
  async getReconciliationCutoverExecutionOverview(
    @Query() query: ReconciliationCutoverExecutionOverviewQueryRequest,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.getReconciliationCutoverExecutionOverview(
      this.getUserId(req),
      query,
    );
    return this.success(req, data);
  }

  @Get('reconciliation/cutover/executions/:executionId')
  async getReconciliationCutoverExecution(
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.getReconciliationCutoverExecution(
      this.getUserId(req),
      executionId,
    );
    return this.success(req, data);
  }

  @Post('reconciliation/cutover/executions/:executionId/compensate')
  async retryReconciliationCutoverExecutionCompensation(
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @Body() dto: RetryReconciliationCutoverCompensationRequest,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.retryReconciliationCutoverExecutionCompensation(
      this.getUserId(req),
      executionId,
      dto,
    );
    return this.success(req, data);
  }

  @Get('reconciliation/cutover/decisions')
  async listReconciliationCutoverDecisions(
    @Query() query: ListReconciliationCutoverDecisionsQueryRequest,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.listReconciliationCutoverDecisions(
      this.getUserId(req),
      query,
    );
    return this.success(req, data);
  }

  @Get('reconciliation/cutover/decisions/:decisionId')
  async getReconciliationCutoverDecision(
    @Param('decisionId', ParseUUIDPipe) decisionId: string,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.getReconciliationCutoverDecision(
      this.getUserId(req),
      decisionId,
    );
    return this.success(req, data);
  }

  @Post('reconciliation/drills')
  async createReconciliationRollbackDrill(
    @Body() dto: CreateReconciliationRollbackDrillRequest,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.createReconciliationRollbackDrill(
      this.getUserId(req),
      dto,
    );
    return this.success(req, data);
  }

  @Get('reconciliation/drills')
  async listReconciliationRollbackDrills(
    @Query() query: ListReconciliationRollbackDrillsQueryRequest,
    @Request() req: AuthRequest,
  ) {
    const data = await this.marketDataService.listReconciliationRollbackDrills(
      this.getUserId(req),
      query,
    );
    return this.success(req, data);
  }

  private getUserId(req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return userId;
  }

  private success<T>(req: AuthRequest, data: T) {
    return {
      success: true as const,
      data,
      traceId: this.getTraceId(req),
      ts: new Date().toISOString(),
    };
  }

  private getTraceId(req: AuthRequest): string {
    const traceHeader = req.headers?.['x-trace-id'];
    const traceId = Array.isArray(traceHeader) ? traceHeader[0] : traceHeader;
    if (typeof traceId === 'string' && traceId.trim().length > 0) {
      return traceId.trim();
    }
    return `tr_${randomUUID()}`;
  }
}
