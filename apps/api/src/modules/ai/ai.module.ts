import { Module, Global } from '@nestjs/common';
import { AIService } from './ai.service';
import { RuleEngineService } from './rule-engine.service';

@Global()
@Module({
    providers: [AIService, RuleEngineService],
    exports: [AIService, RuleEngineService],
})
export class AIModule { }
