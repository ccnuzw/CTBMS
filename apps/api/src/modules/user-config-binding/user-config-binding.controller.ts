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
import type { Request as ExpressRequest } from 'express';
import {
  CreateUserConfigBindingRequest,
  UpdateUserConfigBindingRequest,
  UserConfigBindingQueryRequest,
} from './dto';
import { UserConfigBindingService } from './user-config-binding.service';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('user-config-bindings')
export class UserConfigBindingController {
  constructor(private readonly service: UserConfigBindingService) {}

  private getUserId(req: AuthRequest): string {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return userId;
  }

  @Post()
  create(@Request() req: AuthRequest, @Body() dto: CreateUserConfigBindingRequest) {
    return this.service.create(this.getUserId(req), dto);
  }

  @Get()
  findMany(@Request() req: AuthRequest, @Query() query: UserConfigBindingQueryRequest) {
    return this.service.findMany(this.getUserId(req), query);
  }

  @Get(':id')
  findOne(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.findOne(this.getUserId(req), id);
  }

  @Put(':id')
  update(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateUserConfigBindingRequest,
  ) {
    return this.service.update(this.getUserId(req), id, dto);
  }

  @Delete(':id')
  remove(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.remove(this.getUserId(req), id);
  }
}
