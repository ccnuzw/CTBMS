import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AgentConversationService } from './agent-conversation.service';

@Injectable()
export class AgentConversationSubscriptionJob {
  private readonly logger = new Logger(AgentConversationSubscriptionJob.name);

  constructor(private readonly conversationService: AgentConversationService) {}

  @Cron('*/1 * * * *')
  async tick() {
    try {
      await this.conversationService.processDueSubscriptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`processDueSubscriptions failed: ${message}`);
    }
  }
}
