import { Module } from '@nestjs/common';
import { AgentConversationController } from './agent-conversation.controller';
import { AgentConversationService } from './agent-conversation.service';
import { WorkflowExecutionModule } from '../workflow-execution';
import { ReportExportModule } from '../report-export';
import { AgentConversationSubscriptionJob } from './agent-conversation-subscription.job';

@Module({
  imports: [WorkflowExecutionModule, ReportExportModule],
  controllers: [AgentConversationController],
  providers: [AgentConversationService, AgentConversationSubscriptionJob],
  exports: [AgentConversationService],
})
export class AgentConversationModule {}
