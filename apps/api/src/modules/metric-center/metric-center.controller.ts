import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { MetricCenterService } from './metric-center.service';
import { MetricComputeRequest, MetricSnapshotRunRequest } from './dto';

@Controller('metric-center')
export class MetricCenterController {
  constructor(private readonly service: MetricCenterService) { }

  @Post('compute')
  computeMetric(@Body() dto: MetricComputeRequest) {
    return this.service.computeMetric(dto);
  }

  @Post('snapshots/run')
  runSnapshotJob(@Body() dto: MetricSnapshotRunRequest) {
    return this.service.runSnapshotJob(dto);
  }

  @Get('metrics/:metricCode/versions')
  listMetricVersions(@Param('metricCode') metricCode: string) {
    return this.service.listMetricVersions(metricCode);
  }

  @Patch('metrics/:metricCode/versions/:version/status')
  updateMetricStatus(
    @Param('metricCode') metricCode: string,
    @Param('version') version: string,
    @Body() dto: { status: 'DRAFT' | 'ACTIVE' | 'DEPRECATED' },
  ) {
    return this.service.updateMetricStatus(metricCode, version, dto.status);
  }
}
