import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MarketDataService } from './market-data.service';

@Injectable()
export class MarketDataReconciliationMetricsJob {
  private readonly logger = new Logger(MarketDataReconciliationMetricsJob.name);

  constructor(private readonly marketDataService: MarketDataService) {}

  @Cron('10 0 * * *')
  async snapshotDailyReconciliationMetrics() {
    try {
      const result = await this.marketDataService.snapshotReconciliationWindowMetrics({
        windowDays: 7,
      });

      const passedDatasetCount = result.results.filter((item) => item.meetsWindowTarget).length;
      this.logger.log(
        `daily reconciliation metrics snapshot completed: windowDays=${result.windowDays} datasets=${result.results.length} passedDatasets=${passedDatasetCount}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`daily reconciliation metrics snapshot failed: ${message}`);
    }
  }
}
