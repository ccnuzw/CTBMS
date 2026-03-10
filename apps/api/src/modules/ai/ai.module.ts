import { Module, Global } from '@nestjs/common';
import { AIService } from './ai.service';
import { AIModelService } from './ai-model.service';
import { AIPromptService } from './ai-prompt.service';
import { AIEntityExtractorService } from './ai-entity-extractor.service';
import { RuleEngineService } from './rule-engine.service';
import { PromptService } from './prompt.service';
import { PromptController } from './prompt.controller';
import { AIController } from './ai.controller';
import { AIModelsV1Controller } from './ai-models.v1.controller';
import { AIModelConfigActionsV1Controller } from './ai-model-config-actions.v1.controller';
import { AIProviderFactory } from './providers/provider.factory';
import { ConfigModule } from '../config/config.module';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    AIService,
    AIModelService,
    AIPromptService,
    AIEntityExtractorService,
    RuleEngineService,
    PromptService,
    AIProviderFactory,
  ],
  exports: [
    AIService,
    AIModelService,
    AIPromptService,
    AIEntityExtractorService,
    RuleEngineService,
    PromptService,
    AIProviderFactory,
  ],
  controllers: [PromptController, AIController, AIModelsV1Controller, AIModelConfigActionsV1Controller],
})
export class AIModule {}
