import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MetricCenterService } from './metric-center.service';

@Injectable()
export class MetricSnapshotJob {
  private readonly logger = new Logger(MetricSnapshotJob.name);

  constructor(private readonly metricCenterService: MetricCenterService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleSnapshotJob() {
    const result = await this.metricCenterService.snapshotActiveMetrics();
    this.logger.log(
      `Metric snapshot job finished: total=${result.total}, success=${result.successCount}, skipped=${result.skippedCount}`,
    );
  }
}
