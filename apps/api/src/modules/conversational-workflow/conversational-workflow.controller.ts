import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  Res,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { ConversationalWorkflowService } from './conversational-workflow.service';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('conversational-workflow')
export class ConversationalWorkflowController {
  private readonly logger = new Logger(ConversationalWorkflowController.name);

  constructor(
    private readonly conversationalWorkflowService: ConversationalWorkflowService,
  ) {}

  /**
   * 列出用户的对话会话
   */
  @Get('sessions')
  async listSessions(
    @Request() req: AuthRequest,
    @Query('limit') limit?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.conversationalWorkflowService.listSessions(userId, parsedLimit);
  }

  /**
   * 创建对话会话
   */
  @Post('sessions')
  async createSession(@Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.conversationalWorkflowService.createSession(userId);
  }

  /**
   * 获取会话状态
   */
  @Get('sessions/:id')
  async getSession(
    @Param('id') sessionId: string,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.conversationalWorkflowService.getSession(sessionId);
  }

  /**
   * 获取会话消息历史
   */
  @Get('sessions/:id/messages')
  async getSessionMessages(
    @Param('id') sessionId: string,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.conversationalWorkflowService.getSessionMessages(sessionId);
  }

  /**
   * 发送消息 (常规 REST)
   */
  @Post('sessions/:id/messages')
  async sendMessage(
    @Param('id') sessionId: string,
    @Body() body: { message: string },
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    if (!body.message?.trim()) {
      return {
        sessionId,
        phase: 'IDLE',
        messages: [{ type: 'text', content: '请输入您的需求。' }],
      };
    }
    return this.conversationalWorkflowService.sendMessage(sessionId, body.message);
  }

  /**
   * 发送消息 (SSE 流式) — 阶段级进度推送
   *
   * 推送事件:
   * - thinking: { status: string }         正在处理中的状态文本
   * - phase_update: { phase: string }      会话阶段切换
   * - done: ConversationMessageResponse    最终结果
   * - error: { message: string }           错误
   */
  @Post('sessions/:id/messages/stream')
  async sendMessageStream(
    @Param('id') sessionId: string,
    @Body() body: { message: string },
    @Request() req: AuthRequest,
    @Res() res: ExpressResponse,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'User not authenticated' });
      return;
    }
    if (!body.message?.trim()) {
      res.status(400).json({ message: '请输入您的需求。' });
      return;
    }

    // 设置 SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // 推送"思考中"
      sendEvent('thinking', { status: '正在分析你的意图...' });

      // 调用核心逻辑
      const result = await this.conversationalWorkflowService.sendMessage(
        sessionId,
        body.message,
      );

      // 推送阶段更新
      sendEvent('phase_update', { phase: result.phase });

      // 推送完整结果
      sendEvent('done', result);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '处理失败';
      this.logger.error(`SSE sendMessage error: ${errorMsg}`);
      sendEvent('error', { message: errorMsg });
    } finally {
      res.end();
    }
  }
}
