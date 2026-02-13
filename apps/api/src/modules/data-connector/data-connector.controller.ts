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
import { DataConnectorService } from './data-connector.service';
import {
  CreateDataConnectorRequest,
  DataConnectorHealthCheckRequest,
  DataConnectorQueryRequest,
  UpdateDataConnectorRequest,
} from './dto';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('data-connectors')
export class DataConnectorController {
  constructor(private readonly dataConnectorService: DataConnectorService) {}

  @Post()
  create(@Body() dto: CreateDataConnectorRequest, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.dataConnectorService.create(dto);
  }

  @Get()
  findAll(@Query() query: DataConnectorQueryRequest, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.dataConnectorService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.dataConnectorService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDataConnectorRequest,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.dataConnectorService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.dataConnectorService.remove(id);
  }

  @Post(':id/health-check')
  healthCheck(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DataConnectorHealthCheckRequest,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.dataConnectorService.healthCheck(id, dto);
  }
}
