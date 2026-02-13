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
import { AgentPromptTemplateService } from './agent-prompt-template.service';
import {
    AgentPromptTemplateQueryRequest,
    CreateAgentPromptTemplateRequest,
    UpdateAgentPromptTemplateRequest,
} from './dto';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('agent-prompt-templates')
export class AgentPromptTemplateController {
    constructor(private readonly agentPromptTemplateService: AgentPromptTemplateService) { }

    @Post()
    create(@Body() dto: CreateAgentPromptTemplateRequest, @Request() req: AuthRequest) {
        const userId = req.user?.id;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return this.agentPromptTemplateService.create(userId, dto);
    }

    @Get()
    findAll(@Query() query: AgentPromptTemplateQueryRequest, @Request() req: AuthRequest) {
        const userId = req.user?.id;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return this.agentPromptTemplateService.findAll(userId, query);
    }

    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
        const userId = req.user?.id;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return this.agentPromptTemplateService.findOne(userId, id);
    }

    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateAgentPromptTemplateRequest,
        @Request() req: AuthRequest,
    ) {
        const userId = req.user?.id;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return this.agentPromptTemplateService.update(userId, id, dto);
    }

    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
        const userId = req.user?.id;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return this.agentPromptTemplateService.remove(userId, id);
    }
}
