import { Module } from '@nestjs/common';
import { DecisionRuleController } from './decision-rule.controller';
import { DecisionRuleService } from './decision-rule.service';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [AIModule],
  controllers: [DecisionRuleController],
  providers: [DecisionRuleService],
  exports: [DecisionRuleService],
})
export class DecisionRuleModule {}
