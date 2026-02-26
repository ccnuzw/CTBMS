import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma';
import { AgentConversationService } from './agent-conversation.service';

@Injectable()
export class AgentConversationEphemeralGovernanceJob {
  private readonly logger = new Logger(AgentConversationEphemeralGovernanceJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentConversationService: AgentConversationService,
  ) {}

  @Cron('*/15 * * * *')
  async run() {
    if (process.env.AGENT_EPHEMERAL_GOVERNANCE_JOB_ENABLED === 'false') {
      return;
    }

    const sessions = await this.prisma.conversationSession.findMany({
      where: {
        updatedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
      select: {
        id: true,
        ownerUserId: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 80,
    });

    let processed = 0;
    let failed = 0;
    for (const session of sessions) {
      try {
        await this.agentConversationService.applyEphemeralCapabilityEvolutionPlan(
          session.ownerUserId,
          session.id,
          { window: '7d' },
        );
        processed += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `ephemeral governance failed for session ${session.id}: ${(error as Error)?.message ?? 'unknown'}`,
        );
      }
    }

    this.logger.log(
      `ephemeral governance done: processed=${processed}, failed=${failed}, sessionCount=${sessions.length}`,
    );
  }
}
