import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { TriggerGatewayService } from './trigger-gateway.service';
import {
  CreateTriggerConfigDto,
  UpdateTriggerConfigDto,
  FireTriggerConfigDto,
  TriggerConfigQueryDto,
  TriggerLogQueryDto,
} from './dto';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('trigger-configs')
export class TriggerGatewayController {
  constructor(private readonly service: TriggerGatewayService) {}

  private getUserId(req: AuthRequest): string {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('User not authenticated');
    return userId;
  }

  @Post()
  create(@Request() req: AuthRequest, @Body() dto: CreateTriggerConfigDto) {
    return this.service.create(this.getUserId(req), dto);
  }

  @Get()
  findAll(@Request() req: AuthRequest, @Query() query: TriggerConfigQueryDto) {
    return this.service.findAll(this.getUserId(req), query);
  }

  @Get('logs')
  findLogs(@Request() req: AuthRequest, @Query() query: TriggerLogQueryDto) {
    return this.service.findLogs(this.getUserId(req), query);
  }

  @Get(':id')
  findOne(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.findOne(this.getUserId(req), id);
  }

  @Patch(':id')
  update(@Request() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdateTriggerConfigDto) {
    return this.service.update(this.getUserId(req), id, dto);
  }

  @Delete(':id')
  remove(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.remove(this.getUserId(req), id);
  }

  @Post(':id/activate')
  activate(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.activate(this.getUserId(req), id);
  }

  @Post(':id/deactivate')
  deactivate(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.deactivate(this.getUserId(req), id);
  }

  @Post(':id/fire')
  fire(@Request() req: AuthRequest, @Param('id') id: string, @Body() dto: FireTriggerConfigDto) {
    return this.service.fire(this.getUserId(req), id, dto);
  }

  @Get(':id/logs')
  findLogsByConfigId(
    @Request() req: AuthRequest,
    @Param('id') configId: string,
    @Query() query: TriggerLogQueryDto,
  ) {
    return this.service.findLogsByConfigId(this.getUserId(req), configId, query);
  }
}
