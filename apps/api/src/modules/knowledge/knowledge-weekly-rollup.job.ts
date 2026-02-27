import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { Cron } from '@nestjs/schedule';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeSearchService } from './knowledge-search.service';

@Injectable()
export class KnowledgeWeeklyRollupJob {
  private readonly logger = new Logger(KnowledgeWeeklyRollupJob.name);

  constructor(
    private readonly knowledgeService: KnowledgeService,
    @Inject(forwardRef(() => KnowledgeSearchService))
    private readonly searchService: KnowledgeSearchService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('0 30 18 * * 1')
  async handleWeeklyRollup() {
    try {
      const result = await this.searchService.generateWeeklyRollup({
        triggerAnalysis: true,
      });
      this.logger.log(`Weekly rollup generated: ${result.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Weekly rollup failed: ${message}`);
    }
  }
}
