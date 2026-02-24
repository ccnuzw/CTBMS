import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { ScheduleModule } from '@nestjs/schedule';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { AgentConversationModule } from '../src/modules/agent-conversation';
import { WorkflowExecutionModule } from '../src/modules/workflow-execution';
import { ReportExportModule } from '../src/modules/report-export';
import { AgentSkillModule } from '../src/modules/agent-skill';
import { PrismaModule } from '../src/prisma';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AgentSkillModule,
    WorkflowExecutionModule,
    ReportExportModule,
    AgentConversationModule,
  ],
})
class AgentConversationDeliveryFailureE2eModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MockAuthMiddleware).forRoutes('*');
  }
}

const prisma = new PrismaClient();

const fetchJson = async <T>(input: string, init?: RequestInit): Promise<{ status: number; body: T }> => {
  const response = await fetch(input, init);
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  return { status: response.status, body };
};

async function main() {
  const app = await NestFactory.create(AgentConversationDeliveryFailureE2eModule, {
    logger: ['error', 'warn'],
  });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const token = `agent_delivery_failure_${Date.now()}`;
  let conversationSessionId = '';
  let fakeExportTaskId = '';

  try {
    await prisma.user.create({
      data: {
        id: ownerUserId,
        username: `${token}_user`,
        email: `${token}@example.com`,
        name: `Agent Delivery Failure ${token}`,
      },
    });

    const session = await fetchJson<{ id: string }>(`${baseUrl}/agent-conversations/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({ title: 'Delivery Failure Session' }),
    });
    assert.equal(session.status, 201);
    conversationSessionId = session.body.id;

    const fakeExportTask = await prisma.exportTask.create({
      data: {
        workflowExecutionId: randomUUID(),
        format: 'PDF',
        status: 'PROCESSING',
        sections: ['CONCLUSION'],
        createdByUserId: ownerUserId,
      },
    });
    fakeExportTaskId = fakeExportTask.id;

    const deliver = await fetchJson<{ code?: string; message?: string }>(
      `${baseUrl}/agent-conversations/sessions/${conversationSessionId}/deliver/email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          exportTaskId: fakeExportTaskId,
          to: [`${token}@mail.test`],
          subject: 'Failure Test',
          content: 'Failure Test Body',
        }),
      },
    );

    assert.equal(deliver.status, 400);
    assert.equal(deliver.body.code, 'CONV_EXPORT_TASK_NOT_READY');
  } finally {
    if (fakeExportTaskId) {
      await prisma.exportTask.deleteMany({ where: { id: fakeExportTaskId } });
    }
    if (conversationSessionId) {
      await prisma.conversationSession.deleteMany({ where: { id: conversationSessionId } });
    }
    await prisma.user.deleteMany({ where: { id: ownerUserId } });
    await app.close();
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    process.stdout.write('agent-conversation-delivery-failure e2e passed\n');
  })
  .catch((error) => {
    process.stderr.write(
      `agent-conversation-delivery-failure e2e failed: ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exit(1);
  });
