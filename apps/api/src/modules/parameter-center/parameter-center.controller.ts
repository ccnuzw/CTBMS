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
import { ParameterCenterService } from './parameter-center.service';
import {
  CreateParameterItemRequest,
  CreateParameterSetRequest,
  ParameterSetQueryRequest,
  ResolveParameterSetRequest,
  UpdateParameterItemRequest,
  UpdateParameterSetRequest,
} from './dto';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('parameter-sets')
export class ParameterCenterController {
  constructor(private readonly parameterCenterService: ParameterCenterService) {}

  @Post()
  createSet(@Body() dto: CreateParameterSetRequest, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.parameterCenterService.createSet(userId, dto);
  }

  @Get()
  findAll(@Query() query: ParameterSetQueryRequest, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.parameterCenterService.findAll(userId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.parameterCenterService.findOne(userId, id);
  }

  @Patch(':id')
  updateSet(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateParameterSetRequest,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.parameterCenterService.updateSet(userId, id, dto);
  }

  @Delete(':id')
  removeSet(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.parameterCenterService.removeSet(userId, id);
  }

  @Post(':id/items')
  addItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateParameterItemRequest,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.parameterCenterService.addItem(userId, id, dto);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateParameterItemRequest,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.parameterCenterService.updateItem(userId, id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.parameterCenterService.removeItem(userId, id, itemId);
  }

  @Post(':id/resolve')
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveParameterSetRequest,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.parameterCenterService.resolve(userId, id, dto);
  }
}
