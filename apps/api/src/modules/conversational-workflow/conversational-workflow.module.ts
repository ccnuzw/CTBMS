import { Module } from '@nestjs/common';
import { ConversationalWorkflowController } from './conversational-workflow.controller';
import { ConversationalWorkflowService } from './conversational-workflow.service';
import { ConfigModule } from '../config/config.module';
import { WorkflowDefinitionModule } from '../workflow-definition';
import { WorkflowExecutionModule } from '../workflow-execution';
import { AIProviderFactory } from '../ai/providers/provider.factory';
import { AIModelService } from '../ai/ai-model.service';

@Module({
  imports: [ConfigModule, WorkflowDefinitionModule, WorkflowExecutionModule],
  controllers: [ConversationalWorkflowController],
  providers: [ConversationalWorkflowService, AIProviderFactory, AIModelService],
  exports: [ConversationalWorkflowService],
})
export class ConversationalWorkflowModule {}
