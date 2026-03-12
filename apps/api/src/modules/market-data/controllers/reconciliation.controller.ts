import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import {
    CancelReconciliationJobRequest,
    CreateReconciliationJobRequest,
    CreateReconciliationRollbackDrillRequest,
    EvaluateReconciliationGateRequest,
    ListReconciliationJobsRequest,
    ListReconciliationRollbackDrillsQueryRequest,
    ReconciliationDailyMetricsQueryRequest,
    ReconciliationMetricsSnapshotRequest,
    ReconciliationReadCoverageQueryRequest,
    ReconciliationWindowMetricsQueryRequest,
    ReconciliationSingleWriteGovernanceQueryRequest,
    ReconciliationM1ReadinessQueryRequest,
    ReconciliationM1ReadinessReportQueryRequest,
    CreateReconciliationM1ReadinessReportSnapshotRequest,
    ListReconciliationM1ReadinessReportSnapshotsQueryRequest,
} from '../dto';
import { MarketDataService } from '../market-data.service';
import { MarketDataBaseController } from './market-data-base.controller';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('market-data')
export class ReconciliationController extends MarketDataBaseController {
    constructor(protected readonly marketDataService: MarketDataService) {
        super();
    }

    // ── Jobs ──

    @Post('reconciliation/jobs')
    async createReconciliationJob(@Body() dto: CreateReconciliationJobRequest, @Request() req: AuthRequest) {
        const data = await this.marketDataService.reconciliationService.createReconciliationJob(this.getUserId(req), dto);
        return this.success(req, data);
    }

    @Get('reconciliation/jobs')
    async listReconciliationJobs(@Query() query: ListReconciliationJobsRequest, @Request() req: AuthRequest) {
        const data = await this.marketDataService.reconciliationService.listReconciliationJobs(this.getUserId(req), query);
        return this.success(req, data);
    }

    @Get('reconciliation/jobs/:jobId')
    async getReconciliationJob(@Param('jobId', ParseUUIDPipe) jobId: string, @Request() req: AuthRequest) {
        const data = await this.marketDataService.reconciliationService.getReconciliationJob(this.getUserId(req), jobId);
        return this.success(req, data);
    }

    @Post('reconciliation/jobs/:jobId/retry')
    async retryReconciliationJob(@Param('jobId', ParseUUIDPipe) jobId: string, @Request() req: AuthRequest) {
        const data = await this.marketDataService.reconciliationService.retryReconciliationJob(this.getUserId(req), jobId);
        return this.success(req, data);
    }

    @Post('reconciliation/jobs/:jobId/cancel')
    async cancelReconciliationJob(
        @Param('jobId', ParseUUIDPipe) jobId: string,
        @Body() dto: CancelReconciliationJobRequest,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.reconciliationService.cancelReconciliationJob(
            this.getUserId(req), jobId, dto.reason,
        );
        return this.success(req, data);
    }

    // ── Gate ──

    @Post('reconciliation/gate/evaluate')
    async evaluateReconciliationGate(@Body() dto: EvaluateReconciliationGateRequest, @Request() req: AuthRequest) {
        this.getUserId(req);
        const data = await this.marketDataService.reconciliationService.evaluateReconciliationGate(dto.dataset, {
            filters: dto.filters,
            maxAgeMinutes: dto.maxAgeMinutes,
        });
        return this.success(req, data);
    }

    // ── Metrics ──

    @Get('reconciliation/metrics/window')
    async getReconciliationWindowMetrics(
        @Query() query: ReconciliationWindowMetricsQueryRequest,
        @Request() req: AuthRequest,
    ) {
        this.getUserId(req);
        const data = await this.marketDataService.reconciliationService.getReconciliationWindowMetrics(query.dataset, {
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
        const data = await this.marketDataService.reconciliationService.snapshotReconciliationWindowMetrics({
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
        const data = await this.marketDataService.reconciliationService.getReconciliationDailyMetricsHistory(query.dataset, {
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
        const data = await this.marketDataService.reconciliationService.getReconciliationReadCoverageMetrics({
            days: dto.days,
            workflowVersionIds: dto.workflowVersionIds,
            targetCoverageRate: dto.targetCoverageRate,
        });
        return this.success(req, data);
    }

    @Get('reconciliation/single-write-governance')
    async getSingleWriteGovernanceStatus(
        @Query() query: ReconciliationSingleWriteGovernanceQueryRequest,
        @Request() req: AuthRequest,
    ) {
        this.getUserId(req);
        const data = await this.marketDataService.reconciliationService.getSingleWriteGovernanceStatus({
            days: query.days,
            targetCoverageRate: query.targetCoverageRate,
            datasets: query.datasets,
        });
        return this.success(req, data);
    }

    // ── M1 Readiness ──

    @Get('reconciliation/metrics/m1-readiness')
    async getReconciliationM1Readiness(
        @Query() query: ReconciliationM1ReadinessQueryRequest,
        @Request() req: AuthRequest,
    ) {
        this.getUserId(req);
        const data = await this.marketDataService.reconciliationService.getReconciliationM1Readiness({
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
        const data = await this.marketDataService.reconciliationService.getReconciliationM1ReadinessReport({
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
        const data = await this.marketDataService.reconciliationService.createReconciliationM1ReadinessReportSnapshot(
            this.getUserId(req), dto,
        );
        return this.success(req, data);
    }

    @Get('reconciliation/metrics/m1-readiness/report/snapshots')
    async listReconciliationM1ReadinessReportSnapshots(
        @Query() query: ListReconciliationM1ReadinessReportSnapshotsQueryRequest,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.reconciliationService.listReconciliationM1ReadinessReportSnapshots(
            this.getUserId(req), query,
        );
        return this.success(req, data);
    }

    @Get('reconciliation/metrics/m1-readiness/report/snapshots/:snapshotId')
    async getReconciliationM1ReadinessReportSnapshot(
        @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.reconciliationService.getReconciliationM1ReadinessReportSnapshot(
            this.getUserId(req), snapshotId,
        );
        return this.success(req, data);
    }

    // ── Drills ──

    @Post('reconciliation/drills')
    async createReconciliationRollbackDrill(
        @Body() dto: CreateReconciliationRollbackDrillRequest,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.reconciliationService.createReconciliationRollbackDrill(
            this.getUserId(req), dto,
        );
        return this.success(req, data);
    }

    @Get('reconciliation/drills')
    async listReconciliationRollbackDrills(
        @Query() query: ListReconciliationRollbackDrillsQueryRequest,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.reconciliationService.listReconciliationRollbackDrills(
            this.getUserId(req), query,
        );
        return this.success(req, data);
    }
}
