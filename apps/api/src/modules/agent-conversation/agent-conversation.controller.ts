import {
  Body,
  Controller,
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
  constructor(private readonly service: AgentConversationService) {}

  private getUserId(req: AuthRequest): string {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return userId;
  }

  @Post()
  createSession(@Request() req: AuthRequest, @Body() dto: CreateConversationSessionRequest) {
    return this.service.createSession(this.getUserId(req), dto);
  }

  @Get()
  listSessions(@Request() req: AuthRequest, @Query() query: ConversationSessionQueryRequest) {
    return this.service.listSessions(this.getUserId(req), query);
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
    const result = await this.service.getResult(this.getUserId(req), sessionId);
    if (!result) {
      throw new NotFoundException({
        code: 'CONV_RESULT_NOT_FOUND',
        message: '会话不存在、无权限访问或执行实例不可见',
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
    const result = await this.service.deliverEmail(this.getUserId(req), sessionId, dto);
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
    const result = await this.service.deliver(this.getUserId(req), sessionId, dto);
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
    const result = await this.service.listSubscriptions(this.getUserId(req), sessionId);
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
    const result = await this.service.createSubscription(this.getUserId(req), sessionId, dto);
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
    const result = await this.service.runSubscriptionNow(this.getUserId(req), sessionId, subscriptionId);
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
    const result = await this.service.resolveScheduleCommand(this.getUserId(req), sessionId, dto);
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
    const result = await this.service.updateSubscription(
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
    const result = await this.service.listCapabilityRoutingLogs(this.getUserId(req), sessionId, {
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
    const result = await this.service.getCapabilityRoutingSummary(this.getUserId(req), sessionId, {
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
    const result = await this.service.getEphemeralCapabilitySummary(this.getUserId(req), sessionId, {
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

  @Post(':sessionId/ephemeral-capabilities/housekeeping')
  async runEphemeralCapabilityHousekeeping(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
  ) {
    const result = await this.service.runEphemeralCapabilityHousekeeping(this.getUserId(req), sessionId);
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
    const result = await this.service.getEphemeralCapabilityEvolutionPlan(this.getUserId(req), sessionId, {
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

  @Post(':sessionId/ephemeral-capabilities/evolution-apply')
  async applyEphemeralCapabilityEvolutionPlan(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Query('window') window?: '1h' | '24h' | '7d',
  ) {
    const result = await this.service.applyEphemeralCapabilityEvolutionPlan(this.getUserId(req), sessionId, {
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

  @Get(':sessionId/ephemeral-capabilities/promotion-tasks')
  async listEphemeralCapabilityPromotionTasks(
    @Request() req: AuthRequest,
    @Param('sessionId') sessionId: string,
    @Query('window') window?: '1h' | '24h' | '7d',
    @Query('status') status?: string,
  ) {
    const result = await this.service.listEphemeralCapabilityPromotionTasks(
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
    const result = await this.service.getEphemeralCapabilityPromotionTaskSummary(
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
    const result = await this.service.updateEphemeralCapabilityPromotionTask(
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
    },
  ) {
    const result = await this.service.batchUpdateEphemeralCapabilityPromotionTasks(
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
}
