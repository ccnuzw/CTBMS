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
  findAll(@Query() query: TriggerConfigQueryDto) {
    return this.service.findAll(query);
  }

  @Get('logs')
  findLogs(@Query() query: TriggerLogQueryDto) {
    return this.service.findLogs(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTriggerConfigDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.service.activate(id);
  }

  @Post(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }

  @Get(':id/logs')
  findLogsByConfigId(
    @Param('id') configId: string,
    @Query() query: TriggerLogQueryDto,
  ) {
    return this.service.findLogsByConfigId(configId, query);
  }
}
