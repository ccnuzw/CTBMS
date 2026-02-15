import { Module } from '@nestjs/common';
import { DecisionRuleController } from './decision-rule.controller';
import { DecisionRuleService } from './decision-rule.service';

@Module({
    controllers: [DecisionRuleController],
    providers: [DecisionRuleService],
    exports: [DecisionRuleService],
})
export class DecisionRuleModule { }
