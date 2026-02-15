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
import { AgentProfileService } from './agent-profile.service';
import { OutputSchemaRegistryService } from './output-schema-registry.service';
import {
  AgentProfileQueryRequest,
  CreateAgentProfileRequest,
  PublishAgentProfileRequest,
  UpdateAgentProfileRequest,
} from './dto';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('agent-profiles')
export class AgentProfileController {
  constructor(
    private readonly agentProfileService: AgentProfileService,
    private readonly outputSchemaRegistryService: OutputSchemaRegistryService,
  ) {}

  @Post()
  create(@Body() dto: CreateAgentProfileRequest, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.agentProfileService.create(userId, dto);
  }

  @Get()
  findAll(@Query() query: AgentProfileQueryRequest, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.agentProfileService.findAll(userId, query);
  }

  @Get('output-schemas/catalog')
  listOutputSchemas(@Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.outputSchemaRegistryService.listSchemas();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.agentProfileService.findOne(userId, id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgentProfileRequest,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.agentProfileService.update(userId, id, dto);
  }

  @Post(':id/publish')
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishAgentProfileRequest,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.agentProfileService.publish(userId, id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.agentProfileService.remove(userId, id);
  }

  @Get(':id/history')
  getHistory(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.agentProfileService.getHistory(userId, id);
  }

  @Post(':id/rollback/:version')
  rollback(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version') version: string,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.agentProfileService.rollback(userId, id, Number(version));
  }

}
