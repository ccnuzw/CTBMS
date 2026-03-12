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
    CreateReconciliationCutoverAutopilotRequest,
    CreateReconciliationCutoverDecisionRequest,
    ExecuteReconciliationRollbackRequest,
    ListReconciliationCutoverDecisionsQueryRequest,
    ListReconciliationCutoverCompensationBatchesQueryRequest,
    ListReconciliationCutoverExecutionsQueryRequest,
    ReconciliationCutoverExecutionOverviewQueryRequest,
    ReconciliationCutoverCompensationBatchReportQueryRequest,
    ReconciliationCutoverRuntimeStatusQueryRequest,
    RetryReconciliationCutoverCompensationRequest,
    RetryReconciliationCutoverCompensationBatchRequest,
} from '../dto';
import { MarketDataService } from '../market-data.service';
import { MarketDataBaseController } from './market-data-base.controller';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('market-data')
export class ReconciliationCutoverController extends MarketDataBaseController {
    constructor(protected readonly marketDataService: MarketDataService) {
        super();
    }

    // ── Decisions ──

    @Post('reconciliation/cutover/decisions')
    async createReconciliationCutoverDecision(
        @Body() dto: CreateReconciliationCutoverDecisionRequest,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.cutoverService.createReconciliationCutoverDecision(
            this.getUserId(req), dto,
        );
        return this.success(req, data);
    }

    @Get('reconciliation/cutover/decisions')
    async listReconciliationCutoverDecisions(
        @Query() query: ListReconciliationCutoverDecisionsQueryRequest,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.cutoverService.listReconciliationCutoverDecisions(
            this.getUserId(req), query,
        );
        return this.success(req, data);
    }

    @Get('reconciliation/cutover/decisions/:decisionId')
    async getReconciliationCutoverDecision(
        @Param('decisionId', ParseUUIDPipe) decisionId: string,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.cutoverService.getReconciliationCutoverDecision(
            this.getUserId(req), decisionId,
        );
        return this.success(req, data);
    }

    // ── Execute / Autopilot / Rollback ──

    @Post('reconciliation/cutover/execute')
    async executeReconciliationCutover(
        @Body() dto: CreateReconciliationCutoverDecisionRequest,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.cutoverService.executeReconciliationCutover(
            this.getUserId(req), dto,
        );
        return this.success(req, data);
    }

    @Post('reconciliation/cutover/autopilot')
    async executeReconciliationCutoverAutopilot(
        @Body() dto: CreateReconciliationCutoverAutopilotRequest,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.cutoverService.executeReconciliationCutoverAutopilot(
            this.getUserId(req), dto,
        );
        return this.success(req, data);
    }

    @Post('reconciliation/cutover/rollback')
    async executeReconciliationRollback(
        @Body() dto: ExecuteReconciliationRollbackRequest,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.cutoverService.executeReconciliationRollback(
            this.getUserId(req), dto,
        );
        return this.success(req, data);
    }

    // ── Runtime Status ──

    @Get('reconciliation/cutover/runtime-status')
    async getReconciliationCutoverRuntimeStatus(
        @Query() query: ReconciliationCutoverRuntimeStatusQueryRequest,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.cutoverService.getReconciliationCutoverRuntimeStatus(
            this.getUserId(req), query,
        );
        return this.success(req, data);
    }

    // ── Executions ──

    @Get('reconciliation/cutover/executions')
    async listReconciliationCutoverExecutions(
        @Query() query: ListReconciliationCutoverExecutionsQueryRequest,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.cutoverService.listReconciliationCutoverExecutions(
            this.getUserId(req), query,
        );
        return this.success(req, data);
    }

    @Get('reconciliation/cutover/executions/overview')
    async getReconciliationCutoverExecutionOverview(
        @Query() query: ReconciliationCutoverExecutionOverviewQueryRequest,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.cutoverService.getReconciliationCutoverExecutionOverview(
            this.getUserId(req), query,
        );
        return this.success(req, data);
    }

    @Get('reconciliation/cutover/executions/:executionId')
    async getReconciliationCutoverExecution(
        @Param('executionId', ParseUUIDPipe) executionId: string,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.cutoverService.getReconciliationCutoverExecution(
            this.getUserId(req), executionId,
        );
        return this.success(req, data);
    }

    // ── Compensation ──

    @Get('reconciliation/cutover/executions/compensation-batches')
    async listReconciliationCutoverCompensationBatches(
        @Query() query: ListReconciliationCutoverCompensationBatchesQueryRequest,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.cutoverService.listReconciliationCutoverCompensationBatches(
            this.getUserId(req), query,
        );
        return this.success(req, data);
    }

    @Get('reconciliation/cutover/executions/compensation-batches/:batchId')
    async getReconciliationCutoverCompensationBatch(
        @Param('batchId', ParseUUIDPipe) batchId: string,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.cutoverService.getReconciliationCutoverCompensationBatch(
            this.getUserId(req), batchId,
        );
        return this.success(req, data);
    }

    @Get('reconciliation/cutover/executions/compensation-batches/:batchId/report')
    async getReconciliationCutoverCompensationBatchReport(
        @Param('batchId', ParseUUIDPipe) batchId: string,
        @Query() query: ReconciliationCutoverCompensationBatchReportQueryRequest,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.cutoverService.getReconciliationCutoverCompensationBatchReport(
            this.getUserId(req), batchId, query,
        );
        return this.success(req, data);
    }

    @Post('reconciliation/cutover/executions/:executionId/compensate')
    async retryReconciliationCutoverExecutionCompensation(
        @Param('executionId', ParseUUIDPipe) executionId: string,
        @Body() dto: RetryReconciliationCutoverCompensationRequest,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.cutoverService.retryReconciliationCutoverExecutionCompensation(
            this.getUserId(req), executionId, dto,
        );
        return this.success(req, data);
    }

    @Post('reconciliation/cutover/executions/compensate-batch')
    async retryReconciliationCutoverExecutionCompensationBatch(
        @Body() dto: RetryReconciliationCutoverCompensationBatchRequest,
        @Request() req: AuthRequest,
    ) {
        const data = await this.marketDataService.cutoverService.retryReconciliationCutoverExecutionCompensationBatch(
            this.getUserId(req), dto,
        );
        return this.success(req, data);
    }
}
