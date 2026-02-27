import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { MarketDataCutoverCompensationJob } from './market-data-cutover-compensation.job';
import { MarketDataController } from './market-data.controller';
import { MarketDataReconciliationMetricsJob } from './market-data-reconciliation-metrics.job';
import { MarketDataService } from './market-data.service';

@Module({
  imports: [ConfigModule],
  controllers: [MarketDataController],
  providers: [
    MarketDataService,
    MarketDataReconciliationMetricsJob,
    MarketDataCutoverCompensationJob,
  ],
  exports: [MarketDataService],
})
export class MarketDataModule {}
