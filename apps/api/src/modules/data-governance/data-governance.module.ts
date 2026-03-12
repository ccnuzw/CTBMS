import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma';
import {
  WeatherLogisticsController,
  MetricGovernanceController,
  EvidenceController,
  DataQualityController,
} from './controllers';
import { DataGovernanceService } from './data-governance.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    WeatherLogisticsController,
    MetricGovernanceController,
    EvidenceController,
    DataQualityController,
  ],
  providers: [DataGovernanceService],
  exports: [DataGovernanceService],
})
export class DataGovernanceModule { }
