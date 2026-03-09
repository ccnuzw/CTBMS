import { Module } from '@nestjs/common';
import { AgentConversationController } from './agent-conversation.controller';
import { AgentConversationService } from './agent-conversation.service';
import { MarketDataModule } from '../market-data';
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
  ConversationPreflightService,
  ConversationTurnService,
  ConversationCapabilityService,
  ConversationSubscriptionService,
} from './services';

@Module({
  imports: [WorkflowExecutionModule, ReportExportModule, MarketDataModule],
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
    ConversationPreflightService,
    ConversationTurnService,
    ConversationCapabilityService,
    ConversationSubscriptionService,
    AgentConversationService,
    AgentConversationSubscriptionJob,
    AgentConversationEphemeralGovernanceJob,
  ],
  exports: [
    ConversationCapabilityService,
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
    ConversationPreflightService,
    ConversationTurnService,
    ConversationSubscriptionService,
  ],
})
export class AgentConversationModule {}
