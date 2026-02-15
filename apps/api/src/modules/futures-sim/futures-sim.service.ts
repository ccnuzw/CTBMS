import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type {
  CreateFuturesQuoteSnapshotDto,
  FuturesQuoteQueryDto,
  CalculateFuturesDerivedFeatureDto,
  CalculateFuturesDerivedFeatureBatchDto,
  FuturesDerivedFeatureQueryDto,
  OpenPositionDto,
  ClosePositionDto,
  PositionQueryDto,
  TradeLedgerQueryDto,
  VirtualAccountSummaryDto,
} from '@packages/types';
import type { Prisma } from '@prisma/client';

@Injectable()
export class FuturesSimService {
  private readonly logger = new Logger(FuturesSimService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── 行情快照 ──

  async createQuoteSnapshot(dto: CreateFuturesQuoteSnapshotDto) {
    return this.prisma.futuresQuoteSnapshot.create({
      data: {
        ...dto,
        snapshotAt: new Date(dto.snapshotAt),
      },
    });
  }

  async createQuoteSnapshotBatch(snapshots: CreateFuturesQuoteSnapshotDto[]) {
    const result = await this.prisma.futuresQuoteSnapshot.createMany({
      data: snapshots.map((s) => ({
        ...s,
        snapshotAt: new Date(s.snapshotAt),
      })),
    });
    return { count: result.count };
  }

  async findQuoteSnapshots(query: FuturesQuoteQueryDto) {
    const where: Prisma.FuturesQuoteSnapshotWhereInput = {};
    if (query.contractCode) where.contractCode = query.contractCode;
    if (query.exchange) where.exchange = query.exchange;
    if (query.tradingDay) where.tradingDay = query.tradingDay;
    if (query.startDate || query.endDate) {
      where.snapshotAt = {};
      if (query.startDate) where.snapshotAt.gte = new Date(query.startDate);
      if (query.endDate) where.snapshotAt.lte = new Date(query.endDate);
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const [data, total] = await Promise.all([
      this.prisma.futuresQuoteSnapshot.findMany({
        where,
        orderBy: { snapshotAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.futuresQuoteSnapshot.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getLatestQuote(contractCode: string) {
    const quote = await this.prisma.futuresQuoteSnapshot.findFirst({
      where: { contractCode },
      orderBy: { snapshotAt: 'desc' },
    });
    if (!quote) throw new NotFoundException(`合约 ${contractCode} 无行情数据`);
    return quote;
  }

  // ── 衍生特征 ──

  async calculateDerivedFeatures(dto: CalculateFuturesDerivedFeatureDto) {
    const quotes = await this.prisma.futuresQuoteSnapshot.findMany({
      where: {
        contractCode: dto.contractCode,
        tradingDay: dto.tradingDay,
      },
      orderBy: {
        snapshotAt: 'asc',
      },
      select: {
        lastPrice: true,
        volume: true,
        openInterest: true,
        snapshotAt: true,
      },
    });

    if (quotes.length < 2) {
      throw new BadRequestException(
        `合约 ${dto.contractCode} 在 ${dto.tradingDay} 的行情样本不足，至少需要 2 条快照`,
      );
    }

    const firstQuote = quotes[0];
    const lastQuote = quotes[quotes.length - 1];
    if (!firstQuote?.lastPrice || !lastQuote?.lastPrice) {
      throw new BadRequestException('行情快照缺少有效 lastPrice，无法计算衍生特征');
    }

    const prices = quotes.map((item) => item.lastPrice);
    const highPrice = Math.max(...prices);
    const lowPrice = Math.min(...prices);
    const volumeSum = quotes.reduce((sum, item) => sum + (item.volume ?? 0), 0);
    const firstOpenInterest = quotes.find((item) => item.openInterest !== null)?.openInterest ?? null;
    const lastOpenInterest =
      [...quotes].reverse().find((item) => item.openInterest !== null)?.openInterest ?? null;

    const supportedFeatures = new Map<string, number>([
      ['INTRADAY_RETURN_PCT', ((lastQuote.lastPrice - firstQuote.lastPrice) / firstQuote.lastPrice) * 100],
      ['INTRADAY_RANGE_PCT', ((highPrice - lowPrice) / firstQuote.lastPrice) * 100],
      ['VOLUME_SUM', volumeSum],
      [
        'OPEN_INTEREST_CHANGE',
        firstOpenInterest !== null && lastOpenInterest !== null
          ? lastOpenInterest - firstOpenInterest
          : 0,
      ],
    ]);

    const requestedFeatureTypes = dto.featureTypes?.length
      ? Array.from(new Set(dto.featureTypes.map((item) => item.trim()).filter(Boolean)))
      : [...supportedFeatures.keys()];
    const unsupported = requestedFeatureTypes.filter((item) => !supportedFeatures.has(item));
    if (unsupported.length > 0) {
      throw new BadRequestException(`不支持的衍生特征类型: ${unsupported.join(', ')}`);
    }

    const calculatedAt = new Date();
    const savedFeatures = [];
    for (const featureType of requestedFeatureTypes) {
      const featureValue = supportedFeatures.get(featureType);
      if (featureValue === undefined || Number.isNaN(featureValue)) {
        continue;
      }

      const existing = await this.prisma.futuresDerivedFeature.findFirst({
        where: {
          contractCode: dto.contractCode,
          tradingDay: dto.tradingDay,
          featureType,
        },
        orderBy: { createdAt: 'desc' },
      });

      const payload: Prisma.FuturesDerivedFeatureUncheckedCreateInput = {
        contractCode: dto.contractCode,
        tradingDay: dto.tradingDay,
        featureType,
        featureValue,
        calculatedAt,
        parameters: {
          sampleSize: quotes.length,
          firstSnapshotAt: firstQuote.snapshotAt.toISOString(),
          lastSnapshotAt: lastQuote.snapshotAt.toISOString(),
        },
      };

      if (existing) {
        const updated = await this.prisma.futuresDerivedFeature.update({
          where: { id: existing.id },
          data: payload,
        });
        savedFeatures.push(updated);
      } else {
        const created = await this.prisma.futuresDerivedFeature.create({
          data: payload,
        });
        savedFeatures.push(created);
      }
    }

    return {
      contractCode: dto.contractCode,
      tradingDay: dto.tradingDay,
      calculatedCount: savedFeatures.length,
      data: savedFeatures,
    };
  }

  async calculateDerivedFeaturesBatch(dto: CalculateFuturesDerivedFeatureBatchDto) {
    let contractCodes = this.uniqueContractCodes(dto.contractCodes);
    if (contractCodes.length === 0) {
      const rows = await this.prisma.futuresQuoteSnapshot.findMany({
        where: {
          tradingDay: dto.tradingDay,
        },
        select: {
          contractCode: true,
        },
        distinct: ['contractCode'],
      });
      contractCodes = rows.map((item) => item.contractCode);
    }

    if (contractCodes.length === 0) {
      throw new BadRequestException(`交易日 ${dto.tradingDay} 无可计算合约`);
    }

    let calculatedCount = 0;
    const errors: Array<{ contractCode: string; message: string }> = [];

    for (const contractCode of contractCodes) {
      try {
        const result = await this.calculateDerivedFeatures({
          contractCode,
          tradingDay: dto.tradingDay,
          featureTypes: dto.featureTypes,
        });
        calculatedCount += result.calculatedCount;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ contractCode, message });
      }
    }

    return {
      tradingDay: dto.tradingDay,
      requestedContracts: contractCodes.length,
      successContracts: contractCodes.length - errors.length,
      failedContracts: errors.length,
      calculatedCount,
      errors,
    };
  }

  async findDerivedFeatures(query: FuturesDerivedFeatureQueryDto) {
    const where: Prisma.FuturesDerivedFeatureWhereInput = {};
    if (query.contractCode) where.contractCode = query.contractCode;
    if (query.featureType) where.featureType = query.featureType;
    if (query.tradingDay) where.tradingDay = query.tradingDay;

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [data, total] = await Promise.all([
      this.prisma.futuresDerivedFeature.findMany({
        where,
        orderBy: [{ tradingDay: 'desc' }, { calculatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.futuresDerivedFeature.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  private uniqueContractCodes(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    const set = new Set<string>();
    for (const item of value) {
      if (typeof item !== 'string') {
        continue;
      }
      const normalized = item.trim();
      if (!normalized) {
        continue;
      }
      set.add(normalized);
    }
    return [...set];
  }

  // ── Mock Data Generation ──

  async generateMockData(contractCode: string, days: number = 5) {
    const now = new Date();
    const snapshots: CreateFuturesQuoteSnapshotDto[] = [];
    const basePrice = 3000 + Math.random() * 500;

    for (let d = days; d >= 0; d--) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      const tradingDay = date.toISOString().slice(0, 10);

      // Simulate trading hours (9:00 - 15:00) with 30 min intervals
      for (let h = 9; h <= 15; h++) {
        if (h === 12) continue; // Lunch break
        for (let m = 0; m < 60; m += 30) {
          if (h === 15 && m > 0) break;

          const time = new Date(date);
          time.setHours(h, m, 0, 0);

          // Generate realistic-ish price movement (sine wave + random walk)
          const trend = Math.sin(time.getTime() / 10000000) * 50;
          const noise = (Math.random() - 0.5) * 20;
          const lastPrice = basePrice + trend + noise;

          snapshots.push({
            contractCode,
            exchange: 'SHFE',
            lastPrice: Number(lastPrice.toFixed(2)),
            openPrice: Number((lastPrice - 10).toFixed(2)),
            highPrice: Number((lastPrice + 15).toFixed(2)),
            lowPrice: Number((lastPrice - 15).toFixed(2)),
            volume: Math.floor(Math.random() * 10000),
            openInterest: Math.floor(Math.random() * 50000 + 50000),
            tradingDay,
            snapshotAt: time.toISOString(),
          });
        }
      }
    }

    return this.createQuoteSnapshotBatch(snapshots);
  }

  // ── 虚拟持仓 ──

  async openPosition(userId: string, dto: OpenPositionDto) {
    const marginAmount = dto.openPrice * dto.quantity * dto.marginRate;

    const position = await this.prisma.virtualFuturesPosition.create({
      data: {
        accountId: dto.accountId,
        contractCode: dto.contractCode,
        exchange: dto.exchange,
        direction: dto.direction,
        status: 'OPEN',
        openPrice: dto.openPrice,
        currentPrice: dto.openPrice,
        quantity: dto.quantity,
        remainingQty: dto.quantity,
        marginRate: dto.marginRate,
        marginAmount,
        floatingPnl: 0,
        realizedPnl: 0,
        stopLossPrice: dto.stopLossPrice,
        takeProfitPrice: dto.takeProfitPrice,
        openedAt: new Date(),
        ownerUserId: userId,
        workflowExecutionId: dto.workflowExecutionId,
      },
    });

    // 记录开仓流水
    const action = dto.direction === 'LONG' ? 'OPEN_LONG' : 'OPEN_SHORT';
    await this.prisma.virtualTradeLedger.create({
      data: {
        accountId: dto.accountId,
        positionId: position.id,
        contractCode: dto.contractCode,
        exchange: dto.exchange,
        action,
        status: 'FILLED',
        price: dto.openPrice,
        quantity: dto.quantity,
        amount: dto.openPrice * dto.quantity,
        commission: 0,
        ownerUserId: userId,
        workflowExecutionId: dto.workflowExecutionId,
        tradedAt: new Date(),
      },
    });

    this.logger.log(`开仓: ${dto.contractCode} ${dto.direction} ${dto.quantity}手 @ ${dto.openPrice}`);
    return position;
  }

  async closePosition(userId: string, positionId: string, dto: ClosePositionDto) {
    const position = await this.prisma.virtualFuturesPosition.findFirst({
      where: { id: positionId, ownerUserId: userId },
    });
    if (!position) throw new NotFoundException('持仓不存在');
    if (position.status === 'CLOSED' || position.status === 'LIQUIDATED') {
      throw new BadRequestException('持仓已平仓');
    }
    if (dto.quantity > position.remainingQty) {
      throw new BadRequestException(`平仓数量 ${dto.quantity} 超过剩余持仓 ${position.remainingQty}`);
    }

    // 计算盈亏
    const priceDiff = position.direction === 'LONG'
      ? dto.closePrice - position.openPrice
      : position.openPrice - dto.closePrice;
    const realizedPnl = priceDiff * dto.quantity;

    const newRemainingQty = position.remainingQty - dto.quantity;
    const newStatus = newRemainingQty === 0 ? 'CLOSED' : 'PARTIALLY_CLOSED';

    const updated = await this.prisma.virtualFuturesPosition.update({
      where: { id: positionId },
      data: {
        remainingQty: newRemainingQty,
        status: newStatus,
        realizedPnl: { increment: realizedPnl },
        closedAt: newRemainingQty === 0 ? new Date() : undefined,
      },
    });

    // 记录平仓流水
    const action = position.direction === 'LONG' ? 'CLOSE_LONG' : 'CLOSE_SHORT';
    await this.prisma.virtualTradeLedger.create({
      data: {
        accountId: position.accountId,
        positionId: position.id,
        contractCode: position.contractCode,
        exchange: position.exchange,
        action,
        status: 'FILLED',
        price: dto.closePrice,
        quantity: dto.quantity,
        amount: dto.closePrice * dto.quantity,
        commission: 0,
        realizedPnl,
        reason: dto.reason,
        ownerUserId: userId,
        tradedAt: new Date(),
      },
    });

    this.logger.log(`平仓: ${position.contractCode} ${dto.quantity}手 @ ${dto.closePrice}, PnL: ${realizedPnl.toFixed(2)}`);
    return updated;
  }

  async findPositions(userId: string, query: PositionQueryDto) {
    const where: Prisma.VirtualFuturesPositionWhereInput = { ownerUserId: userId };
    if (query.accountId) where.accountId = query.accountId;
    if (query.contractCode) where.contractCode = query.contractCode;
    if (query.direction) where.direction = query.direction;
    if (query.status) where.status = query.status;

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [data, total] = await Promise.all([
      this.prisma.virtualFuturesPosition.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.virtualFuturesPosition.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getPositionDetail(userId: string, id: string) {
    const position = await this.prisma.virtualFuturesPosition.findFirst({
      where: { id, ownerUserId: userId },
      include: { trades: { orderBy: { tradedAt: 'desc' } } },
    });
    if (!position) throw new NotFoundException('持仓不存在');
    return position;
  }

  // ── 成交流水 ──

  async findTrades(userId: string, query: TradeLedgerQueryDto) {
    const where: Prisma.VirtualTradeLedgerWhereInput = { ownerUserId: userId };
    if (query.accountId) where.accountId = query.accountId;
    if (query.contractCode) where.contractCode = query.contractCode;
    if (query.action) where.action = query.action;
    if (query.status) where.status = query.status;
    if (query.startDate || query.endDate) {
      where.tradedAt = {};
      if (query.startDate) where.tradedAt.gte = new Date(query.startDate);
      if (query.endDate) where.tradedAt.lte = new Date(query.endDate);
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [data, total] = await Promise.all([
      this.prisma.virtualTradeLedger.findMany({
        where,
        orderBy: { tradedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.virtualTradeLedger.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  // ── 账户概览 ──

  async getAccountSummary(userId: string, accountId: string): Promise<VirtualAccountSummaryDto> {
    const openPositions = await this.prisma.virtualFuturesPosition.findMany({
      where: { ownerUserId: userId, accountId, status: { in: ['OPEN', 'PARTIALLY_CLOSED'] } },
    });

    const totalMargin = openPositions.reduce((sum, p) => sum + p.marginAmount, 0);
    const totalFloatingPnl = openPositions.reduce((sum, p) => sum + (p.floatingPnl ?? 0), 0);

    // 已实现盈亏（所有已关闭持仓）
    const closedPositions = await this.prisma.virtualFuturesPosition.findMany({
      where: { ownerUserId: userId, accountId, status: { in: ['CLOSED', 'LIQUIDATED'] } },
      select: { realizedPnl: true },
    });
    const totalRealizedPnl = closedPositions.reduce((sum, p) => sum + (p.realizedPnl ?? 0), 0);

    // 简化的可用余额（假设初始资金 1,000,000）
    const initialBalance = 1_000_000;
    const availableBalance = initialBalance - totalMargin + totalRealizedPnl + totalFloatingPnl;

    const marginUsageRate = initialBalance > 0 ? totalMargin / initialBalance : 0;

    let riskAlertLevel: 'NORMAL' | 'WARNING' | 'DANGER' | 'LIQUIDATION' = 'NORMAL';
    if (marginUsageRate >= 0.9) riskAlertLevel = 'LIQUIDATION';
    else if (marginUsageRate >= 0.7) riskAlertLevel = 'DANGER';
    else if (marginUsageRate >= 0.5) riskAlertLevel = 'WARNING';

    return {
      accountId,
      totalMargin,
      availableBalance,
      totalFloatingPnl,
      totalRealizedPnl,
      openPositionCount: openPositions.length,
      riskAlertLevel,
      marginUsageRate,
    };
  }
}
