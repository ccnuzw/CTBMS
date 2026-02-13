import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { FuturesSimModule } from '../src/modules/futures-sim';
import { PrismaModule } from '../src/prisma';

@Module({
  imports: [PrismaModule, FuturesSimModule],
})
class FuturesSimE2eModule implements NestModule {
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
  const app = await NestFactory.create(FuturesSimE2eModule, { logger: ['error', 'warn'] });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const ownerUserId = randomUUID();
  const token = `futures_sim_${Date.now()}`;
  const accountId = `${token}_acct`;
  const contractCode = `${token.slice(-10)}_CORN`;
  let positionId = '';

  try {
    const createQuote = await fetchJson<{ id: string; contractCode: string }>(
      `${baseUrl}/futures-sim/quotes`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contractCode,
          exchange: 'DCE',
          lastPrice: 700,
          tradingDay: '2026-02-13',
          snapshotAt: new Date().toISOString(),
        }),
      },
    );
    assert.equal(createQuote.status, 201);
    assert.equal(createQuote.body.contractCode, contractCode);

    const latestQuote = await fetchJson<{ contractCode: string; lastPrice: number }>(
      `${baseUrl}/futures-sim/quotes/latest/${contractCode}`,
      {
        headers: {
          'x-virtual-user-id': ownerUserId,
        },
      },
    );
    assert.equal(latestQuote.status, 200);
    assert.equal(latestQuote.body.contractCode, contractCode);
    assert.equal(latestQuote.body.lastPrice, 700);

    const openPosition = await fetchJson<{ id: string; status: string; remainingQty: number }>(
      `${baseUrl}/futures-sim/positions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          accountId,
          contractCode,
          exchange: 'DCE',
          direction: 'LONG',
          openPrice: 700,
          quantity: 2,
          marginRate: 0.1,
        }),
      },
    );
    assert.equal(openPosition.status, 201);
    assert.equal(openPosition.body.status, 'OPEN');
    assert.equal(openPosition.body.remainingQty, 2);
    positionId = openPosition.body.id;

    const positionPage = await fetchJson<{
      total: number;
      data: Array<{ id: string; accountId: string; contractCode: string }>;
    }>(`${baseUrl}/futures-sim/positions?accountId=${encodeURIComponent(accountId)}`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(positionPage.status, 200);
    assert.ok(positionPage.body.total >= 1);
    assert.ok(positionPage.body.data.some((item) => item.id === positionId));

    const closePosition = await fetchJson<{ status: string; remainingQty: number }>(
      `${baseUrl}/futures-sim/positions/${positionId}/close`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': ownerUserId,
        },
        body: JSON.stringify({
          closePrice: 705,
          quantity: 1,
          reason: 'e2e partial close',
        }),
      },
    );
    assert.equal(closePosition.status, 201);
    assert.equal(closePosition.body.status, 'PARTIALLY_CLOSED');
    assert.equal(closePosition.body.remainingQty, 1);

    const positionDetail = await fetchJson<{
      id: string;
      remainingQty: number;
      status: string;
      trades: Array<{ action: string }>;
    }>(`${baseUrl}/futures-sim/positions/${positionId}`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(positionDetail.status, 200);
    assert.equal(positionDetail.body.id, positionId);
    assert.equal(positionDetail.body.remainingQty, 1);
    assert.equal(positionDetail.body.status, 'PARTIALLY_CLOSED');
    assert.ok(positionDetail.body.trades.length >= 2);

    const tradePage = await fetchJson<{
      total: number;
      data: Array<{ positionId: string | null; action: string }>;
    }>(`${baseUrl}/futures-sim/trades?accountId=${encodeURIComponent(accountId)}`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(tradePage.status, 200);
    assert.ok(tradePage.body.total >= 2);
    assert.ok(tradePage.body.data.some((trade) => trade.positionId === positionId));

    const accountSummary = await fetchJson<{
      accountId: string;
      openPositionCount: number;
      riskAlertLevel: string;
      marginUsageRate: number;
    }>(`${baseUrl}/futures-sim/accounts/${encodeURIComponent(accountId)}/summary`, {
      headers: {
        'x-virtual-user-id': ownerUserId,
      },
    });
    assert.equal(accountSummary.status, 200);
    assert.equal(accountSummary.body.accountId, accountId);
    assert.ok(accountSummary.body.openPositionCount >= 1);
    assert.ok(['NORMAL', 'WARNING', 'DANGER', 'LIQUIDATION'].includes(accountSummary.body.riskAlertLevel));
    assert.ok(accountSummary.body.marginUsageRate >= 0);
  } finally {
    await prisma.virtualTradeLedger.deleteMany({ where: { ownerUserId, accountId } });
    await prisma.virtualFuturesPosition.deleteMany({ where: { ownerUserId, accountId } });
    await prisma.futuresQuoteSnapshot.deleteMany({ where: { contractCode } });
    await app.close();
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    process.stdout.write('futures-sim e2e passed\n');
  })
  .catch((error) => {
    process.stderr.write(`futures-sim e2e failed: ${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
