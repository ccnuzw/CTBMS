import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { AgentProfileModule } from '../src/modules/agent-profile';
import { PrismaModule } from '../src/prisma';

@Module({
  imports: [PrismaModule, AgentProfileModule],
})
class AgentProfileE2eModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MockAuthMiddleware).forRoutes('*');
  }
}

const prisma = new PrismaClient();

const fetchJson = async <T>(
  input: string,
  init: RequestInit,
): Promise<{ status: number; body: T }> => {
  const response = await fetch(input, init);
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  return { status: response.status, body };
};

async function main() {
  const app = await NestFactory.create(AgentProfileE2eModule, { logger: false });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const outsiderUserId = randomUUID();
  const token = `agent_profile_e2e_${Date.now()}`;
  const agentCode = `AGENT_${Date.now()}`;

  try {
    const created = await fetchJson<{ id: string; version: number }>(`${baseUrl}/agent-profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': ownerUserId,
      },
      body: JSON.stringify({
        agentCode,
        agentName: `agent-${token}`,
        roleType: 'ANALYST',
        objective: 'analyze market signal',
        modelConfigKey: 'DEFAULT_MODEL',
        agentPromptCode: 'PROMPT_V1',
        memoryPolicy: 'none',
        toolPolicy: { tools: ['market-data-fetch'] },
        guardrails: { requireEvidence: true },
        outputSchemaCode: 'AGENT_OUTPUT_V1',
        timeoutMs: 30000,
        retryPolicy: { retryCount: 1, retryBackoffMs: 1000 },
        templateSource: 'PRIVATE',
      }),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.version, 1);

    const list = await fetchJson<{
      data: Array<{ id: string; agentCode: string }>;
      total: number;
    }>(`${baseUrl}/agent-profiles?page=1&pageSize=20&includePublic=false`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(list.status, 200);
    assert.ok(
      list.body.data.some((item) => item.id === created.body.id && item.agentCode === agentCode),
    );

    const publish = await fetchJson<{ id: string; version: number }>(
      `${baseUrl}/agent-profiles/${created.body.id}/publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({ comment: 'publish for e2e' }),
      },
    );
    assert.equal(publish.status, 201);
    assert.equal(publish.body.version, 2);

    const outsiderPatch = await fetchJson<{ message?: string }>(
      `${baseUrl}/agent-profiles/${created.body.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': outsiderUserId,
        },
        body: JSON.stringify({ agentName: 'illegal-edit' }),
      },
    );
    assert.equal(outsiderPatch.status, 404);

    console.log('Agent profile e2e checks passed.');
  } finally {
    await prisma.agentProfile
      .deleteMany({
        where: {
          agentCode,
        },
      })
      .catch(() => undefined);
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Agent profile e2e checks failed:', error);
  process.exitCode = 1;
});
