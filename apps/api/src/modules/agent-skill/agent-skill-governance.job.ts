import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AgentSkillService } from './agent-skill.service';

@Injectable()
export class AgentSkillGovernanceJob {
  private readonly logger = new Logger(AgentSkillGovernanceJob.name);

  constructor(private readonly agentSkillService: AgentSkillService) {}

  @Cron('*/5 * * * *')
  async expireRuntimeGrants() {
    const result = await this.agentSkillService.runGovernanceHousekeeping();
    if (result.expiredGrantCount > 0) {
      this.logger.log(
        `governance housekeeping expired=${result.expiredGrantCount} disabledDrafts=${result.disabledDraftCount}`,
      );
    }
  }
}
