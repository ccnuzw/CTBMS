import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AIModule } from '../ai/ai.module';
import { ConfigModule } from '../config/config.module';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeItemsV1Controller } from './knowledge-items.v1.controller';
import { KnowledgeV1Controller } from './knowledge.v1.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeSyncService } from './knowledge-sync.service';
import { KnowledgeSearchService } from './knowledge-search.service';
import { KnowledgeAggregationService } from './knowledge-aggregation.service';
import { KnowledgeWeeklyRollupJob } from './knowledge-weekly-rollup.job';

import { IntelTaskModule } from '../intel-task/intel-task.module';
import { RagPipelineService } from './rag/rag-pipeline.service';
import { KnowledgeIngestionService } from './services/knowledge-ingestion.service';
import { KnowledgeRetrievalService } from './services/knowledge-retrieval.service';
import { KnowledgeQueryExpansionService } from './services/knowledge-query-expansion.service';

import { KnowledgeUploadController } from './knowledge-upload.controller';
import { KnowledgeExtractionService } from './services/knowledge-extraction.service';
import { DeepAnalysisService } from './services/deep-analysis.service';
import { ReportsV1Controller } from './reports.v1.controller';

@Module({
  imports: [PrismaModule, AIModule, ConfigModule, IntelTaskModule],
  controllers: [
    KnowledgeController,
    KnowledgeUploadController,
    KnowledgeItemsV1Controller,
    ReportsV1Controller,
    KnowledgeV1Controller,
  ],
  providers: [
    KnowledgeService, KnowledgeSyncService, KnowledgeSearchService, KnowledgeAggregationService,
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
