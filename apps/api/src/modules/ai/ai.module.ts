import { Module, Global } from '@nestjs/common';
import { AIService } from './ai.service';
import { RuleEngineService } from './rule-engine.service';
import { PromptService } from './prompt.service';
import { PromptController } from './prompt.controller';
import { AIController } from './ai.controller';
import { AIProviderFactory } from './providers/provider.factory';

@Global()
@Module({
    providers: [AIService, RuleEngineService, PromptService, AIProviderFactory],
    exports: [AIService, RuleEngineService, PromptService, AIProviderFactory],
    controllers: [PromptController, AIController],
})
export class AIModule { }
