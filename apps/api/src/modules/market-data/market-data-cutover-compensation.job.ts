import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MarketDataService } from './market-data.service';

@Injectable()
export class MarketDataCutoverCompensationJob {
  private readonly logger = new Logger(MarketDataCutoverCompensationJob.name);

  constructor(private readonly marketDataService: MarketDataService) { }

  @Cron('*/10 * * * *')
  async runCompensationSweep() {
    try {
      const result = await this.marketDataService.cutoverService.runReconciliationCutoverCompensationSweep();
      if (!result.enabled) {
        return;
      }

      this.logger.log(
        `cutover compensation sweep completed: triggered=${result.triggered} reason=${result.reason} scope=${result.scope ?? 'n/a'} targetUserCount=${result.targetUserCount ?? 0} batchId=${result.batchId ?? 'n/a'} status=${result.status ?? 'n/a'} replayed=${result.replayed ?? false} attempted=${result.attempted ?? 0}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`cutover compensation sweep failed: ${message}`);
    }
  }
}
