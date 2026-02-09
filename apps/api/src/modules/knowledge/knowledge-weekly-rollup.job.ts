import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { KnowledgeService } from './knowledge.service';

@Injectable()
export class KnowledgeWeeklyRollupJob {
  private readonly logger = new Logger(KnowledgeWeeklyRollupJob.name);

  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Cron('0 30 18 * * 1')
  async handleWeeklyRollup() {
    try {
      const result = await this.knowledgeService.generateWeeklyRollup({
        triggerAnalysis: true,
      });
      this.logger.log(`Weekly rollup generated: ${result.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Weekly rollup failed: ${message}`);
    }
  }
}
