import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  LineageDataset,
  StandardEventRecord,
  StandardFuturesRecord,
  StandardSpotRecord,
  StandardizationPreviewDto,
} from '@packages/types';
import {
  StandardEventRecordSchema,
  StandardFuturesRecordSchema,
  StandardSpotRecordSchema,
} from '@packages/types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { ConfigService } from '../config/config.service';
import {
  parseOptionalDate,
  parsePositiveInteger,
  toUtcDateKey,
} from './services/market-data.helpers';
import { MarketDataPersistenceService } from './services/market-data-persistence.service';
import { MarketDataCutoverService } from './services/market-data-cutover.service';
import { MarketDataReconciliationService } from './services/market-data-reconciliation.service';
import type {
  StandardDataset,
  ReconciliationJobStatus,
  AggregateOp,
  MarketDataAggregateMetricInput,
  StandardizedQueryOptions,
  StandardizedDataQualityScore,
  StandardizedDataFreshness,
  StandardizedDataMeta,
  WeatherLogisticsImpactIndexQueryInput,
  WeatherLogisticsRiskLevel,
  WeatherLogisticsImpactIndexPoint,
  WeatherLogisticsComputationBucket,
  ReconciliationGateEvaluationResult,
  ReconciliationWindowMetricsResult,
  ReconciliationDailyMetricsHistoryResult,
  ReconciliationReadCoverageMetricsResult,
  ReconciliationM1ReadinessResult,
  ReconciliationM1ReadinessReportResult,
  ReconciliationM1ReadinessReportSnapshotResult,
  ReconciliationCutoverDecisionResult,
  ReconciliationGateReason,
} from './services/market-data.types';
import {
  COMMODITY_CODE_MAP,
  MARKET_INTEL_EVENT_TYPE_MAP,
  RECONCILIATION_GATE_REASON,
  STANDARD_RECONCILIATION_DATASETS,
} from './services/market-data.types';

export type {
  ReconciliationGateEvaluationResult,
  ReconciliationWindowMetricsResult,
  ReconciliationDailyMetricsHistoryResult,
  ReconciliationReadCoverageMetricsResult,
  ReconciliationM1ReadinessResult,
  ReconciliationM1ReadinessReportResult,
  ReconciliationM1ReadinessReportSnapshotResult,
  ReconciliationCutoverDecisionResult,
  ReconciliationGateReason,
};
export { RECONCILIATION_GATE_REASON, STANDARD_RECONCILIATION_DATASETS };

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly persistenceService: MarketDataPersistenceService,
    readonly cutoverService: MarketDataCutoverService,
    readonly reconciliationService: MarketDataReconciliationService,
  ) {
    this.reconciliationService.setDelegate({
      queryStandardizedData: (dataset, options) =>
        this.queryStandardizedData(dataset, options),
      querySpot: (filters, limit, from, to) =>
        this.querySpot(filters, limit, from, to),
      queryFutures: (filters, limit, from, to) =>
        this.queryFutures(filters, limit, from, to),
      queryMarketEvent: (filters, limit, from, to) =>
        this.queryMarketEvent(filters, limit, from, to),
      validateStandardSpotRecord: (row) =>
        this.validateStandardSpotRecord(row as StandardSpotRecord),
      validateStandardFuturesRecord: (row) =>
        this.validateStandardFuturesRecord(row as StandardFuturesRecord),
      validateStandardEventRecord: (row) =>
        this.validateStandardEventRecord(row as StandardEventRecord),
    });
    this.cutoverService.setDelegate({
      createReconciliationM1ReadinessReportSnapshot: (userId, dto) =>
        this.reconciliationService.createReconciliationM1ReadinessReportSnapshot(
          userId,
          dto,
        ),
      createReconciliationRollbackDrill: (userId, dto) =>
        this.reconciliationService.createReconciliationRollbackDrill(
          userId,
          dto as Parameters<
            MarketDataReconciliationService['createReconciliationRollbackDrill']
          >[1],
        ),
      getLatestRollbackDrillsByDataset: (datasets) =>
        this.reconciliationService.getLatestRollbackDrillsByDataset(datasets),
    });
  }

  async previewStandardization(dto: StandardizationPreviewDto) {
    if (dto.dataset === 'PRICE_DATA') {
      const rows = await this.querySpot(dto.filters, dto.sampleLimit);
      this.enforceStandardDataSchema('SPOT_PRICE', rows);
      return {
        dataset: dto.dataset,
        mappingVersion: dto.mappingVersion,
        previewRows: rows.map((row) => ({
          legacy: {
            id: row.recordId,
            commodity: row.commodityCode,
            regionCode: row.regionCode,
            price: row.spotPrice,
            effectiveDate: row.dataTime,
          },
          standard: row,
          issues: this.validateStandardSpotRecord(row),
        })),
        issues: rows.flatMap((row) =>
          this.validateStandardSpotRecord(row).map((issue) => ({ recordId: row.recordId, issue })),
        ),
        generatedAt: new Date().toISOString(),
      };
    }

    if (dto.dataset === 'FUTURES_QUOTE_SNAPSHOT') {
      const rows = await this.queryFutures(dto.filters, dto.sampleLimit);
      this.enforceStandardDataSchema('FUTURES_QUOTE', rows);
      return {
        dataset: dto.dataset,
        mappingVersion: dto.mappingVersion,
        previewRows: rows.map((row) => ({
          legacy: {
            id: row.recordId,
            contractCode: row.contractCode,
            exchange: row.exchangeCode,
            closePrice: row.closePrice,
            snapshotAt: row.dataTime,
          },
          standard: row,
          issues: this.validateStandardFuturesRecord(row),
        })),
        issues: rows.flatMap((row) =>
          this.validateStandardFuturesRecord(row).map((issue) => ({
            recordId: row.recordId,
            issue,
          })),
        ),
        generatedAt: new Date().toISOString(),
      };
    }

    const rows = await this.queryMarketEvent(dto.filters, dto.sampleLimit);
    this.enforceStandardDataSchema('MARKET_EVENT', rows);
    return {
      dataset: dto.dataset,
      mappingVersion: dto.mappingVersion,
      previewRows: rows.map((row) => ({
        legacy: {
          id: row.recordId,
          title: row.title,
          summary: row.summary,
          publishedAt: row.publishedAt,
        },
        standard: row,
        issues: this.validateStandardEventRecord(row),
      })),
      issues: rows.flatMap((row) =>
        this.validateStandardEventRecord(row).map((issue) => ({ recordId: row.recordId, issue })),
      ),
      generatedAt: new Date().toISOString(),
    };
  }

  async getLineage(dataset: LineageDataset, recordId: string) {
    if (dataset === 'SPOT_PRICE') {
      const record = await this.prisma.priceData.findUnique({
        where: { id: recordId },
        select: {
          id: true,
          sourceType: true,
          intelId: true,
          knowledgeId: true,
          submissionId: true,
          effectiveDate: true,
          updatedAt: true,
        },
      });
      if (!record) {
        throw new NotFoundException('spot price record not found');
      }

      return {
        dataset,
        recordId,
        source: {
          sourceType: String(record.sourceType),
          sourceRecordId: record.id,
          intelId: record.intelId,
          knowledgeId: record.knowledgeId,
          submissionId: record.submissionId,
        },
        mapping: {
          mappingVersion: 'v1',
          schemaVersion: 'v1',
          lineageVersion: 'v1',
          ruleSetId: 'price_data_mapping_v1',
          metricVersions: {
            MKT_SPOT_AVG_7D: 'v1',
            MKT_SPOT_PCT_CHG_7D: 'v1',
            BASIS_MAIN: 'v1',
          },
        },
        derivedMetrics: ['MKT_SPOT_AVG_7D', 'MKT_SPOT_PCT_CHG_7D', 'BASIS_MAIN'],
        timestamps: {
          dataTime: record.effectiveDate.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
        },
      };
    }

    if (dataset === 'FUTURES_QUOTE') {
      const record = await this.prisma.futuresQuoteSnapshot.findUnique({
        where: { id: recordId },
        select: {
          id: true,
          exchange: true,
          contractCode: true,
          snapshotAt: true,
          createdAt: true,
        },
      });
      if (!record) {
        throw new NotFoundException('futures quote record not found');
      }

      return {
        dataset,
        recordId,
        source: {
          sourceType: 'FUTURES_API',
          sourceRecordId: record.id,
          exchange: record.exchange,
          contractCode: record.contractCode,
        },
        mapping: {
          mappingVersion: 'v1',
          schemaVersion: 'v1',
          lineageVersion: 'v1',
          ruleSetId: 'futures_quote_mapping_v1',
          metricVersions: {
            FUT_CLOSE_PCT_CHG_1D: 'v1',
            VOLATILITY_20D: 'v1',
          },
        },
        derivedMetrics: ['FUT_CLOSE_PCT_CHG_1D', 'VOLATILITY_20D'],
        timestamps: {
          dataTime: record.snapshotAt.toISOString(),
          updatedAt: record.createdAt.toISOString(),
        },
      };
    }

    const event = await this.prisma.marketEvent.findUnique({
      where: { id: recordId },
      select: {
        id: true,
        intelId: true,
        knowledgeId: true,
        eventTypeId: true,
        eventDate: true,
        createdAt: true,
      },
    });

    if (event) {
      return {
        dataset,
        recordId,
        source: {
          sourceType: 'MARKET_EVENT',
          sourceRecordId: event.id,
          intelId: event.intelId,
          knowledgeId: event.knowledgeId,
          eventTypeId: event.eventTypeId,
        },
        mapping: {
          mappingVersion: 'v1',
          schemaVersion: 'v1',
          lineageVersion: 'v1',
          ruleSetId: 'market_event_mapping_v1',
          metricVersions: {
            SUPPLY_STRESS_IDX: 'v1',
            ALERT_SEVERITY: 'v1',
          },
        },
        derivedMetrics: ['SUPPLY_STRESS_IDX', 'ALERT_SEVERITY'],
        timestamps: {
          dataTime: event.eventDate?.toISOString() ?? event.createdAt.toISOString(),
          updatedAt: event.createdAt.toISOString(),
        },
      };
    }

    const intel = await this.prisma.marketIntel.findUnique({
      where: { id: recordId },
      select: {
        id: true,
        sourceType: true,
        effectiveTime: true,
        updatedAt: true,
      },
    });

    if (!intel) {
      throw new NotFoundException('market event/intel record not found');
    }

    return {
      dataset,
      recordId,
      source: {
        sourceType: String(intel.sourceType),
        sourceRecordId: intel.id,
      },
      mapping: {
        mappingVersion: 'v1',
        schemaVersion: 'v1',
        lineageVersion: 'v1',
        ruleSetId: 'market_intel_mapping_v1',
        metricVersions: {
          SUPPLY_STRESS_IDX: 'v1',
          ALERT_SEVERITY: 'v1',
        },
      },
      derivedMetrics: ['SUPPLY_STRESS_IDX', 'ALERT_SEVERITY'],
      timestamps: {
        dataTime: intel.effectiveTime.toISOString(),
        updatedAt: intel.updatedAt.toISOString(),
      },
    };
  }

  async getWeatherLogisticsImpactIndex(query: WeatherLogisticsImpactIndexQueryInput) {
    const now = new Date();
    const requestedTo = parseOptionalDate(query.to);
    const to = requestedTo ?? now;

    const normalizedWindowDays = Math.min(
      90,
      Math.max(1, parsePositiveInteger(query.windowDays) ?? 14),
    );
    const requestedFrom = parseOptionalDate(query.from);
    const from =
      requestedFrom ?? new Date(to.getTime() - (normalizedWindowDays - 1) * 24 * 60 * 60 * 1000);

    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('from 必须小于或等于 to');
    }

    const commodityCode =
      typeof query.commodityCode === 'string' && query.commodityCode.trim().length > 0
        ? query.commodityCode.trim()
        : undefined;
    const regionCode =
      typeof query.regionCode === 'string' && query.regionCode.trim().length > 0
        ? query.regionCode.trim()
        : undefined;

    const commodityCandidates = commodityCode
      ? Array.from(new Set(this.resolveCommodityCandidates(commodityCode)))
      : [];

    const dailyBuckets = this.buildDateKeysInRange(from, to);
    const dailyMap = new Map<string, WeatherLogisticsComputationBucket>(
      dailyBuckets.map((date): [string, WeatherLogisticsComputationBucket] => [
        date,
        {
          date,
          weatherSignal: 0,
          logisticsSignal: 0,
          weatherEventCount: 0,
          logisticsEventCount: 0,
          freightValues: [],
        },
      ]),
    );

    const priceRows = await this.prisma.priceData.findMany({
      where: {
        effectiveDate: {
          gte: from,
          lte: to,
        },
        ...(commodityCandidates.length > 0 ? { commodity: { in: commodityCandidates } } : {}),
        ...(regionCode ? { regionCode } : {}),
      },
      select: {
        effectiveDate: true,
        freight: true,
      },
      orderBy: [{ effectiveDate: 'asc' }],
    });

    for (const row of priceRows) {
      if (row.freight === null || row.freight === undefined) {
        continue;
      }
      const freight = Number(row.freight);
      if (!Number.isFinite(freight)) {
        continue;
      }
      const dateKey = toUtcDateKey(row.effectiveDate);
      const bucket = dailyMap.get(dateKey);
      if (bucket) {
        bucket.freightValues.push(freight);
      }
    }

    const weatherEvents = await this.prisma.marketEvent.findMany({
      where: {
        eventDate: {
          gte: from,
          lte: to,
        },
        eventType: {
          is: {
            category: 'weather',
          },
        },
        ...(commodityCandidates.length > 0 ? { commodity: { in: commodityCandidates } } : {}),
        ...(regionCode ? { regionCode } : {}),
      },
      select: {
        eventDate: true,
        impactLevel: true,
        sentiment: true,
        action: true,
        content: true,
        impact: true,
      },
    });

    for (const event of weatherEvents) {
      if (!event.eventDate) {
        continue;
      }
      const dateKey = toUtcDateKey(event.eventDate);
      const bucket = dailyMap.get(dateKey);
      if (!bucket) {
        continue;
      }
      const boost = this.isExtremeWeatherSignal(event.action, event.content, event.impact)
        ? 0.35
        : 0;
      bucket.weatherSignal +=
        this.resolveImpactLevelWeight(event.impactLevel) *
        this.resolveSentimentWeight(event.sentiment) +
        boost;
      bucket.weatherEventCount += 1;
    }

    const logisticsEvents = await this.prisma.marketEvent.findMany({
      where: {
        eventDate: {
          gte: from,
          lte: to,
        },
        ...(commodityCandidates.length > 0 ? { commodity: { in: commodityCandidates } } : {}),
        ...(regionCode ? { regionCode } : {}),
        OR: [
          { action: { contains: '物流', mode: 'insensitive' } },
          { action: { contains: '运输', mode: 'insensitive' } },
          { action: { contains: '港口', mode: 'insensitive' } },
          { content: { contains: '延误', mode: 'insensitive' } },
          { content: { contains: '拥堵', mode: 'insensitive' } },
          { content: { contains: '停运', mode: 'insensitive' } },
          { content: { contains: '中断', mode: 'insensitive' } },
          { impact: { contains: 'delay', mode: 'insensitive' } },
          { impact: { contains: 'congestion', mode: 'insensitive' } },
          { impact: { contains: 'disruption', mode: 'insensitive' } },
        ],
      },
      select: {
        eventDate: true,
        impactLevel: true,
        sentiment: true,
        action: true,
        content: true,
        impact: true,
      },
    });

    for (const event of logisticsEvents) {
      if (!event.eventDate) {
        continue;
      }
      const dateKey = toUtcDateKey(event.eventDate);
      const bucket = dailyMap.get(dateKey);
      if (!bucket) {
        continue;
      }
      const boost = this.isLogisticsDelaySignal(event.action, event.content, event.impact)
        ? 0.4
        : 0;
      bucket.logisticsSignal +=
        this.resolveImpactLevelWeight(event.impactLevel) *
        this.resolveSentimentWeight(event.sentiment) +
        boost;
      bucket.logisticsEventCount += 1;
    }

    const freightSeries = Array.from(dailyMap.values())
      .map((item) =>
        item.freightValues.length > 0
          ? item.freightValues.reduce((sum, value) => sum + value, 0) / item.freightValues.length
          : null,
      )
      .filter((value): value is number => value !== null && Number.isFinite(value));
    const freightBaseline =
      freightSeries.length > 0
        ? freightSeries.reduce((sum, value) => sum + value, 0) / freightSeries.length
        : null;

    const points: WeatherLogisticsImpactIndexPoint[] = [];
    let previousFreightAvg: number | null = null;
    for (const item of dailyMap.values()) {
      const freightAvg =
        item.freightValues.length > 0
          ? item.freightValues.reduce((sum, value) => sum + value, 0) / item.freightValues.length
          : null;

      const freightDeltaRatio =
        freightBaseline && freightBaseline > 0 && freightAvg !== null
          ? (freightAvg - freightBaseline) / freightBaseline
          : 0;
      const freightVolatility =
        freightAvg !== null && previousFreightAvg !== null && previousFreightAvg > 0
          ? Math.abs(freightAvg - previousFreightAvg) / previousFreightAvg
          : 0;
      const freightStressIndex =
        freightAvg === null
          ? 35
          : this.toRiskScore(35 + freightDeltaRatio * 120 + freightVolatility * 80);

      const weatherEventIndex = this.toRiskScore((item.weatherSignal / 3) * 100);
      const logisticsEventIndex = this.toRiskScore((item.logisticsSignal / 3) * 100);

      const weatherDisturbanceIndex = this.toRiskScore(
        weatherEventIndex * 0.75 + freightStressIndex * 0.25,
      );
      const transportFrictionIndex = this.toRiskScore(
        logisticsEventIndex * 0.65 + freightStressIndex * 0.35,
      );
      const deliveryDelayRisk = this.toRiskScore(
        logisticsEventIndex * 0.55 + freightStressIndex * 0.45,
      );
      const supplyRiskIndex = this.toRiskScore(
        weatherDisturbanceIndex * 0.55 + transportFrictionIndex * 0.45,
      );

      points.push({
        date: item.date,
        weatherDisturbanceIndex,
        transportFrictionIndex,
        supplyRiskIndex,
        deliveryDelayRisk,
        weatherEventCount: item.weatherEventCount,
        logisticsEventCount: item.logisticsEventCount,
        freightSampleCount: item.freightValues.length,
        riskLevel: this.resolveWeatherLogisticsRiskLevel(supplyRiskIndex),
      });

      previousFreightAvg = freightAvg;
    }

    const avgWeatherDisturbanceIndex = this.computeAverage(
      points,
      (point) => point.weatherDisturbanceIndex,
    );
    const avgTransportFrictionIndex = this.computeAverage(
      points,
      (point) => point.transportFrictionIndex,
    );
    const avgSupplyRiskIndex = this.computeAverage(points, (point) => point.supplyRiskIndex);
    const avgDeliveryDelayRisk = this.computeAverage(points, (point) => point.deliveryDelayRisk);
    const latest = points.length > 0 ? points[points.length - 1] : null;

    return {
      generatedAt: new Date().toISOString(),
      window: {
        from: from.toISOString(),
        to: to.toISOString(),
        windowDays: dailyBuckets.length,
      },
      filters: {
        commodityCode: commodityCode ?? null,
        regionCode: regionCode ?? null,
      },
      summary: {
        avgWeatherDisturbanceIndex,
        avgTransportFrictionIndex,
        avgSupplyRiskIndex,
        avgDeliveryDelayRisk,
        maxSupplyRiskIndex: points.reduce((max, point) => Math.max(max, point.supplyRiskIndex), 0),
        latestSupplyRiskIndex: latest?.supplyRiskIndex ?? 0,
        trend: this.resolveIndexTrend(points.map((point) => point.supplyRiskIndex)),
      },
      points,
      meta: {
        mappingVersion: 'v1',
        schemaVersion: 'weather_logistics_index.v1',
        lineageVersion: 'v1',
        sourceTables: ['PriceData.freight', 'MarketEvent', 'EventTypeConfig'],
        weatherEventCount: weatherEvents.length,
        logisticsEventCount: logisticsEvents.length,
        freightSamples: priceRows.filter((row) => row.freight !== null && row.freight !== undefined)
          .length,
      },
    };
  }

  async queryStandardizedData(dataset: StandardDataset, options: StandardizedQueryOptions) {
    const limit = options.limit ?? 100;

    let rows: Array<StandardSpotRecord | StandardFuturesRecord | StandardEventRecord>;

    if (dataset === 'SPOT_PRICE') {
      rows = await this.querySpot(options.filters, limit, options.from, options.to);
    } else if (dataset === 'FUTURES_QUOTE') {
      rows = await this.queryFutures(options.filters, limit, options.from, options.to);
    } else {
      rows = await this.queryMarketEvent(options.filters, limit, options.from, options.to);
    }

    this.enforceStandardDataSchema(dataset, rows);

    const gate = await this.reconciliationService.evaluateReconciliationGate(dataset, {
      filters: options.filters,
    });

    if (options.enforceReconciliationGate && gate.enabled && !gate.passed) {
      throw new ForbiddenException(
        `reconciliation gate blocked standardized read: ${gate.reason}`,
      );
    }

    const standardizedRead = await this.configService
      .getWorkflowStandardizedReadMode()
      .catch(() => ({ enabled: false, source: 'DEFAULT', updatedAt: null }));

    return {
      dataset,
      rows,
      meta: this.buildMeta(dataset, rows, {
        standardizedRead,
        gate,
      }),
    };
  }

  async aggregateStandardizedData(
    dataset: StandardDataset,
    options: StandardizedQueryOptions,
    groupBy: string[],
    metrics: MarketDataAggregateMetricInput[],
  ) {
    const queried = await this.queryStandardizedData(dataset, options);
    const rows = queried.rows as Array<Record<string, unknown>>;

    const grouped = new Map<
      string,
      {
        group: Record<string, unknown>;
        rows: Array<Record<string, unknown>>;
      }
    >();

    for (const row of rows) {
      const group: Record<string, unknown> = {};
      for (const field of groupBy) {
        group[field] = row[field] ?? null;
      }
      const key = JSON.stringify(group);
      const existing = grouped.get(key);
      if (existing) {
        existing.rows.push(row);
      } else {
        grouped.set(key, { group, rows: [row] });
      }
    }

    const aggregateRows = Array.from(grouped.values()).map((entry) => {
      const aggregate: Record<string, unknown> = {
        ...entry.group,
      };

      for (const metric of metrics) {
        const metricName = metric.as?.trim() || `${metric.op}_${metric.field}`;
        aggregate[metricName] = this.computeMetric(entry.rows, metric.field, metric.op);
      }

      return aggregate;
    });

    return {
      dataset,
      rows: aggregateRows,
      meta: {
        ...queried.meta,
        groupCount: aggregateRows.length,
        metricCount: metrics.length,
      },
    };
  }

  private computeMetric(rows: Array<Record<string, unknown>>, field: string, op: AggregateOp) {
    const values = rows
      .map((row) => row[field])
      .filter((value) => value !== null && value !== undefined);

    if (op === 'count') {
      return values.length;
    }

    const numericValues = values
      .map((value) => (typeof value === 'number' ? value : Number(value)))
      .filter((value) => Number.isFinite(value));

    if (numericValues.length === 0) {
      return null;
    }

    if (op === 'sum') {
      return numericValues.reduce((sum, value) => sum + value, 0);
    }

    if (op === 'avg') {
      const sum = numericValues.reduce((total, value) => total + value, 0);
      return sum / numericValues.length;
    }

    if (op === 'min') {
      return Math.min(...numericValues);
    }

    return Math.max(...numericValues);
  }

  private async querySpot(
    filters?: Record<string, unknown>,
    limit = 100,
    from?: Date,
    to?: Date,
  ): Promise<StandardSpotRecord[]> {
    const where: Prisma.PriceDataWhereInput = {};

    const commodity = this.getFilterString(filters, ['commodity', 'commodityCode']);
    if (commodity) {
      const commodityCandidates = this.resolveCommodityCandidates(commodity);
      where.commodity =
        commodityCandidates.length === 1 ? commodityCandidates[0] : { in: commodityCandidates };
    }

    const regionCode = this.getFilterString(filters, ['regionCode']);
    if (regionCode) {
      where.regionCode = regionCode;
    }

    const dateFrom = from ?? this.getFilterDate(filters, ['dateFrom']);
    const dateTo = to ?? this.getFilterDate(filters, ['dateTo']);
    if (dateFrom || dateTo) {
      where.effectiveDate = {};
      if (dateFrom) {
        where.effectiveDate.gte = dateFrom;
      }
      if (dateTo) {
        where.effectiveDate.lte = dateTo;
      }
    }

    const rows = await this.prisma.priceData.findMany({
      where,
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        commodity: true,
        regionCode: true,
        province: true,
        city: true,
        price: true,
        sourceType: true,
        effectiveDate: true,
      },
    });

    return rows.map((row) => ({
      recordId: row.id,
      commodityCode: this.normalizeCommodityCode(row.commodity),
      regionCode: this.normalizeRegionCode(row.regionCode, row.province, row.city),
      spotPrice: Number(row.price),
      unit: 'CNY/TON',
      dataTime: row.effectiveDate.toISOString(),
      sourceType: String(row.sourceType),
      sourceRecordId: row.id,
    }));
  }

  private async queryFutures(
    filters?: Record<string, unknown>,
    limit = 100,
    from?: Date,
    to?: Date,
  ): Promise<StandardFuturesRecord[]> {
    const where: Prisma.FuturesQuoteSnapshotWhereInput = {};

    const contractCode = this.getFilterString(filters, ['contractCode']);
    if (contractCode) {
      where.contractCode = contractCode;
    }

    const exchange = this.getFilterString(filters, ['exchange']);
    if (exchange) {
      where.exchange = exchange;
    }

    const dateFrom = from ?? this.getFilterDate(filters, ['dateFrom']);
    const dateTo = to ?? this.getFilterDate(filters, ['dateTo']);
    if (dateFrom || dateTo) {
      where.snapshotAt = {};
      if (dateFrom) {
        where.snapshotAt.gte = dateFrom;
      }
      if (dateTo) {
        where.snapshotAt.lte = dateTo;
      }
    }

    const rows = await this.prisma.futuresQuoteSnapshot.findMany({
      where,
      orderBy: [{ snapshotAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        contractCode: true,
        exchange: true,
        lastPrice: true,
        closePrice: true,
        snapshotAt: true,
      },
    });

    return rows.map((row) => ({
      recordId: row.id,
      contractCode: row.contractCode,
      exchangeCode: row.exchange,
      closePrice: Number(row.closePrice ?? row.lastPrice),
      dataTime: row.snapshotAt.toISOString(),
      sourceType: 'FUTURES_API',
      sourceRecordId: row.id,
    }));
  }

  private async queryMarketEvent(
    filters?: Record<string, unknown>,
    limit = 100,
    from?: Date,
    to?: Date,
  ): Promise<StandardEventRecord[]> {
    const where: Prisma.MarketIntelWhereInput = {};

    const contentType = this.getFilterString(filters, ['contentType']);
    if (contentType) {
      const normalized = contentType.trim().toUpperCase();
      if (normalized === 'DAILY_REPORT' || normalized === 'RESEARCH_REPORT') {
        where.contentType = normalized as 'DAILY_REPORT' | 'RESEARCH_REPORT';
      }
    }

    const dateFrom = from ?? this.getFilterDate(filters, ['dateFrom']);
    const dateTo = to ?? this.getFilterDate(filters, ['dateTo']);
    if (dateFrom || dateTo) {
      where.effectiveTime = {};
      if (dateFrom) {
        where.effectiveTime.gte = dateFrom;
      }
      if (dateTo) {
        where.effectiveTime.lte = dateTo;
      }
    }

    const rows = await this.prisma.marketIntel.findMany({
      where,
      orderBy: [{ effectiveTime: 'desc' }],
      take: limit,
      select: {
        id: true,
        contentType: true,
        summary: true,
        rawContent: true,
        sourceType: true,
        effectiveTime: true,
      },
    });

    return rows.map((row) => {
      const summary = (row.summary ?? row.rawContent ?? '').slice(0, 500);
      const title = summary.slice(0, 40) || '市场情报';
      return {
        recordId: row.id,
        eventType: MARKET_INTEL_EVENT_TYPE_MAP[String(row.contentType ?? '')] ?? 'NEWS',
        title,
        summary,
        publishedAt: row.effectiveTime.toISOString(),
        sourceType: String(row.sourceType),
        sourceRecordId: row.id,
      };
    });
  }

  private validateStandardSpotRecord(row: StandardSpotRecord): string[] {
    const issues: string[] = [];
    if (!row.commodityCode) {
      issues.push('commodityCode missing');
    }
    if (!row.regionCode) {
      issues.push('regionCode missing');
    }
    if (!Number.isFinite(row.spotPrice)) {
      issues.push('spotPrice invalid');
    }
    if (!row.dataTime) {
      issues.push('dataTime missing');
    }
    return issues;
  }

  private validateStandardFuturesRecord(row: StandardFuturesRecord): string[] {
    const issues: string[] = [];
    if (!row.contractCode) {
      issues.push('contractCode missing');
    }
    if (!row.exchangeCode) {
      issues.push('exchangeCode missing');
    }
    if (!Number.isFinite(row.closePrice)) {
      issues.push('closePrice invalid');
    }
    if (!row.dataTime) {
      issues.push('dataTime missing');
    }
    return issues;
  }

  private validateStandardEventRecord(row: StandardEventRecord): string[] {
    const issues: string[] = [];
    if (!row.eventType) {
      issues.push('eventType missing');
    }
    if (!row.title) {
      issues.push('title missing');
    }
    if (!row.summary) {
      issues.push('summary missing');
    }
    if (!row.publishedAt) {
      issues.push('publishedAt missing');
    }
    return issues;
  }

  private normalizeCommodityCode(rawCommodity: string): string {
    const compact = rawCommodity?.trim();
    if (!compact) {
      return '';
    }
    if (COMMODITY_CODE_MAP[compact]) {
      return COMMODITY_CODE_MAP[compact];
    }
    return compact
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .toUpperCase();
  }

  private resolveCommodityCandidates(input: string): string[] {
    const compact = input.trim();
    if (!compact) {
      return [];
    }

    const upper = compact.toUpperCase();
    const matchedLabel = Object.entries(COMMODITY_CODE_MAP).find(([, code]) => code === upper)?.[0];
    if (matchedLabel) {
      return [compact, matchedLabel];
    }

    return [compact];
  }

  private normalizeRegionCode(
    regionCode?: string | null,
    province?: string | null,
    city?: string | null,
  ): string {
    if (regionCode && regionCode.trim().length > 0) {
      return regionCode.trim();
    }
    const provincePart = (province ?? '').trim();
    const cityPart = (city ?? '').trim();
    if (provincePart && cityPart) {
      return `${provincePart}_${cityPart}`.toUpperCase();
    }
    if (provincePart) {
      return provincePart.toUpperCase();
    }
    return 'UNKNOWN_REGION';
  }

  private getFilterString(filters: Record<string, unknown> | undefined, keys: string[]) {
    if (!filters) {
      return undefined;
    }
    for (const key of keys) {
      const value = filters[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  }

  private getFilterDate(filters: Record<string, unknown> | undefined, keys: string[]) {
    const raw = this.getFilterString(filters, keys);
    if (!raw) {
      return undefined;
    }
    const parsed = new Date(raw);
    if (!Number.isFinite(parsed.getTime())) {
      return undefined;
    }
    return parsed;
  }

  private enforceStandardDataSchema(
    dataset: StandardDataset,
    rows: Array<StandardSpotRecord | StandardFuturesRecord | StandardEventRecord>,
  ) {
    if (rows.length === 0) {
      return;
    }

    const issues: string[] = [];
    const collectIssue = (index: number, message: string) => {
      if (issues.length < 20) {
        issues.push(`row#${index + 1}: ${message}`);
      }
    };

    rows.forEach((row, index) => {
      const result =
        dataset === 'SPOT_PRICE'
          ? StandardSpotRecordSchema.safeParse(row)
          : dataset === 'FUTURES_QUOTE'
            ? StandardFuturesRecordSchema.safeParse(row)
            : StandardEventRecordSchema.safeParse(row);
      if (!result.success) {
        result.error.issues.forEach((issue) => {
          collectIssue(index, `${issue.path.join('.') || '<root>'} ${issue.message}`);
        });
      }
    });

    if (issues.length > 0) {
      throw new BadRequestException({
        code: 'MARKET_DATA_SCHEMA_REJECTED',
        message: `标准层 schema 校验失败（${dataset}）`,
        issues,
      });
    }
  }

  private buildDatasetLineageMeta(
    dataset: StandardDataset,
  ): NonNullable<StandardizedDataMeta['lineage']> {
    if (dataset === 'SPOT_PRICE') {
      return {
        dataset,
        sourceTables: ['PriceData'],
        ruleSetId: 'price_data_mapping_v1',
        metricVersions: {
          MKT_SPOT_AVG_7D: 'v1',
          MKT_SPOT_PCT_CHG_7D: 'v1',
          BASIS_MAIN: 'v1',
        } as Record<string, string>,
      };
    }
    if (dataset === 'FUTURES_QUOTE') {
      return {
        dataset,
        sourceTables: ['FuturesQuoteSnapshot'],
        ruleSetId: 'futures_quote_mapping_v1',
        metricVersions: {
          FUT_CLOSE_PCT_CHG_1D: 'v1',
          VOLATILITY_20D: 'v1',
        } as Record<string, string>,
      };
    }
    return {
      dataset,
      sourceTables: ['MarketEvent', 'MarketIntel'],
      ruleSetId: 'market_event_mapping_v1',
      metricVersions: {
        SUPPLY_STRESS_IDX: 'v1',
        ALERT_SEVERITY: 'v1',
      } as Record<string, string>,
    };
  }

  private buildDateKeysInRange(from: Date, to: Date): string[] {
    const keys: string[] = [];
    const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
    let cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
      keys.push(toUtcDateKey(cursor));
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }
    return keys;
  }

  private resolveImpactLevelWeight(level: string | null): number {
    const normalized = (level ?? '').trim().toUpperCase();
    if (normalized === 'HIGH') {
      return 1;
    }
    if (normalized === 'MEDIUM') {
      return 0.7;
    }
    if (normalized === 'LOW') {
      return 0.45;
    }
    return 0.55;
  }

  private resolveSentimentWeight(sentiment: string | null): number {
    const normalized = (sentiment ?? '').trim().toLowerCase();
    if (normalized === 'bearish' || normalized === 'negative') {
      return 1.2;
    }
    if (normalized === 'neutral') {
      return 1;
    }
    if (normalized === 'bullish' || normalized === 'positive') {
      return 0.85;
    }
    return 1;
  }

  private isExtremeWeatherSignal(
    action: string | null,
    content: string | null,
    impact: string | null,
  ): boolean {
    const merged = `${action ?? ''} ${content ?? ''} ${impact ?? ''}`.toLowerCase();
    return /(暴雨|洪涝|台风|寒潮|高温|冻害|暴雪|干旱|storm|typhoon|flood|drought)/i.test(merged);
  }

  private isLogisticsDelaySignal(
    action: string | null,
    content: string | null,
    impact: string | null,
  ): boolean {
    const merged = `${action ?? ''} ${content ?? ''} ${impact ?? ''}`.toLowerCase();
    return /(延误|拥堵|停运|中断|封航|积压|delay|congestion|closure|disruption)/i.test(merged);
  }

  private toRiskScore(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    if (value <= 0) {
      return 0;
    }
    if (value >= 100) {
      return 100;
    }
    return Number(value.toFixed(2));
  }

  private resolveWeatherLogisticsRiskLevel(value: number): WeatherLogisticsRiskLevel {
    if (value >= 80) {
      return 'CRITICAL';
    }
    if (value >= 60) {
      return 'HIGH';
    }
    if (value >= 35) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  private computeAverage<T>(items: T[], resolver: (item: T) => number): number {
    if (items.length === 0) {
      return 0;
    }
    const sum = items.reduce((acc, item) => acc + resolver(item), 0);
    return Number((sum / items.length).toFixed(2));
  }

  private resolveIndexTrend(values: number[]): 'UP' | 'DOWN' | 'STABLE' {
    if (values.length < 2) {
      return 'STABLE';
    }
    const midpoint = Math.max(1, Math.floor(values.length / 2));
    const firstAvg = values.slice(0, midpoint).reduce((acc, value) => acc + value, 0) / midpoint;
    const secondSlice = values.slice(midpoint);
    if (secondSlice.length === 0) {
      return 'STABLE';
    }
    const secondAvg = secondSlice.reduce((acc, value) => acc + value, 0) / secondSlice.length;
    const delta = secondAvg - firstAvg;
    if (delta > 3) {
      return 'UP';
    }
    if (delta < -3) {
      return 'DOWN';
    }
    return 'STABLE';
  }

  private buildMeta(
    dataset: StandardDataset,
    rows: Array<StandardSpotRecord | StandardFuturesRecord | StandardEventRecord>,
    context?: {
      standardizedRead?: { enabled: boolean; source: string; updatedAt: string | null };
      gate?: {
        enabled: boolean;
        passed: boolean;
        reason: ReconciliationGateReason;
        checkedAt: string;
        maxAgeMinutes?: number;
        ageMinutes?: number;
        latest?: {
          jobId: string;
          status: ReconciliationJobStatus;
          retriedFromJobId: string | null;
          retryCount: number;
          summaryPass?: boolean;
          createdAt: string;
          finishedAt?: string;
          cancelledAt?: string;
          dimensions?: Record<string, unknown>;
          source: 'database' | 'in-memory';
        };
      };
    },
  ): StandardizedDataMeta {
    const freshness = this.buildFreshnessMeta(dataset, rows);
    const qualityScore = this.buildQualityScoreMeta(dataset, rows, freshness.dataLagMinutes);
    const lineage = this.buildDatasetLineageMeta(dataset);
    const governance =
      context?.standardizedRead && context.gate
        ? {
          standardizedRead: {
            enabled: context.standardizedRead.enabled,
            source: context.standardizedRead.source,
            updatedAt: context.standardizedRead.updatedAt,
          },
          reconciliationGate: {
            enabled: context.gate.enabled,
            passed: context.gate.passed,
            reason: context.gate.reason,
            checkedAt: context.gate.checkedAt,
            maxAgeMinutes: context.gate.maxAgeMinutes,
            ageMinutes: context.gate.ageMinutes,
            latest: context.gate.latest,
          },
        }
        : undefined;

    return {
      recordCount: rows.length,
      mappingVersion: 'v1',
      schemaVersion: 'v1',
      lineageVersion: 'v1',
      fetchedAt: new Date().toISOString(),
      degradeAction: this.resolveDegradeAction(freshness.degradeSeverity),
      qualityScore,
      freshness,
      lineage,
      governance,
    };
  }

  private resolveDegradeAction(
    severity: StandardizedDataFreshness['degradeSeverity'],
  ): StandardizedDataMeta['degradeAction'] {
    if (severity === 'NONE') {
      return 'ALLOW';
    }
    if (severity === 'WARNING') {
      return 'WARN';
    }
    return 'BLOCK';
  }

  private buildFreshnessMeta(
    dataset: StandardDataset,
    rows: Array<StandardSpotRecord | StandardFuturesRecord | StandardEventRecord>,
  ): StandardizedDataFreshness {
    const ttlMinutes = this.getDatasetFreshnessTtlMinutes(dataset);
    const timestamps = rows
      .map((row) => this.extractRecordTime(row, dataset))
      .filter((value): value is Date => !!value)
      .sort((a, b) => a.getTime() - b.getTime());

    if (timestamps.length === 0) {
      return {
        status: 'UNKNOWN',
        degradeSeverity: 'CRITICAL',
        ttlMinutes,
      };
    }

    const oldest = timestamps[0];
    const newest = timestamps[timestamps.length - 1];
    const lagMinutes = Math.max(0, (Date.now() - newest.getTime()) / (1000 * 60));

    if (lagMinutes <= ttlMinutes) {
      return {
        status: 'FRESH',
        degradeSeverity: 'NONE',
        ttlMinutes,
        dataLagMinutes: lagMinutes,
        newestDataTime: newest.toISOString(),
        oldestDataTime: oldest.toISOString(),
      };
    }

    if (lagMinutes <= ttlMinutes * 2) {
      return {
        status: 'STALE',
        degradeSeverity: 'WARNING',
        ttlMinutes,
        dataLagMinutes: lagMinutes,
        newestDataTime: newest.toISOString(),
        oldestDataTime: oldest.toISOString(),
      };
    }

    return {
      status: 'OUTDATED',
      degradeSeverity: 'CRITICAL',
      ttlMinutes,
      dataLagMinutes: lagMinutes,
      newestDataTime: newest.toISOString(),
      oldestDataTime: oldest.toISOString(),
    };
  }

  private buildQualityScoreMeta(
    dataset: StandardDataset,
    rows: Array<StandardSpotRecord | StandardFuturesRecord | StandardEventRecord>,
    dataLagMinutes?: number,
  ): StandardizedDataQualityScore {
    const ttlMinutes = this.getDatasetFreshnessTtlMinutes(dataset);
    const completeness = this.computeCompletenessScore(dataset, rows);
    const consistency = this.computeConsistencyScore(dataset, rows);
    const timeliness = this.computeTimelinessScore(dataLagMinutes, ttlMinutes, rows.length);
    const anomalyStability = this.computeAnomalyStabilityScore(dataset, rows);

    // PRD §8.4: completeness×0.35 + timeliness×0.30 + consistency×0.20 + anomalyStability×0.15
    const overall = Math.round(
      completeness * 0.35 + timeliness * 0.30 + consistency * 0.20 + anomalyStability * 0.15,
    );

    return {
      overall,
      grade: this.resolveQualityGrade(overall),
      dimensions: {
        completeness,
        timeliness,
        consistency,
        anomalyStability,
      },
    };
  }

  /**
   * 异常稳定性评分（PRD §8.4 第四维度）
   *
   * 检测数值型字段中极端离群值的比例。
   * - SPOT_PRICE: spotPrice 偏离中位数超过 3 倍 IQR
   * - FUTURES_QUOTE: closePrice 偏离中位数超过 3 倍 IQR
   * - MARKET_EVENT: 基于标题/摘要长度异常检测
   *
   * 返回 0~100 分，极端值越少分数越高。
   */
  private computeAnomalyStabilityScore(
    dataset: StandardDataset,
    rows: Array<StandardSpotRecord | StandardFuturesRecord | StandardEventRecord>,
  ): number {
    if (rows.length < 3) {
      // 样本不足以做异常检测，给予默认高分
      return rows.length === 0 ? 0 : 80;
    }

    const values: number[] = [];
    for (const row of rows) {
      if (dataset === 'SPOT_PRICE') {
        const v = (row as StandardSpotRecord).spotPrice;
        if (Number.isFinite(v)) {
          values.push(v);
        }
      } else if (dataset === 'FUTURES_QUOTE') {
        const v = (row as StandardFuturesRecord).closePrice;
        if (Number.isFinite(v)) {
          values.push(v);
        }
      } else {
        // MARKET_EVENT: 用标题长度作为代理指标
        const len = (row as StandardEventRecord).title?.trim().length ?? 0;
        values.push(len);
      }
    }

    if (values.length < 3) {
      return 80;
    }

    // IQR 离群值检测
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;

    // 如果 IQR 为 0（数据完全一致），稳定性极佳
    if (iqr === 0) {
      return 100;
    }

    const lowerBound = q1 - 3 * iqr;
    const upperBound = q3 + 3 * iqr;
    let outlierCount = 0;
    for (const v of values) {
      if (v < lowerBound || v > upperBound) {
        outlierCount += 1;
      }
    }

    const outlierRate = outlierCount / values.length;
    // 0% 异常 → 100 分, 10%+ 异常 → 0 分
    return Math.round(Math.max(0, Math.min(100, (1 - outlierRate * 10) * 100)));
  }

  private computeCompletenessScore(
    dataset: StandardDataset,
    rows: Array<StandardSpotRecord | StandardFuturesRecord | StandardEventRecord>,
  ): number {
    if (rows.length === 0) {
      return 0;
    }

    const requiredFieldsByDataset: Record<StandardDataset, string[]> = {
      SPOT_PRICE: ['recordId', 'commodityCode', 'regionCode', 'dataTime', 'sourceRecordId'],
      FUTURES_QUOTE: ['recordId', 'contractCode', 'exchangeCode', 'dataTime', 'sourceRecordId'],
      MARKET_EVENT: ['recordId', 'eventType', 'title', 'publishedAt', 'sourceRecordId'],
    };
    const requiredFields = requiredFieldsByDataset[dataset];
    const totalRequired = rows.length * requiredFields.length;
    if (totalRequired === 0) {
      return 0;
    }

    let presentCount = 0;
    for (const row of rows as Array<Record<string, unknown>>) {
      for (const field of requiredFields) {
        const value = row[field];
        if (typeof value === 'string') {
          if (value.trim().length > 0) {
            presentCount += 1;
          }
          continue;
        }
        if (value !== null && value !== undefined) {
          presentCount += 1;
        }
      }
    }

    return Math.round((presentCount / totalRequired) * 100);
  }

  private computeConsistencyScore(
    dataset: StandardDataset,
    rows: Array<StandardSpotRecord | StandardFuturesRecord | StandardEventRecord>,
  ): number {
    if (rows.length === 0) {
      return 0;
    }

    let validCount = 0;
    for (const row of rows) {
      if (dataset === 'SPOT_PRICE') {
        const spot = row as StandardSpotRecord;
        if (Number.isFinite(spot.spotPrice) && !!this.extractRecordTime(spot, dataset)) {
          validCount += 1;
        }
        continue;
      }

      if (dataset === 'FUTURES_QUOTE') {
        const futures = row as StandardFuturesRecord;
        if (Number.isFinite(futures.closePrice) && !!this.extractRecordTime(futures, dataset)) {
          validCount += 1;
        }
        continue;
      }

      const event = row as StandardEventRecord;
      if (event.title.trim().length > 0 && !!this.extractRecordTime(event, dataset)) {
        validCount += 1;
      }
    }

    return Math.round((validCount / rows.length) * 100);
  }

  private computeTimelinessScore(
    dataLagMinutes: number | undefined,
    ttlMinutes: number,
    count: number,
  ) {
    if (count === 0 || dataLagMinutes === undefined) {
      return 0;
    }

    if (dataLagMinutes <= ttlMinutes) {
      return 100;
    }
    if (dataLagMinutes <= ttlMinutes * 2) {
      return 70;
    }
    if (dataLagMinutes <= ttlMinutes * 4) {
      return 40;
    }
    return 10;
  }

  private resolveQualityGrade(score: number): StandardizedDataQualityScore['grade'] {
    if (score >= 90) {
      return 'A';
    }
    if (score >= 75) {
      return 'B';
    }
    if (score >= 60) {
      return 'C';
    }
    return 'D';
  }

  private extractRecordTime(
    row: StandardSpotRecord | StandardFuturesRecord | StandardEventRecord,
    dataset: StandardDataset,
  ): Date | undefined {
    const raw =
      dataset === 'MARKET_EVENT'
        ? (row as StandardEventRecord).publishedAt
        : (row as StandardSpotRecord | StandardFuturesRecord).dataTime;
    if (!raw) {
      return undefined;
    }
    const parsed = new Date(raw);
    if (!Number.isFinite(parsed.getTime())) {
      return undefined;
    }
    return parsed;
  }

  private getDatasetFreshnessTtlMinutes(dataset: StandardDataset): number {
    if (dataset === 'FUTURES_QUOTE') {
      return 30;
    }
    if (dataset === 'SPOT_PRICE') {
      return 24 * 60;
    }
    return 6 * 60;
  }
}
