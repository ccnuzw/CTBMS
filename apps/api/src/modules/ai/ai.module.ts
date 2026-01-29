import { Module, Global } from '@nestjs/common';
import { AIService } from './ai.service';
import { RuleEngineService } from './rule-engine.service';
import { PromptService } from './prompt.service';
import { PromptController } from './prompt.controller';
import { AIController } from './ai.controller';

@Global()
@Module({
    providers: [AIService, RuleEngineService, PromptService],
    exports: [AIService, RuleEngineService, PromptService],
    controllers: [PromptController, AIController],
})
export class AIModule { }
