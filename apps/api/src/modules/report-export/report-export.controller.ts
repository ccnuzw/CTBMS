import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Request,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
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

  @Get(':id/download')
  async download(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Res() res: ExpressResponse,
  ) {
    const payload = await this.service.resolveDownload(this.getUserId(req), id);
    res.setHeader('Content-Type', payload.contentType);
    res.download(payload.filePath, payload.fileName);
  }

  @Delete(':id')
  remove(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.remove(this.getUserId(req), id);
  }
}
