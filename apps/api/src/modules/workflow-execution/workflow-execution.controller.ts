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
import {
    CancelWorkflowExecutionRequest,
    TriggerWorkflowExecutionRequest,
    WorkflowExecutionQueryRequest,
    WorkflowRuntimeEventQueryRequest,
} from './dto';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('workflow-executions')
export class WorkflowExecutionController {
    constructor(private readonly workflowExecutionService: WorkflowExecutionService) { }

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
        return this.workflowExecutionService.findAll(userId, query);
    }

    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
        const userId = req.user?.id;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return this.workflowExecutionService.findOne(userId, id);
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
        return this.workflowExecutionService.timeline(userId, id, query);
    }
}
