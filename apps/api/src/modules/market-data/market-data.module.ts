import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { MarketDataCutoverCompensationJob } from './market-data-cutover-compensation.job';
import { MarketDataController } from './market-data.controller';
import { MarketDataV1Controller } from './market-data.v1.controller';
import { MarketDataReconciliationMetricsJob } from './market-data-reconciliation-metrics.job';
import { MarketDataService } from './market-data.service';
import { MarketDataQueryService } from './services/market-data-query.service';
import { MarketDataPersistenceService } from './services/market-data-persistence.service';
import { MarketDataCutoverService } from './services/market-data-cutover.service';
import { MarketDataReconciliationService } from './services/market-data-reconciliation.service';

@Module({
  imports: [ConfigModule],
  controllers: [MarketDataController, MarketDataV1Controller],
  providers: [
    MarketDataQueryService,
    MarketDataPersistenceService,
    MarketDataCutoverService,
    MarketDataReconciliationService,
    MarketDataService,
    MarketDataReconciliationMetricsJob,
    MarketDataCutoverCompensationJob,
  ],
  exports: [MarketDataService],
})
export class MarketDataModule { }
