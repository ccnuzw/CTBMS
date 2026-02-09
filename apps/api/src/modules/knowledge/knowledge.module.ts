import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AIModule } from '../ai/ai.module';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeWeeklyRollupJob } from './knowledge-weekly-rollup.job';

@Module({
  imports: [PrismaModule, AIModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeWeeklyRollupJob],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
