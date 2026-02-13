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
import { TemplateCatalogService } from './template-catalog.service';
import {
  CreateTemplateCatalogRequest,
  UpdateTemplateCatalogRequest,
  TemplateCatalogQueryRequest,
  CopyTemplateRequest,
} from './dto';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('template-catalog')
export class TemplateCatalogController {
  constructor(private readonly service: TemplateCatalogService) {}

  private getUserId(req: AuthRequest): string {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('User not authenticated');
    return userId;
  }

  @Post()
  create(@Request() req: AuthRequest, @Body() dto: CreateTemplateCatalogRequest) {
    return this.service.create(this.getUserId(req), dto);
  }

  @Get()
  findMany(@Query() query: TemplateCatalogQueryRequest) {
    return this.service.findMany(query);
  }

  @Get('mine')
  findMyTemplates(@Request() req: AuthRequest, @Query() query: TemplateCatalogQueryRequest) {
    return this.service.findMyTemplates(this.getUserId(req), query);
  }

  @Get(':id')
  findOne(@Request() req: AuthRequest, @Param('id') id: string) {
    const userId = req.user?.id;
    return this.service.findOne(id, userId);
  }

  @Put(':id')
  update(@Request() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdateTemplateCatalogRequest) {
    return this.service.update(this.getUserId(req), id, dto);
  }

  @Post(':id/publish')
  publish(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.publish(this.getUserId(req), id);
  }

  @Post(':id/archive')
  archive(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.archive(this.getUserId(req), id);
  }

  @Delete(':id')
  remove(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.remove(this.getUserId(req), id);
  }

  @Post('copy')
  copyToWorkspace(@Request() req: AuthRequest, @Body() dto: CopyTemplateRequest) {
    return this.service.copyToWorkspace(this.getUserId(req), dto);
  }
}
