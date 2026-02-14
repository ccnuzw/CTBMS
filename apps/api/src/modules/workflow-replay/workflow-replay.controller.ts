import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { WorkflowExecutionService } from '../workflow-execution';
import {
  WorkflowDebateReplayQueryRequest,
  WorkflowRuntimeEventQueryRequest,
} from '../workflow-execution/dto';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('workflow-replays')
export class WorkflowReplayController {
  constructor(private readonly workflowExecutionService: WorkflowExecutionService) {}

  private getUserId(req: AuthRequest): string {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return userId;
  }

  @Get(':id')
  replay(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
    return this.workflowExecutionService.replay(this.getUserId(req), id);
  }

  @Get(':id/timeline')
  timeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: WorkflowRuntimeEventQueryRequest,
    @Request() req: AuthRequest,
  ) {
    return this.workflowExecutionService.timeline(this.getUserId(req), id, query);
  }

  @Get(':id/debate-traces')
  debateTraces(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: WorkflowDebateReplayQueryRequest,
    @Request() req: AuthRequest,
  ) {
    return this.workflowExecutionService.debateTraces(this.getUserId(req), id, query);
  }

  @Get(':id/debate-timeline')
  debateTimeline(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
    return this.workflowExecutionService.debateTimeline(this.getUserId(req), id);
  }
}
