import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AIModule } from '../ai/ai.module';
import { ConfigModule } from '../config/config.module';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeWeeklyRollupJob } from './knowledge-weekly-rollup.job';

import { IntelTaskModule } from '../intel-task/intel-task.module';
import { RagPipelineService } from './rag/rag-pipeline.service';
import { KnowledgeIngestionService } from './services/knowledge-ingestion.service';
import { KnowledgeRetrievalService } from './services/knowledge-retrieval.service';
import { KnowledgeQueryExpansionService } from './services/knowledge-query-expansion.service';

import { KnowledgeUploadController } from './knowledge-upload.controller';
import { KnowledgeExtractionService } from './services/knowledge-extraction.service';
import { DeepAnalysisService } from './services/deep-analysis.service';

@Module({
  imports: [PrismaModule, AIModule, ConfigModule, IntelTaskModule],
  controllers: [KnowledgeController, KnowledgeUploadController],
  providers: [
    KnowledgeService,
    KnowledgeWeeklyRollupJob,
    RagPipelineService,
    KnowledgeIngestionService,
    KnowledgeRetrievalService,
    KnowledgeQueryExpansionService,
    KnowledgeExtractionService,
    DeepAnalysisService
  ],
  exports: [
    KnowledgeService,
    RagPipelineService,
    KnowledgeIngestionService,
    KnowledgeRetrievalService,
    KnowledgeQueryExpansionService,
    KnowledgeExtractionService,
    DeepAnalysisService
  ],
})
export class KnowledgeModule { }
