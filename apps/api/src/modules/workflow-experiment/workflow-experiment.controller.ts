import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    Request,
    UnauthorizedException,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { WorkflowExperimentService } from './workflow-experiment.service';
import {
    CreateWorkflowExperimentDto,
    UpdateWorkflowExperimentDto,
    WorkflowExperimentQueryDto,
    ConcludeExperimentDto,
    RecordExperimentMetricsDto,
} from './dto';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('workflow-experiments')
export class WorkflowExperimentController {
    constructor(private readonly service: WorkflowExperimentService) { }

    private getUserId(req: AuthRequest): string {
        const userId = req.user?.id;
        if (!userId) throw new UnauthorizedException('User not authenticated');
        return userId;
    }

    @Post()
    create(@Request() req: AuthRequest, @Body() dto: CreateWorkflowExperimentDto) {
        return this.service.create(this.getUserId(req), dto);
    }

    @Get()
    findMany(@Request() req: AuthRequest, @Query() dto: WorkflowExperimentQueryDto) {
        return this.service.findMany(this.getUserId(req), dto);
    }

    @Get(':id')
    findOne(@Request() req: AuthRequest, @Param('id') id: string) {
        return this.service.findOne(this.getUserId(req), id);
    }

    @Put(':id')
    update(
        @Request() req: AuthRequest,
        @Param('id') id: string,
        @Body() dto: UpdateWorkflowExperimentDto,
    ) {
        return this.service.update(this.getUserId(req), id, dto);
    }

    @Delete(':id')
    remove(@Request() req: AuthRequest, @Param('id') id: string) {
        return this.service.remove(this.getUserId(req), id);
    }

    @Post(':id/start')
    start(@Request() req: AuthRequest, @Param('id') id: string) {
        return this.service.start(this.getUserId(req), id);
    }

    @Post(':id/pause')
    pause(@Request() req: AuthRequest, @Param('id') id: string) {
        return this.service.pause(this.getUserId(req), id);
    }

    @Post(':id/abort')
    abort(@Request() req: AuthRequest, @Param('id') id: string) {
        return this.service.abort(this.getUserId(req), id);
    }

    @Post(':id/conclude')
    conclude(
        @Request() req: AuthRequest,
        @Param('id') id: string,
        @Body() dto: ConcludeExperimentDto,
    ) {
        return this.service.conclude(this.getUserId(req), id, dto);
    }

    @Post(':id/metrics')
    recordMetrics(@Param('id') id: string, @Body() dto: RecordExperimentMetricsDto) {
        return this.service.recordMetrics(id, dto);
    }

    @Get(':id/route')
    routeTraffic(@Param('id') id: string) {
        return this.service.routeTraffic(id);
    }
}
