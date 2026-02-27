import { Module } from '@nestjs/common';
import { AgentConversationController } from './agent-conversation.controller';
import { AgentConversationService } from './agent-conversation.service';
import { WorkflowExecutionModule } from '../workflow-execution';
import { ReportExportModule } from '../report-export';
import { AgentConversationSubscriptionJob } from './agent-conversation-subscription.job';
import { AgentConversationEphemeralGovernanceJob } from './agent-conversation-ephemeral-governance.job';
import {
  ConversationUtilsService,
  ConversationIntentService,
  ConversationAssetService,
  ConversationResultService,
  ConversationDeliveryService,
  ConversationScheduleService,
  ConversationPlanService,
  ConversationSkillService,
  ConversationEphemeralService,
  ConversationSynthesizerService,
  ConversationOrchestratorService,
} from './services';

@Module({
  imports: [WorkflowExecutionModule, ReportExportModule],
  controllers: [AgentConversationController],
  providers: [
    ConversationUtilsService,
    ConversationIntentService,
    ConversationAssetService,
    ConversationResultService,
    ConversationDeliveryService,
    ConversationScheduleService,
    ConversationPlanService,
    ConversationSkillService,
    ConversationEphemeralService,
    ConversationSynthesizerService,
    ConversationOrchestratorService,
    AgentConversationService,
    AgentConversationSubscriptionJob,
    AgentConversationEphemeralGovernanceJob,
  ],
  exports: [
    AgentConversationService,
    ConversationUtilsService,
    ConversationIntentService,
    ConversationAssetService,
    ConversationResultService,
    ConversationDeliveryService,
    ConversationScheduleService,
    ConversationPlanService,
    ConversationSkillService,
    ConversationEphemeralService,
    ConversationSynthesizerService,
    ConversationOrchestratorService,
  ],
})
export class AgentConversationModule { }
