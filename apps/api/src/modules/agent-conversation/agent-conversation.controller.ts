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
  CreateConversationSubscriptionRequest,
  CreateConversationSessionRequest,
  CreateConversationTurnRequest,
  DeliverConversationEmailRequest,
  ExportConversationResultRequest,
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
}
