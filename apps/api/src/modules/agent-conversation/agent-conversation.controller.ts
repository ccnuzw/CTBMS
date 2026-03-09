import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { AgentConversationService } from './agent-conversation.service';
import {
  ConfirmConversationPlanRequest,
  ConversationObservabilitySummaryQueryRequest,
  ConversationResultDiffTimelineQueryRequest,
  ConversationSessionQueryRequest,
  CreateConversationBacktestRequest,
  CreateSkillDraftRequest,
  CreateConversationSubscriptionRequest,
  CreateConversationSessionRequest,
  CreateConversationTurnRequest,
  DeliverConversationRequest,
  DeliverConversationEmailRequest,
  ResolveConversationScheduleRequest,
  ExportConversationResultRequest,
  ReuseConversationAssetRequest,
  UpdateConversationSubscriptionRequest,
} from './dto';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('agent-conversations/sessions')
export class AgentConversationController {
  constructor(private readonly service: AgentConversationService) { }

  private getUserId(req: AuthRequest): string {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return userId;
  }

  @Get('copilot-version')
  resolveCopilotVersion(@Request() req: AuthRequest) {
    return this.service.subscriptionService.resolveCopilotVersion(this.getUserId(req));
  }

  @Post()
  createSession(@Request() req: AuthRequest, @Body() dto: CreateConversationSessionRequest) {
    return this.service.createSession(this.getUserId(req), dto);
  }

  @Get()
  listSessions(@Request() req: AuthRequest, @Query() query: ConversationSessionQueryRequest) {
    return this.service.listSessions(this.getUserId(req), query);
  }

  @Get('observability/summary')
  getObservabilitySummary(
    @Request() req: AuthRequest,
    @Query() query: ConversationObservabilitySummaryQueryRequest,
  ) {
    return this.service.getObservabilitySummary(this.getUserId(req), query);
  }

  @Get(':sessionId')
  async getSessionDetail(@Request() req: AuthRequest, @Param('sessionId') sessionId: string) {
    const result = await this.service.getSessionDetail(this.getUserId(req), sessionId);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Delete(':sessionId')
  async deleteSession(@Request() req: AuthRequest, @Param('sessionId') sessionId: string) {
    const result = await this.service.deleteSession(this.getUserId(req), sessionId);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return { success: true };
  }

  @Post(':sessionId/turns')
  async createTurn(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateConversationTurnRequest,
  ) {
    const result = await this.service.createTurn(this.getUserId(req), sessionId, dto);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Post(':sessionId/plan/confirm')
  async confirmPlan(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Body() dto: ConfirmConversationPlanRequest,
  ) {
    const result = await this.service.confirmPlan(this.getUserId(req), sessionId, dto);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Get(':sessionId/result')
  async getResult(@Request() req: AuthRequest, @Param('sessionId') sessionId: string) {
    const result = await this.service.resultService.getResult(this.getUserId(req), sessionId);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_RESULT_NOT_FOUND',
        message: '会话不存在、无权限访问或执行实例不可见',
      });
    }
    return result;
  }

  @Get(':sessionId/evidence')
  async listResultEvidence(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Query('executionId') executionId?: string,
    @Query('limit') limit?: string,
    @Query('freshness') freshness?: string,
    @Query('quality') quality?: string,
    @Query('source') source?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    const result = await this.service.resultService.listResultEvidence(this.getUserId(req), sessionId, {
      executionId,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      freshness,
      quality,
      source,
    });
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_RESULT_NOT_FOUND',
        message: '会话不存在、无权限访问或执行实例不可见',
      });
    }
    return result;
  }

  @Get(':sessionId/result-diff')
  async getResultDiff(@Request() req: AuthRequest, @Param('sessionId') sessionId: string) {
    const result = await this.service.resultService.getResultDiff(this.getUserId(req), sessionId);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Get(':sessionId/result-diff/timeline')
  async getResultDiffTimeline(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Query() query: ConversationResultDiffTimelineQueryRequest,
  ) {
    const result = await this.service.resultService.getResultDiffTimeline(this.getUserId(req), sessionId, query);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Post(':sessionId/export')
  async exportResult(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Body() dto: ExportConversationResultRequest,
  ) {
    const result = await this.service.exportResult(this.getUserId(req), sessionId, dto);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Post(':sessionId/deliver/email')
  async deliverEmail(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Body() dto: DeliverConversationEmailRequest,
  ) {
    const result = await this.service.subscriptionService.deliverEmail(this.getUserId(req), sessionId, dto);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Post(':sessionId/deliver')
  async deliver(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Body() dto: DeliverConversationRequest,
  ) {
    const result = await this.service.subscriptionService.deliver(this.getUserId(req), sessionId, dto);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Get(':sessionId/subscriptions')
  async listSubscriptions(@Request() req: AuthRequest, @Param('sessionId') sessionId: string) {
    const result = await this.service.subscriptionService.listSubscriptions(this.getUserId(req), sessionId);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Post(':sessionId/subscriptions')
  async createSubscription(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateConversationSubscriptionRequest,
  ) {
    const result = await this.service.subscriptionService.createSubscription(this.getUserId(req), sessionId, dto);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Post(':sessionId/subscriptions/:subscriptionId/run')
  async runSubscription(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Param('subscriptionId') subscriptionId: string,
  ) {
    const result = await this.service.subscriptionService.runSubscriptionNow(
      this.getUserId(req),
      sessionId,
      subscriptionId,
    );
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SUB_NOT_FOUND',
        message: '订阅不存在或无权限访问',
      });
    }
    return result;
  }

  @Post(':sessionId/schedules/resolve')
  async resolveSchedule(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Body() dto: ResolveConversationScheduleRequest,
  ) {
    const result = await this.service.subscriptionService.resolveScheduleCommand(this.getUserId(req), sessionId, dto);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Patch(':sessionId/subscriptions/:subscriptionId')
  async updateSubscription(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Param('subscriptionId') subscriptionId: string,
    @Body() dto: UpdateConversationSubscriptionRequest,
  ) {
    const result = await this.service.subscriptionService.updateSubscription(
      this.getUserId(req),
      sessionId,
      subscriptionId,
      dto,
    );
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SUB_NOT_FOUND',
        message: '订阅不存在或无权限访问',
      });
    }
    return result;
  }

  @Post(':sessionId/backtests')
  async createBacktest(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateConversationBacktestRequest,
  ) {
    const result = await this.service.createBacktest(this.getUserId(req), sessionId, dto);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Get(':sessionId/backtests')
  async listBacktests(@Request() req: AuthRequest, @Param('sessionId') sessionId: string) {
    return this.service.listBacktests(this.getUserId(req), sessionId);
  }

  @Get(':sessionId/backtests/compare')
  async compareBacktests(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Query('jobA') jobA: string,
    @Query('jobB') jobB: string,
  ) {
    return this.service.compareBacktests(this.getUserId(req), sessionId, jobA, jobB);
  }

  @Get(':sessionId/backtests/:backtestJobId')
  async getBacktest(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Param('backtestJobId') backtestJobId: string,
  ) {
    const result = await this.service.getBacktest(this.getUserId(req), sessionId, backtestJobId);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_BACKTEST_NOT_FOUND',
        message: '回测任务不存在或无权限访问',
      });
    }
    return result;
  }

  @Get(':sessionId/conflicts')
  async getConflicts(@Request() req: AuthRequest, @Param('sessionId') sessionId: string) {
    const result = await this.service.getConflicts(this.getUserId(req), sessionId);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Post(':sessionId/capability-gap/skill-draft')
  async createSkillDraft(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateSkillDraftRequest,
  ) {
    const result = await this.service.createSkillDraft(this.getUserId(req), sessionId, dto);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Get(':sessionId/assets')
  async listAssets(@Request() req: AuthRequest, @Param('sessionId') sessionId: string) {
    const result = await this.service.listAssets(this.getUserId(req), sessionId);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Get(':sessionId/capability-routing-logs')
  async listCapabilityRoutingLogs(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Query('routeType') routeType?: string,
    @Query('limit') limit?: string,
    @Query('window') window?: '1h' | '24h' | '7d',
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    const result = await this.service.capabilityService.listCapabilityRoutingLogs(this.getUserId(req), sessionId, {
      routeType,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      window,
    });
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Get(':sessionId/capability-routing-summary')
  async getCapabilityRoutingSummary(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Query('limit') limit?: string,
    @Query('window') window?: '1h' | '24h' | '7d',
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    const result = await this.service.capabilityService.getCapabilityRoutingSummary(this.getUserId(req), sessionId, {
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      window,
    });
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Get(':sessionId/ephemeral-capabilities/summary')
  async getEphemeralCapabilitySummary(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Query('window') window?: '1h' | '24h' | '7d',
  ) {
    const result = await this.service.capabilityService.getEphemeralCapabilitySummary(
      this.getUserId(req),
      sessionId,
      {
        window,
      },
    );
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Post(':sessionId/ephemeral-capabilities/housekeeping')
  async runEphemeralCapabilityHousekeeping(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
  ) {
    const result = await this.service.capabilityService.runEphemeralCapabilityHousekeeping(
      this.getUserId(req),
      sessionId,
    );
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Get(':sessionId/ephemeral-capabilities/evolution-plan')
  async getEphemeralCapabilityEvolutionPlan(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Query('window') window?: '1h' | '24h' | '7d',
  ) {
    const result = await this.service.capabilityService.getEphemeralCapabilityEvolutionPlan(
      this.getUserId(req),
      sessionId,
      {
        window,
      },
    );
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Post(':sessionId/ephemeral-capabilities/evolution-apply')
  async applyEphemeralCapabilityEvolutionPlan(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Query('window') window?: '1h' | '24h' | '7d',
  ) {
    const result = await this.service.capabilityService.applyEphemeralCapabilityEvolutionPlan(
      this.getUserId(req),
      sessionId,
      {
        window,
      },
    );
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Get(':sessionId/ephemeral-capabilities/promotion-tasks')
  async listEphemeralCapabilityPromotionTasks(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Query('window') window?: '1h' | '24h' | '7d',
    @Query('status') status?: string,
  ) {
    const result = await this.service.capabilityService.listEphemeralCapabilityPromotionTasks(
      this.getUserId(req),
      sessionId,
      {
        window,
        status,
      },
    );
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Get(':sessionId/ephemeral-capabilities/promotion-tasks/summary')
  async getEphemeralCapabilityPromotionTaskSummary(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Query('window') window?: '1h' | '24h' | '7d',
  ) {
    const result = await this.service.capabilityService.getEphemeralCapabilityPromotionTaskSummary(
      this.getUserId(req),
      sessionId,
      {
        window,
      },
    );
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Patch(':sessionId/ephemeral-capabilities/promotion-tasks/:taskAssetId')
  async updateEphemeralCapabilityPromotionTask(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Param('taskAssetId') taskAssetId: string,
    @Body() dto: { action: string; comment?: string },
  ) {
    const result = await this.service.capabilityService.updateEphemeralCapabilityPromotionTask(
      this.getUserId(req),
      sessionId,
      taskAssetId,
      dto,
    );
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Post(':sessionId/ephemeral-capabilities/promotion-tasks/batch')
  async batchUpdateEphemeralCapabilityPromotionTasks(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Body()
    dto: {
      action: string;
      comment?: string;
      taskAssetIds?: string[];
      window?: '1h' | '24h' | '7d';
      status?: string;
      maxConcurrency?: number;
      maxRetries?: number;
    },
  ) {
    const result = await this.service.capabilityService.batchUpdateEphemeralCapabilityPromotionTasks(
      this.getUserId(req),
      sessionId,
      dto,
    );
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Get(':sessionId/ephemeral-capabilities/promotion-task-batches')
  async listEphemeralCapabilityPromotionTaskBatches(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Query('window') window?: '1h' | '24h' | '7d',
    @Query('action') action?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.service.capabilityService.listEphemeralCapabilityPromotionTaskBatches(
      this.getUserId(req),
      sessionId,
      {
        window,
        action,
        limit: limit ? Number(limit) : undefined,
      },
    );
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Post(':sessionId/ephemeral-capabilities/promotion-task-batches/:batchAssetId/replay-failed')
  async replayFailedEphemeralCapabilityPromotionTaskBatch(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Param('batchAssetId') batchAssetId: string,
    @Body()
    dto: {
      maxConcurrency?: number;
      maxRetries?: number;
      replayMode?: 'RETRYABLE_ONLY' | 'ALL_FAILED';
      errorCodes?: string[];
    },
  ) {
    const result = await this.service.capabilityService.replayFailedEphemeralCapabilityPromotionTaskBatch(
      this.getUserId(req),
      sessionId,
      batchAssetId,
      dto,
    );
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_SESSION_NOT_FOUND',
        message: '会话不存在或无权限访问',
      });
    }
    return result;
  }

  @Post(':sessionId/assets/:assetId/reuse')
  async reuseAsset(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Param('assetId') assetId: string,
    @Body() dto: ReuseConversationAssetRequest,
  ) {
    const result = await this.service.reuseAsset(this.getUserId(req), sessionId, assetId, dto);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_ASSET_NOT_FOUND',
        message: '会话资产不存在或无权限访问',
      });
    }
    return result;
  }

  // ── Phase 7: 动态编排端点 ─────────────────────────────────────────────────

  @Post(':sessionId/agents/generate')
  async generateEphemeralAgent(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Body() dto: { userInstruction: string; context?: string },
  ) {
    const result = await this.service.generateEphemeralAgent(this.getUserId(req), sessionId, dto);
    if (!result) {
      throw new NotFoundException({ code: 'CONV_SESSION_NOT_FOUND', message: '会话不存在' });
    }
    return result;
  }

  @Get(':sessionId/agents')
  async listEphemeralAgents(@Request() req: AuthRequest, @Param('sessionId') sessionId: string) {
    const result = await this.service.listEphemeralAgents(this.getUserId(req), sessionId);
    if (!result) {
      throw new NotFoundException({ code: 'CONV_SESSION_NOT_FOUND', message: '会话不存在' });
    }
    return result;
  }

  @Get(':sessionId/agents/available')
  async getAvailableAgents(@Request() req: AuthRequest, @Param('sessionId') sessionId: string) {
    return this.service.getAvailableAgents(this.getUserId(req), sessionId);
  }

  @Post(':sessionId/agents/:agentAssetId/promote')
  async promoteEphemeralAgent(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Param('agentAssetId') agentAssetId: string,
    @Body() dto: { reviewComment?: string },
  ) {
    const result = await this.service.promoteEphemeralAgent(
      this.getUserId(req),
      sessionId,
      agentAssetId,
      dto,
    );
    if (!result) {
      throw new NotFoundException({ code: 'CONV_AGENT_NOT_FOUND', message: '临时智能体不存在' });
    }
    return result;
  }

  @Post(':sessionId/workflows/assemble')
  async assembleEphemeralWorkflow(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Body() dto: { userInstruction: string; context?: string },
  ) {
    const result = await this.service.assembleEphemeralWorkflow(
      this.getUserId(req),
      sessionId,
      dto,
    );
    if (!result) {
      throw new NotFoundException({ code: 'CONV_ASSEMBLE_FAILED', message: '工作流组装失败' });
    }
    return result;
  }

  @Post(':sessionId/overrides')
  async applyEphemeralOverrides(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Body() dto: { userMessage: string },
  ) {
    return this.service.applyEphemeralOverrides(this.getUserId(req), sessionId, dto.userMessage);
  }

  @Get(':sessionId/report-cards')
  async getReportCards(@Request() req: AuthRequest, @Param('sessionId') sessionId: string) {
    const result = await this.service.resultService.getResult(this.getUserId(req), sessionId);
    if (!result) {
      throw new NotFoundException({ code: 'CONV_RESULT_NOT_FOUND', message: '结果不存在' });
    }
    const report = await this.service.synthesizeResult(
      sessionId,
      result as unknown as Record<string, unknown>,
    );
    if (!report) return { cards: [] };
    return { cards: this.service.buildReportCards(report) };
  }

  @Get(':sessionId/cost-summary')
  async getSessionCostSummary(@Request() req: AuthRequest, @Param('sessionId') sessionId: string) {
    const result = await this.service.getSessionCostSummary(this.getUserId(req), sessionId);
    if (!result) {
      throw new NotFoundException({ code: 'CONV_SESSION_NOT_FOUND', message: '会话不存在' });
    }
    return result;
  }
}
