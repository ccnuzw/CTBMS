import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  Body,
  UnauthorizedException,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { WorkflowExecutionService } from './workflow-execution.service';
import { WorkflowExecutionQueryService } from './workflow-execution-query.service';
import { WorkflowExecutionReplayService } from './workflow-execution-replay.service';
import {
  CancelWorkflowExecutionRequest,
  TriggerWorkflowExecutionRequest,
  WorkflowExecutionQueryRequest,
  WorkflowDebateReplayQueryRequest,
  WorkflowRuntimeEventQueryRequest,
} from './dto';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('workflow-executions')
export class WorkflowExecutionController {
  constructor(
    private readonly workflowExecutionService: WorkflowExecutionService,
    private readonly workflowExecutionQueryService: WorkflowExecutionQueryService,
    private readonly workflowExecutionReplayService: WorkflowExecutionReplayService,
  ) { }

  @Post('trigger')
  trigger(@Body() dto: TriggerWorkflowExecutionRequest, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.workflowExecutionService.trigger(userId, dto);
  }

  @Post(':id/rerun')
  rerun(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.workflowExecutionService.rerun(userId, id);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelWorkflowExecutionRequest,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.workflowExecutionService.cancel(userId, id, dto);
  }

  @Get()
  findAll(@Query() query: WorkflowExecutionQueryRequest, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.workflowExecutionQueryService.findAll(userId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.workflowExecutionQueryService.findOne(userId, id);
  }

  @Get(':id/timeline')
  timeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: WorkflowRuntimeEventQueryRequest,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.workflowExecutionQueryService.timeline(userId, id, query);
  }

  @Get(':id/debate-traces')
  debateTraces(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: WorkflowDebateReplayQueryRequest,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.workflowExecutionQueryService.debateTraces(userId, id, query);
  }

  @Get(':id/debate-timeline')
  debateTimeline(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.workflowExecutionQueryService.debateTimeline(userId, id);
  }

  @Get(':id/replay')
  replay(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.workflowExecutionReplayService.replay(userId, id);
  }
}
