import { Module } from '@nestjs/common';
import { AgentToolController } from './agent-tool.controller';
import { ToolAdapterService } from './tool-adapter.service';
import { AgentChatService } from './agent-chat.service';
import { WorkflowExecutionModule } from '../workflow-execution/workflow-execution.module';
import { AIProviderFactory } from '../ai/providers/provider.factory';

@Module({
    imports: [WorkflowExecutionModule],
    controllers: [AgentToolController],
    providers: [ToolAdapterService, AgentChatService, AIProviderFactory],
    exports: [ToolAdapterService, AgentChatService],
})
export class AgentToolModule { }
