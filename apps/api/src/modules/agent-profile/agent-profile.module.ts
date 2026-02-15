import { Module } from '@nestjs/common';
import { AgentProfileController } from './agent-profile.controller';
import { AgentProfileService } from './agent-profile.service';
import { OutputSchemaRegistryService } from './output-schema-registry.service';

@Module({
  controllers: [AgentProfileController],
  providers: [AgentProfileService, OutputSchemaRegistryService],
  exports: [AgentProfileService, OutputSchemaRegistryService],
})
export class AgentProfileModule {}
