import { Module } from '@nestjs/common';
import { ReportExportController } from './report-export.controller';
import { ReportExportService } from './report-export.service';

@Module({
  controllers: [ReportExportController],
  providers: [ReportExportService],
  exports: [ReportExportService],
})
export class ReportExportModule {}
