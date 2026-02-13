import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { ReportExportService } from './report-export.service';
import { ExportDebateReportRequest, ExportTaskQueryRequest } from './dto';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('report-exports')
export class ReportExportController {
  constructor(private readonly service: ReportExportService) {}

  private getUserId(req: AuthRequest): string {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('User not authenticated');
    return userId;
  }

  @Post()
  create(@Request() req: AuthRequest, @Body() dto: ExportDebateReportRequest) {
    return this.service.createExportTask(this.getUserId(req), dto);
  }

  @Get()
  findMany(@Request() req: AuthRequest, @Query() query: ExportTaskQueryRequest) {
    return this.service.findMany(this.getUserId(req), query);
  }

  @Get(':id')
  findOne(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.findOne(this.getUserId(req), id);
  }

  @Delete(':id')
  remove(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.remove(this.getUserId(req), id);
  }
}
