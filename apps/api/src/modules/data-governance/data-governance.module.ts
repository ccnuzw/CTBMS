import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma';
import { DataGovernanceController } from './data-governance.controller';
import { DataGovernanceService } from './data-governance.service';

@Module({
  imports: [PrismaModule],
  controllers: [DataGovernanceController],
  providers: [DataGovernanceService],
  exports: [DataGovernanceService],
})
export class DataGovernanceModule {}
