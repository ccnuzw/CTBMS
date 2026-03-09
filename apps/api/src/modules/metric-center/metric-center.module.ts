import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma';
import { MetricCenterController } from './metric-center.controller';
import { MetricCenterService } from './metric-center.service';
import { MetricSnapshotJob } from './metric-snapshot.job';

@Module({
  imports: [PrismaModule],
  controllers: [MetricCenterController],
  providers: [MetricCenterService, MetricSnapshotJob],
  exports: [MetricCenterService],
})
export class MetricCenterModule {}
