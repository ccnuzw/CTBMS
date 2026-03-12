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
  constructor(private readonly service: UserConfigBindingService) { }

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

  @Get('ephemeral-policy-audits/list')
  findEphemeralPolicyAudits(
    @Request() req: AuthRequest,
    @Query('scope') scope?: 'PERSONAL' | 'TEAM',
    @Query('action') action?: string,
    @Query('changedKey') changedKey?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findEphemeralPolicyAudits(this.getUserId(req), {
      scope,
      action,
      changedKey,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('ephemeral-policy-audits/summary')
  summarizeEphemeralPolicyAudits(
    @Request() req: AuthRequest,
    @Query('scope') scope?: 'PERSONAL' | 'TEAM',
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.summarizeEphemeralPolicyAudits(this.getUserId(req), {
      scope,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post('ephemeral-policy-audits/:id/rollback')
  rollbackEphemeralPolicyAudit(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.rollbackEphemeralPolicyAudit(this.getUserId(req), id);
  }

  @Get(':id')
  findOne(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.findOne(this.getUserId(req), id);
  }

  @Patch(':id')
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
