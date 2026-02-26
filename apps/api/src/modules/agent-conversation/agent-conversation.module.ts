import { Module } from '@nestjs/common';
import { AgentConversationController } from './agent-conversation.controller';
import { AgentConversationService } from './agent-conversation.service';
import { WorkflowExecutionModule } from '../workflow-execution';
import { ReportExportModule } from '../report-export';
import { AgentConversationSubscriptionJob } from './agent-conversation-subscription.job';
import { AgentConversationEphemeralGovernanceJob } from './agent-conversation-ephemeral-governance.job';

@Module({
  imports: [WorkflowExecutionModule, ReportExportModule],
  controllers: [AgentConversationController],
  providers: [
    AgentConversationService,
    AgentConversationSubscriptionJob,
    AgentConversationEphemeralGovernanceJob,
  ],
  exports: [AgentConversationService],
})
export class AgentConversationModule {}
