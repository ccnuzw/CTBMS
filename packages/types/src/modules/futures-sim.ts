import { z } from 'zod';

// ── 枚举 ──

export const FuturesExchangeEnum = z.enum(['SHFE', 'DCE', 'CZCE', 'INE', 'CFFEX', 'GFEX', 'OTHER']);
export const PositionDirectionEnum = z.enum(['LONG', 'SHORT']);
export const PositionStatusEnum = z.enum(['OPEN', 'CLOSED', 'PARTIALLY_CLOSED', 'LIQUIDATED']);
export const TradeActionEnum = z.enum(['OPEN_LONG', 'OPEN_SHORT', 'CLOSE_LONG', 'CLOSE_SHORT', 'FORCED_LIQUIDATION']);
export const TradeStatusEnum = z.enum(['PENDING', 'FILLED', 'REJECTED', 'CANCELED']);
export const RiskAlertLevelEnum = z.enum(['NORMAL', 'WARNING', 'DANGER', 'LIQUIDATION']);

// ── 行情快照 ──

export const FuturesQuoteSnapshotSchema = z.object({
  id: z.string().uuid(),
  contractCode: z.string(),
  exchange: FuturesExchangeEnum,
  lastPrice: z.number(),
  openPrice: z.number().nullable().optional(),
  highPrice: z.number().nullable().optional(),
  lowPrice: z.number().nullable().optional(),
  closePrice: z.number().nullable().optional(),
  settlementPrice: z.number().nullable().optional(),
  volume: z.number().int().nullable().optional(),
  openInterest: z.number().int().nullable().optional(),
  bidPrice1: z.number().nullable().optional(),
  askPrice1: z.number().nullable().optional(),
  bidVolume1: z.number().int().nullable().optional(),
  askVolume1: z.number().int().nullable().optional(),
  tradingDay: z.string(),
  snapshotAt: z.date(),
  createdAt: z.date().optional(),
});

export const CreateFuturesQuoteSnapshotSchema = z.object({
  contractCode: z.string().min(1).max(30),
  exchange: FuturesExchangeEnum,
  lastPrice: z.number(),
  openPrice: z.number().optional(),
  highPrice: z.number().optional(),
  lowPrice: z.number().optional(),
  closePrice: z.number().optional(),
  settlementPrice: z.number().optional(),
  volume: z.number().int().optional(),
  openInterest: z.number().int().optional(),
  bidPrice1: z.number().optional(),
  askPrice1: z.number().optional(),
  bidVolume1: z.number().int().optional(),
  askVolume1: z.number().int().optional(),
  tradingDay: z.string().max(10),
  snapshotAt: z.string(),
});

export const FuturesQuoteQuerySchema = z.object({
  contractCode: z.string().optional(),
  exchange: FuturesExchangeEnum.optional(),
  tradingDay: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

// ── 衍生特征 ──

export const FuturesDerivedFeatureSchema = z.object({
  id: z.string().uuid(),
  contractCode: z.string(),
  featureType: z.string(),
  featureValue: z.number(),
  parameters: z.record(z.unknown()).nullable().optional(),
  calculatedAt: z.date(),
  tradingDay: z.string(),
  createdAt: z.date().optional(),
});

export const CalculateFuturesDerivedFeatureSchema = z.object({
  contractCode: z.string().min(1).max(30),
  tradingDay: z.string().min(1).max(10),
  featureTypes: z.array(z.string().min(1).max(60)).max(20).optional(),
});

export const CalculateFuturesDerivedFeatureBatchSchema = z.object({
  tradingDay: z.string().min(1).max(10),
  contractCodes: z.array(z.string().min(1).max(30)).max(200).optional(),
  featureTypes: z.array(z.string().min(1).max(60)).max(20).optional(),
});

export const FuturesDerivedFeatureQuerySchema = z.object({
  contractCode: z.string().optional(),
  featureType: z.string().optional(),
  tradingDay: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export const CalculateFuturesDerivedFeatureResultSchema = z.object({
  contractCode: z.string(),
  tradingDay: z.string(),
  calculatedCount: z.number().int(),
  data: z.array(FuturesDerivedFeatureSchema),
});

export const CalculateFuturesDerivedFeatureBatchResultSchema = z.object({
  tradingDay: z.string(),
  requestedContracts: z.number().int(),
  successContracts: z.number().int(),
  failedContracts: z.number().int(),
  calculatedCount: z.number().int(),
  errors: z.array(
    z.object({
      contractCode: z.string(),
      message: z.string(),
    }),
  ),
});

// ── 虚拟持仓 ──

export const VirtualFuturesPositionSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string(),
  contractCode: z.string(),
  exchange: FuturesExchangeEnum,
  direction: PositionDirectionEnum,
  status: PositionStatusEnum,
  openPrice: z.number(),
  currentPrice: z.number().nullable().optional(),
  quantity: z.number().int(),
  remainingQty: z.number().int(),
  marginRate: z.number(),
  marginAmount: z.number(),
  floatingPnl: z.number().nullable().optional(),
  realizedPnl: z.number().nullable().optional(),
  stopLossPrice: z.number().nullable().optional(),
  takeProfitPrice: z.number().nullable().optional(),
  openedAt: z.date(),
  closedAt: z.date().nullable().optional(),
  ownerUserId: z.string(),
  workflowExecutionId: z.string().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const OpenPositionSchema = z.object({
  accountId: z.string().min(1).max(60),
  contractCode: z.string().min(1).max(30),
  exchange: FuturesExchangeEnum,
  direction: PositionDirectionEnum,
  openPrice: z.number().positive(),
  quantity: z.number().int().min(1),
  marginRate: z.number().min(0.01).max(1).default(0.1),
  stopLossPrice: z.number().positive().optional(),
  takeProfitPrice: z.number().positive().optional(),
  workflowExecutionId: z.string().uuid().optional(),
});

export const ClosePositionSchema = z.object({
  closePrice: z.number().positive(),
  quantity: z.number().int().min(1),
  reason: z.string().max(500).optional(),
});

export const PositionQuerySchema = z.object({
  accountId: z.string().optional(),
  contractCode: z.string().optional(),
  direction: PositionDirectionEnum.optional(),
  status: PositionStatusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ── 虚拟成交流水 ──

export const VirtualTradeLedgerSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string(),
  positionId: z.string().uuid().nullable().optional(),
  contractCode: z.string(),
  exchange: FuturesExchangeEnum,
  action: TradeActionEnum,
  status: TradeStatusEnum,
  price: z.number(),
  quantity: z.number().int(),
  amount: z.number(),
  commission: z.number(),
  realizedPnl: z.number().nullable().optional(),
  reason: z.string().nullable().optional(),
  workflowExecutionId: z.string().nullable().optional(),
  ownerUserId: z.string(),
  tradedAt: z.date(),
  createdAt: z.date().optional(),
});

export const TradeLedgerQuerySchema = z.object({
  accountId: z.string().optional(),
  contractCode: z.string().optional(),
  action: TradeActionEnum.optional(),
  status: TradeStatusEnum.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ── 虚拟账户概览 ──

export const VirtualAccountSummarySchema = z.object({
  accountId: z.string(),
  totalMargin: z.number(),
  availableBalance: z.number(),
  totalFloatingPnl: z.number(),
  totalRealizedPnl: z.number(),
  openPositionCount: z.number().int(),
  riskAlertLevel: RiskAlertLevelEnum,
  marginUsageRate: z.number(),
});

// ── 分页 ──

export const FuturesQuotePageSchema = z.object({
  data: z.array(FuturesQuoteSnapshotSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});

export const PositionPageSchema = z.object({
  data: z.array(VirtualFuturesPositionSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});

export const TradeLedgerPageSchema = z.object({
  data: z.array(VirtualTradeLedgerSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});

export const FuturesDerivedFeaturePageSchema = z.object({
  data: z.array(FuturesDerivedFeatureSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});

// ── Types ──

export type FuturesExchange = z.infer<typeof FuturesExchangeEnum>;
export type PositionDirection = z.infer<typeof PositionDirectionEnum>;
export type PositionStatus = z.infer<typeof PositionStatusEnum>;
export type TradeAction = z.infer<typeof TradeActionEnum>;
export type TradeStatus = z.infer<typeof TradeStatusEnum>;
export type RiskAlertLevel = z.infer<typeof RiskAlertLevelEnum>;

export type FuturesQuoteSnapshotDto = z.infer<typeof FuturesQuoteSnapshotSchema>;
export type CreateFuturesQuoteSnapshotDto = z.infer<typeof CreateFuturesQuoteSnapshotSchema>;
export type FuturesQuoteQueryDto = z.infer<typeof FuturesQuoteQuerySchema>;
export type FuturesDerivedFeatureDto = z.infer<typeof FuturesDerivedFeatureSchema>;
export type CalculateFuturesDerivedFeatureDto = z.infer<typeof CalculateFuturesDerivedFeatureSchema>;
export type CalculateFuturesDerivedFeatureBatchDto = z.infer<
  typeof CalculateFuturesDerivedFeatureBatchSchema
>;
export type FuturesDerivedFeatureQueryDto = z.infer<typeof FuturesDerivedFeatureQuerySchema>;
export type CalculateFuturesDerivedFeatureResultDto = z.infer<typeof CalculateFuturesDerivedFeatureResultSchema>;
export type CalculateFuturesDerivedFeatureBatchResultDto = z.infer<
  typeof CalculateFuturesDerivedFeatureBatchResultSchema
>;
export type VirtualFuturesPositionDto = z.infer<typeof VirtualFuturesPositionSchema>;
export type OpenPositionDto = z.infer<typeof OpenPositionSchema>;
export type ClosePositionDto = z.infer<typeof ClosePositionSchema>;
export type PositionQueryDto = z.infer<typeof PositionQuerySchema>;
export type VirtualTradeLedgerDto = z.infer<typeof VirtualTradeLedgerSchema>;
export type TradeLedgerQueryDto = z.infer<typeof TradeLedgerQuerySchema>;
export type VirtualAccountSummaryDto = z.infer<typeof VirtualAccountSummarySchema>;
export type FuturesQuotePageDto = z.infer<typeof FuturesQuotePageSchema>;
export type FuturesDerivedFeaturePageDto = z.infer<typeof FuturesDerivedFeaturePageSchema>;
export type PositionPageDto = z.infer<typeof PositionPageSchema>;
export type TradeLedgerPageDto = z.infer<typeof TradeLedgerPageSchema>;
