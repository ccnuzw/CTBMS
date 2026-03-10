import { Controller, Param, Post } from '@nestjs/common';
import { AIModelService } from './ai-model.service';

@Controller('v1/ai-model-configs')
export class AIModelConfigActionsV1Controller {
  constructor(private readonly aiModelService: AIModelService) {}

  @Post(':configKey/actions/test')
  async testConnection(@Param('configKey') configKey: string) {
    return this.aiModelService.testConnection(configKey);
  }
}
