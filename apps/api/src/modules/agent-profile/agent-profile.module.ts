import { Module } from '@nestjs/common';
import { AgentProfileController } from './agent-profile.controller';
import { AgentProfileService } from './agent-profile.service';

@Module({
  controllers: [AgentProfileController],
  providers: [AgentProfileService],
  exports: [AgentProfileService],
})
export class AgentProfileModule {}
