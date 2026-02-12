import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    Request,
    UnauthorizedException,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { WorkflowDefinitionService } from './workflow-definition.service';
import {
    CreateWorkflowDefinitionRequest,
    CreateWorkflowVersionRequest,
    PublishWorkflowVersionRequest,
    UpdateWorkflowDefinitionRequest,
    ValidateWorkflowDslRequest,
    WorkflowDefinitionQueryRequest,
    WorkflowPublishAuditQueryRequest,
} from './dto';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('workflow-definitions')
export class WorkflowDefinitionController {
    constructor(private readonly workflowDefinitionService: WorkflowDefinitionService) { }

    @Post()
    create(@Body() dto: CreateWorkflowDefinitionRequest, @Request() req: AuthRequest) {
        const userId = req.user?.id;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return this.workflowDefinitionService.create(userId, dto);
    }

    @Get()
    findAll(@Query() query: WorkflowDefinitionQueryRequest, @Request() req: AuthRequest) {
        const userId = req.user?.id;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return this.workflowDefinitionService.findAll(userId, query);
    }

    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
        const userId = req.user?.id;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return this.workflowDefinitionService.findOne(userId, id);
    }

    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateWorkflowDefinitionRequest,
        @Request() req: AuthRequest,
    ) {
        const userId = req.user?.id;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return this.workflowDefinitionService.update(userId, id, dto);
    }

    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
        const userId = req.user?.id;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return this.workflowDefinitionService.remove(userId, id);
    }

    @Get(':id/versions')
    listVersions(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
        const userId = req.user?.id;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return this.workflowDefinitionService.listVersions(userId, id);
    }

    @Post(':id/versions')
    createVersion(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CreateWorkflowVersionRequest,
        @Request() req: AuthRequest,
    ) {
        const userId = req.user?.id;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return this.workflowDefinitionService.createVersion(userId, id, dto);
    }

    @Post(':id/publish')
    publishVersion(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: PublishWorkflowVersionRequest,
        @Request() req: AuthRequest,
    ) {
        const userId = req.user?.id;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return this.workflowDefinitionService.publishVersion(userId, id, dto);
    }

    @Get(':id/publish-audits')
    listPublishAudits(
        @Param('id', ParseUUIDPipe) id: string,
        @Query() query: WorkflowPublishAuditQueryRequest,
        @Request() req: AuthRequest,
    ) {
        const userId = req.user?.id;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return this.workflowDefinitionService.listPublishAudits(userId, id, query);
    }

    @Post('validate-dsl')
    validateDsl(@Body() dto: ValidateWorkflowDslRequest) {
        return this.workflowDefinitionService.validateDsl(dto.dslSnapshot, dto.stage);
    }
}
