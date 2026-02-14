import { Module } from '@nestjs/common';
import { AgentPromptTemplateController } from './agent-prompt-template.controller';
import { AgentPromptTemplateService } from './agent-prompt-template.service';
import { AgentProfileModule } from '../agent-profile';

@Module({
    imports: [AgentProfileModule],
    controllers: [AgentPromptTemplateController],
    providers: [AgentPromptTemplateService],
    exports: [AgentPromptTemplateService],
})
export class AgentPromptTemplateModule { }
