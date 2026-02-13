import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type {
  CreateFuturesQuoteSnapshotDto,
  FuturesQuoteQueryDto,
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
