import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { MarketDataController } from './market-data.controller';
import { MarketDataReconciliationMetricsJob } from './market-data-reconciliation-metrics.job';
import { MarketDataService } from './market-data.service';

@Module({
  imports: [ConfigModule],
  controllers: [MarketDataController],
  providers: [MarketDataService, MarketDataReconciliationMetricsJob],
  exports: [MarketDataService],
})
export class MarketDataModule {}
