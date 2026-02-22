import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { PriceDataQuery } from "@packages/types";
import { CollectionPointType, PriceSourceType, Prisma } from "@prisma/client";
import * as PriceDataUtils from './price-data.utils';
import type { PricePointGroup } from './price-data.utils';

@Injectable()
export class PriceAnalyticsService {
    private readonly logger = new Logger(PriceAnalyticsService.name);

    constructor(private prisma: PrismaService) {}



    private logPerf(method: string, startedAt: number, metadata: Record<string, unknown>) {
        const durationMs = Date.now() - startedAt; if (durationMs < 400) return; this.logger.warn('[perf] ' + method + ' ' + durationMs + 'ms ' + JSON.stringify(metadata));
    }



    /**
     * 连续性健康度分析
     */
    async getContinuityHealth(query: Partial<PriceDataQuery> & { days?: number | string }) {
        const {
                  commodity,
                  startDate,
                  endDate,
                  regionCode,
                  pointTypes,
                  subTypes,
                  collectionPointIds,
                  collectionPointId,
                  reviewScope,
                  sourceScope,
                  days,
                } = query;
        const daysValue = Number(days) || 30;
        const { startDate: resolvedStart, endDate: resolvedEnd } = PriceDataUtils.resolveDateRange(
                  daysValue,
                  startDate,
                  endDate,
                );
        const commodityFilter = PriceDataUtils.buildCommodityFilter(commodity);
        const subTypeList = PriceDataUtils.parsePriceSubTypes(subTypes);
        const pointTypeList = PriceDataUtils.parseCsv(pointTypes).filter((value): value is CollectionPointType =>
                  Object.values(CollectionPointType).includes(value as CollectionPointType),
                );
        const collectionPointIdList = [
                  ...PriceDataUtils.parseCsv(collectionPointIds),
                  ...(collectionPointId ? [collectionPointId] : []),
                ];
        const andFilters: Prisma.PriceDataWhereInput[] = [];
        if (commodityFilter) andFilters.push({ commodity: commodityFilter });
        if (regionCode) andFilters.push({ regionCode });
        if (subTypeList.length > 0) andFilters.push({ subType: { in: subTypeList } });
        if (collectionPointIdList.length > 0) {
          andFilters.push({ collectionPointId: { in: [...new Set(collectionPointIdList)] } });
        }

        const reviewStatuses = PriceDataUtils.resolveReviewStatuses(reviewScope);
        if (reviewStatuses && reviewStatuses.length > 0) {
          andFilters.push({ reviewStatus: { in: reviewStatuses } });
        }

        const inputMethods = PriceDataUtils.resolveInputMethods(sourceScope);
        if (inputMethods && inputMethods.length > 0) {
          andFilters.push({ inputMethod: { in: inputMethods } });
        }

        if (pointTypeList.length > 0) {
          const orConditions: Prisma.PriceDataWhereInput[] = [];
          orConditions.push({ collectionPoint: { type: { in: pointTypeList } } });
          if (pointTypeList.includes(CollectionPointType.REGION)) {
            orConditions.push({ sourceType: PriceSourceType.REGIONAL });
          }
          andFilters.push({ OR: orConditions });
        }

        if (resolvedStart || resolvedEnd) {
          andFilters.push({
            effectiveDate: {
              ...(resolvedStart ? { gte: resolvedStart } : {}),
              ...(resolvedEnd ? { lte: resolvedEnd } : {}),
            },
          });
        }

        const where = andFilters.length > 0 ? { AND: andFilters } : {};
        const rows = await this.prisma.priceData.findMany({
                  where,
                  orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }],
                  include: {
                    collectionPoint: {
                      select: {
                        id: true,
                        code: true,
                        name: true,
                        shortName: true,
                        type: true,
                        regionCode: true,
                        region: {
                          select: { code: true, name: true, shortName: true },
                        },
                      },
                    },
                  },
                });
        const rangeStart = resolvedStart ?? (rows.length ? rows[0].effectiveDate : null);
        const rangeEnd = resolvedEnd ?? (rows.length ? rows[rows.length - 1].effectiveDate : null);
        const expectedDays = rangeStart && rangeEnd
                    ? Math.max(
                        1,
                        Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1,
                      )
                    : Math.max(1, daysValue);
        type GroupStats = {
                  pointId: string;
                  pointName: string;
                  pointType: string;
                  regionLabel: string | null;
                  uniqueDays: Set<string>;
                  latestDate: Date | null;
                  recordCount: number;
                  anomalyCount: number;
                  lateCount: number;
                };
        const groups = new Map<string, GroupStats>();
        for (const row of rows) {
          const pointId = row.collectionPointId || `REGIONAL:${row.regionCode || 'NA'}:${row.location}`;
          const pointType = row.collectionPoint?.type || CollectionPointType.REGION;
          const pointName = row.collectionPoint?.shortName || row.collectionPoint?.name || row.location;
          const regionLabel =
            row.collectionPoint?.region?.shortName ||
            row.collectionPoint?.region?.name ||
            row.city ||
            row.province ||
            null;
          const key = pointId;
          if (!groups.has(key)) {
            groups.set(key, {
              pointId: key,
              pointName,
              pointType,
              regionLabel,
              uniqueDays: new Set<string>(),
              latestDate: null,
              recordCount: 0,
              anomalyCount: 0,
              lateCount: 0,
            });
          }
          const group = groups.get(key)!;
          const dateKey = PriceDataUtils.toDateKey(row.effectiveDate);
          group.uniqueDays.add(dateKey);
          group.recordCount += 1;
          if (!group.latestDate || row.effectiveDate > group.latestDate) {
            group.latestDate = row.effectiveDate;
          }
          const qualityTag = PriceDataUtils.inferQualityTag(row);
          if (qualityTag === 'LATE') {
            group.lateCount += 1;
          }
          const dayChange = row.dayChange ? Number(row.dayChange) : 0;
          const price = Number(row.price);
          const changePct = price ? Math.abs((dayChange / price) * 100) : 0;
          if (Math.abs(dayChange) >= 20 || changePct >= 5) {
            group.anomalyCount += 1;
          }
        }

        const points = Array.from(groups.values())
                  .map((group) => {
                    const coverageRate = group.uniqueDays.size / expectedDays;
                    const lateRate = group.recordCount > 0 ? group.lateCount / group.recordCount : 0;
                    const anomalyRate = group.recordCount > 0 ? group.anomalyCount / group.recordCount : 0;
                    const lagDays =
                      group.latestDate && rangeEnd
                        ? Math.max(
                            0,
                            Math.floor(
                              (rangeEnd.getTime() - group.latestDate.getTime()) / (1000 * 60 * 60 * 24),
                            ),
                          )
                        : expectedDays;
                    const timelinessScore = Math.max(0, 100 - lagDays * 10);
                    const score = Math.round(
                      coverageRate * 40 + timelinessScore * 0.25 + (1 - anomalyRate) * 20 + (1 - lateRate) * 15,
                    );
                    return {
                      pointId: group.pointId,
                      pointName: group.pointName,
                      pointType: group.pointType,
                      regionLabel: group.regionLabel,
                      coverageRate: Number((coverageRate * 100).toFixed(1)),
                      timelinessScore: Number(timelinessScore.toFixed(1)),
                      anomalyRate: Number((anomalyRate * 100).toFixed(1)),
                      lateRate: Number((lateRate * 100).toFixed(1)),
                      score,
                      grade: PriceDataUtils.scoreGrade(score),
                      latestDate: group.latestDate,
                      recordCount: group.recordCount,
                      missingDays: Math.max(0, expectedDays - group.uniqueDays.size),
                    };
                  })
                  .sort((a, b) => a.score - b.score);
        const pointCount = points.length;
        const summary = {
                  overallScore:
                    pointCount > 0
                      ? Number((points.reduce((sum, item) => sum + item.score, 0) / pointCount).toFixed(1))
                      : 0,
                  coverageRate:
                    pointCount > 0
                      ? Number(
                          (points.reduce((sum, item) => sum + item.coverageRate, 0) / pointCount).toFixed(1),
                        )
                      : 0,
                  anomalyRate:
                    pointCount > 0
                      ? Number(
                          (points.reduce((sum, item) => sum + item.anomalyRate, 0) / pointCount).toFixed(1),
                        )
                      : 0,
                  lateRate:
                    pointCount > 0
                      ? Number((points.reduce((sum, item) => sum + item.lateRate, 0) / pointCount).toFixed(1))
                      : 0,
                  expectedDays,
                  pointCount,
                  healthyPoints: points.filter((item) => item.score >= 85).length,
                  riskPoints: points.filter((item) => item.score < 60).length,
                  startDate: rangeStart,
                  endDate: rangeEnd,
                };
        return { summary, points };
    }



    /**
     * 对比分析聚合数据
     * 将前端本地统计迁移到后端统一口径计算
     */
    async getCompareAnalytics(query: {
        collectionPointIds: string[];
        commodity?: string;
        days?: number;
        startDate?: Date;
        endDate?: Date;
        subTypes?: string | string[];
        regionCode?: string;
        pointTypes?: string | string[];
        reviewScope?: string;
        sourceScope?: string;
        regionLevel?: string;
        regionWindow?: string;
        }) {
        const startedAt = Date.now();
        const {
                  collectionPointIds,
                  commodity,
                  days = 30,
                  startDate,
                  endDate,
                  subTypes,
                  regionCode,
                  pointTypes,
                  reviewScope,
                  sourceScope,
                  regionLevel,
                  regionWindow,
                } = query;
        const uniquePointIds = [...new Set((collectionPointIds || []).filter(Boolean))];
        const { startDate: resolvedStart, endDate: resolvedEnd } = PriceDataUtils.resolveDateRange(
                  days,
                  startDate,
                  endDate,
                );
        const commodityFilter = PriceDataUtils.buildCommodityFilter(commodity);
        const subTypeList = PriceDataUtils.parsePriceSubTypes(subTypes);
        const reviewStatuses = PriceDataUtils.resolveReviewStatuses(reviewScope);
        const inputMethods = PriceDataUtils.resolveInputMethods(sourceScope);
        const normalizedRegionLevel = PriceDataUtils.normalizeRegionLevel(regionLevel);
        const normalizedRegionWindow = PriceDataUtils.normalizeRegionWindow(regionWindow);
        const regionalSourceType = (PriceSourceType as unknown as Record<string, PriceSourceType>).REGIONAL ||
                  ('REGIONAL' as PriceSourceType);
        const dayMs = 24 * 60 * 60 * 1000;
        const startOfDay = (value: Date) => {
                  const date = new Date(value);
                  date.setHours(0, 0, 0, 0);
                  return date;
                };
        const calcExpectedDays = (start?: Date, end?: Date) => {
                  if (!start || !end) return null;
                  return Math.max(
                    1,
                    Math.floor((startOfDay(end).getTime() - startOfDay(start).getTime()) / dayMs) + 1,
                  );
                };
        const compareFilters: Prisma.PriceDataWhereInput[] = [];
        if (uniquePointIds.length > 0) {
          compareFilters.push({ collectionPointId: { in: uniquePointIds } });
        }

        if (commodityFilter) compareFilters.push({ commodity: commodityFilter });
        if (subTypeList.length > 0) compareFilters.push({ subType: { in: subTypeList } });
        if (reviewStatuses && reviewStatuses.length > 0) {
          compareFilters.push({ reviewStatus: { in: reviewStatuses } });
        }

        if (inputMethods && inputMethods.length > 0) {
          compareFilters.push({ inputMethod: { in: inputMethods } });
        }

        if (resolvedStart || resolvedEnd) {
          compareFilters.push({
            effectiveDate: {
              ...(resolvedStart ? { gte: resolvedStart } : {}),
              ...(resolvedEnd ? { lte: resolvedEnd } : {}),
            },
          });
        }

        const compareRows = uniquePointIds.length
                  ? await this.prisma.priceData.findMany({
                      where: compareFilters.length > 0 ? { AND: compareFilters } : {},
                      orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }],
                      select: {
                        collectionPointId: true,
                        effectiveDate: true,
                        createdAt: true,
                        price: true,
                        dayChange: true,
                        location: true,
                        city: true,
                        province: true,
                        collectionPoint: {
                          select: {
                            id: true,
                            code: true,
                            name: true,
                            shortName: true,
                            type: true,
                            regionCode: true,
                            region: {
                              select: { code: true, name: true, shortName: true },
                            },
                          },
                        },
                      },
                    })
                  : [];
        const groupedByPoint = new Map<string, typeof compareRows>();
        for (const row of compareRows) {
          if (!row.collectionPointId) continue;
          if (!groupedByPoint.has(row.collectionPointId)) {
            groupedByPoint.set(row.collectionPointId, []);
          }
          groupedByPoint.get(row.collectionPointId)!.push(row);
        }

        const latestRecords = Array.from(groupedByPoint.values())
                  .map((list) => list[list.length - 1])
                  .filter(Boolean);
        const meanLatestPrice = latestRecords.length > 0
                    ? latestRecords.reduce((sum, row) => sum + Number(row.price), 0) / latestRecords.length
                    : null;
        const compareExpectedDays = startDate && endDate ? calcExpectedDays(resolvedStart, resolvedEnd) : null;
        const ranking = Array.from(groupedByPoint.entries())
                  .map(([pointId, rows]) => {
                    if (rows.length === 0) return null;
                    const sortedRows = [...rows].sort(
                      (a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime(),
                    );
                    const first = sortedRows[0];
                    const latest = sortedRows[sortedRows.length - 1];
                    const prices = sortedRows.map((row) => Number(row.price));
                    const minPrice = Math.min(...prices);
                    const maxPrice = Math.max(...prices);
                    const avgPrice = prices.reduce((sum, value) => sum + value, 0) / prices.length;
                    const latestPrice = Number(latest.price);
                    const latestChange = latest.dayChange ? Number(latest.dayChange) : 0;
                    const firstPrice = Number(first.price);
                    const periodChange = latestPrice - firstPrice;
                    const pointName =
                      latest.collectionPoint?.shortName || latest.collectionPoint?.name || latest.location;
                    const regionLabel =
                      latest.collectionPoint?.region?.shortName ||
                      latest.collectionPoint?.region?.name ||
                      latest.city ||
                      latest.province ||
                      '未知';

                    return {
                      id: pointId,
                      name: pointName,
                      code: latest.collectionPoint?.code || '',
                      type: latest.collectionPoint?.type,
                      regionLabel,
                      price: latestPrice,
                      change: latestChange,
                      changePct: latestPrice ? (latestChange / latestPrice) * 100 : 0,
                      periodChange,
                      periodChangePct: firstPrice ? (periodChange / firstPrice) * 100 : 0,
                      volatility: avgPrice ? ((maxPrice - minPrice) / avgPrice) * 100 : 0,
                      minPrice,
                      maxPrice,
                      avgPrice,
                      basePrice: firstPrice,
                      indexPrice: firstPrice ? (latestPrice / firstPrice) * 100 : 0,
                      indexChange: firstPrice ? (latestChange / firstPrice) * 100 : 0,
                      samples: sortedRows.length,
                      missingDays:
                        compareExpectedDays !== null
                          ? Math.max(0, compareExpectedDays - sortedRows.length)
                          : null,
                    };
                  })
                  .filter(
                    (
                      item,
                    ): item is {
                      id: string;
                      name: string;
                      code: string;
                      type: CollectionPointType | undefined;
                      regionLabel: string;
                      price: number;
                      change: number;
                      changePct: number;
                      periodChange: number;
                      periodChangePct: number;
                      volatility: number;
                      minPrice: number;
                      maxPrice: number;
                      avgPrice: number;
                      basePrice: number;
                      indexPrice: number;
                      indexChange: number;
                      samples: number;
                      missingDays: number | null;
                    } => Boolean(item),
                  );
        const distribution = Array.from(groupedByPoint.entries())
                  .map(([pointId, rows]) => {
                    if (rows.length === 0) return null;
                    const sorted = rows
                      .map((row) => Number(row.price))
                      .filter((value) => Number.isFinite(value))
                      .sort((a, b) => a - b);
                    if (sorted.length === 0) return null;
                    const latest = rows[rows.length - 1];
                    const pointName =
                      latest.collectionPoint?.shortName || latest.collectionPoint?.name || latest.location;
                    const avg = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
                    return {
                      id: pointId,
                      name: pointName,
                      min: sorted[0],
                      max: sorted[sorted.length - 1],
                      q1: PriceDataUtils.quantile(sorted, 0.25),
                      median: PriceDataUtils.quantile(sorted, 0.5),
                      q3: PriceDataUtils.quantile(sorted, 0.75),
                      avg,
                    };
                  })
                  .filter(
                    (
                      item,
                    ): item is {
                      id: string;
                      name: string;
                      min: number;
                      max: number;
                      q1: number;
                      median: number;
                      q3: number;
                      avg: number;
                    } => Boolean(item),
                  );
        const regionQueryStart = (() => {
                  if (normalizedRegionWindow === 'all') {
                    return resolvedStart;
                  }
                  const windowDays = Number(normalizedRegionWindow);
                  const anchor = resolvedEnd || endDate || new Date();
                  const start = new Date(anchor);
                  // 当前窗口 + 对比上一窗口，并额外补 7 天缓冲
                  start.setDate(start.getDate() - (windowDays * 2 + 7));
                  if (!resolvedStart) {
                    return start;
                  }
                  return start > resolvedStart ? start : resolvedStart;
                })();
        const pointTypeList = PriceDataUtils.parseCsv(pointTypes).filter((value): value is CollectionPointType =>
                  Object.values(CollectionPointType).includes(value as CollectionPointType),
                );
        const regionExpression = normalizedRegionLevel === 'province'
                    ? "COALESCE(NULLIF(p.\"province\", ''), NULLIF((p.\"region\")[1], ''), NULLIF(p.\"location\", ''), '其他')"
                    : normalizedRegionLevel === 'district'
                      ? "COALESCE(NULLIF(p.\"district\", ''), NULLIF((p.\"region\")[3], ''), NULLIF((p.\"region\")[2], ''), NULLIF(p.\"location\", ''), '其他')"
                      : "COALESCE(NULLIF(p.\"city\", ''), NULLIF((p.\"region\")[2], ''), NULLIF((p.\"region\")[1], ''), NULLIF(p.\"location\", ''), '其他')";
        const commodityCandidates = PriceDataUtils.resolveCommodityCandidates(commodity);
        const regionClauses: Prisma.Sql[] = [];
        if (commodityCandidates.length === 1) {
          regionClauses.push(Prisma.sql`p."commodity" = ${commodityCandidates[0]}`);
        } else if (commodityCandidates.length > 1) {
          regionClauses.push(Prisma.sql`p."commodity" IN (${Prisma.join(commodityCandidates)})`);
        }

        if (subTypeList.length > 0) {
          regionClauses.push(Prisma.sql`p."subType"::text IN (${Prisma.join(subTypeList)})`);
        }

        if (reviewStatuses && reviewStatuses.length > 0) {
          regionClauses.push(Prisma.sql`p."reviewStatus"::text IN (${Prisma.join(reviewStatuses)})`);
        }

        if (inputMethods && inputMethods.length > 0) {
          regionClauses.push(Prisma.sql`p."inputMethod"::text IN (${Prisma.join(inputMethods)})`);
        }

        if (regionQueryStart) {
          regionClauses.push(Prisma.sql`p."effectiveDate" >= ${regionQueryStart}`);
        }

        if (resolvedEnd) {
          regionClauses.push(Prisma.sql`p."effectiveDate" <= ${resolvedEnd}`);
        }

        if (regionCode) {
          regionClauses.push(Prisma.sql`p."regionCode" = ${regionCode}`);
        }

        if (pointTypeList.length > 0) {
          const pointTypeCondition = Prisma.sql`
        EXISTS (
          SELECT 1
          FROM "CollectionPoint" cp
          WHERE cp."id" = p."collectionPointId"
            AND cp."type"::text IN (${Prisma.join(pointTypeList)})
        )
      `;
          if (pointTypeList.includes(CollectionPointType.REGION)) {
            regionClauses.push(
              Prisma.sql`(${pointTypeCondition} OR p."sourceType"::text = ${regionalSourceType})`,
            );
          } else {
            regionClauses.push(pointTypeCondition);
          }
        }

        const buildRegionWhereSql = (extraClauses: Prisma.Sql[] = []) => {
                  const clauses = [...regionClauses, ...extraClauses];
                  if (clauses.length === 0) {
                    return Prisma.empty;
                  }
                  return Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`;
                };
        type RegionQualityStatsRow = {
                  total_samples: bigint | number;
                  active_days: bigint | number;
                  earliest_date: Date | null;
                  latest_date: Date | null;
                };
        const qualityStatsRows = await this.prisma.$queryRaw<RegionQualityStatsRow[]>(Prisma.sql`
      SELECT
        COUNT(*)::bigint AS total_samples,
        COUNT(DISTINCT p."effectiveDate")::bigint AS active_days,
        MIN(p."effectiveDate") AS earliest_date,
        MAX(p."effectiveDate") AS latest_date
      FROM "PriceData" p
      ${buildRegionWhereSql()}
    `);
        const qualityStats = qualityStatsRows[0];
        const totalRegionSamples = Number(qualityStats?.total_samples || 0);
        const activeRegionDays = Number(qualityStats?.active_days || 0);
        const earliestRegionDate = qualityStats?.earliest_date || null;
        const latestQualityDate = qualityStats?.latest_date || null;
        const qualityExpectedDays = startDate && endDate ? calcExpectedDays(resolvedStart, resolvedEnd) : null;
        const qualityMissingDays = qualityExpectedDays !== null ? Math.max(0, qualityExpectedDays - activeRegionDays) : null;
        type LatestAvgRow = {
                  latest_region_avg: number | null;
                };
        const latestAvgRows = latestQualityDate
                  ? await this.prisma.$queryRaw<LatestAvgRow[]>(Prisma.sql`
          SELECT AVG(p."price"::double precision) AS latest_region_avg
          FROM "PriceData" p
          ${buildRegionWhereSql([Prisma.sql`p."effectiveDate" = ${latestQualityDate}`])}
        `)
                  : [];
        const latestRegionAvg = latestAvgRows[0]?.latest_region_avg ?? null;
        const emptyRegionSummary = {
                  list: [] as Array<{
                    region: string;
                    avgPrice: number;
                    count: number;
                    minPrice: number;
                    maxPrice: number;
                    q1: number;
                    median: number;
                    q3: number;
                    std: number;
                    volatility: number;
                    missingRate: number;
                    latestTs: number;
                    hasPrev: boolean;
                    delta: number;
                    deltaPct: number;
                  }>,
                  overallAvg: null as number | null,
                  minAvg: 0,
                  maxAvg: 0,
                  rangeMin: 0,
                  rangeMax: 0,
                  windowLabel: '',
                  expectedDays: 0,
                };
        if (totalRegionSamples === 0) {
          return {
            ranking,
            distribution,
            meta: {
              meanLatestPrice,
              expectedDays: compareExpectedDays,
              selectedPointCount: uniquePointIds.length,
            },
            latestRegionAvg,
            quality: {
              totalSamples: 0,
              latestDate: null,
              missingDays: qualityMissingDays,
            },
            regions: emptyRegionSummary,
          };
        }

        let latestDate: Date | null = null;
        const earliestDate = earliestRegionDate ? startOfDay(earliestRegionDate) : null;
        if (latestQualityDate) {
          latestDate = startOfDay(latestQualityDate);
        }

        const windowEnd = endDate && !Number.isNaN(endDate.getTime())
                    ? startOfDay(endDate)
                    : latestDate || startOfDay(new Date());
        const windowDays = normalizedRegionWindow === 'all' ? null : Number(normalizedRegionWindow);
        const windowStart = windowDays
                  ? new Date(windowEnd.getTime() - (windowDays - 1) * dayMs)
                  : startDate && !Number.isNaN(startDate.getTime())
                    ? startOfDay(startDate)
                    : earliestDate || new Date(windowEnd.getTime() - 29 * dayMs);
        const regionExpectedDays = Math.max(
                  1,
                  Math.floor((windowEnd.getTime() - windowStart.getTime()) / dayMs) + 1,
                );
        const prevWindowEnd = windowDays ? new Date(windowStart.getTime() - dayMs) : null;
        const prevWindowStart = windowDays && prevWindowEnd
                    ? new Date(prevWindowEnd.getTime() - (windowDays - 1) * dayMs)
                    : null;
        type RegionStatsRow = {
                  region: string;
                  count: bigint | number;
                  avg_price: number;
                  min_price: number;
                  max_price: number;
                  q1: number;
                  median: number;
                  q3: number;
                  std: number;
                  unique_days: bigint | number;
                  latest_ts: bigint | number;
                };
        const currentRegionRows = await this.prisma.$queryRaw<RegionStatsRow[]>(Prisma.sql`
      SELECT
        t.region AS region,
        COUNT(*)::bigint AS count,
        AVG(t.price)::double precision AS avg_price,
        MIN(t.price)::double precision AS min_price,
        MAX(t.price)::double precision AS max_price,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY t.price)::double precision AS q1,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY t.price)::double precision AS median,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY t.price)::double precision AS q3,
        COALESCE(STDDEV_POP(t.price), 0)::double precision AS std,
        COUNT(DISTINCT t."effectiveDate")::bigint AS unique_days,
        (EXTRACT(EPOCH FROM MAX(t."effectiveDate")) * 1000)::bigint AS latest_ts
      FROM (
        SELECT
          p."effectiveDate" AS "effectiveDate",
          p."price"::double precision AS price,
          ${Prisma.raw(regionExpression)} AS region
        FROM "PriceData" p
        ${buildRegionWhereSql([
                      Prisma.sql`p."effectiveDate" >= ${windowStart}`,
                      Prisma.sql`p."effectiveDate" <= ${windowEnd}`,
                    ])}
      ) t
      GROUP BY t.region
    `);
        type PrevRegionAvgRow = {
                  region: string;
                  prev_avg: number;
                };
        const prevRegionRows = windowDays && prevWindowStart && prevWindowEnd
                    ? await this.prisma.$queryRaw<PrevRegionAvgRow[]>(Prisma.sql`
            SELECT
              t.region AS region,
              AVG(t.price)::double precision AS prev_avg
            FROM (
              SELECT
                p."price"::double precision AS price,
                ${Prisma.raw(regionExpression)} AS region
              FROM "PriceData" p
              ${buildRegionWhereSql([
                            Prisma.sql`p."effectiveDate" >= ${prevWindowStart}`,
                            Prisma.sql`p."effectiveDate" <= ${prevWindowEnd}`,
                          ])}
            ) t
            GROUP BY t.region
          `)
                    : [];
        const prevAvgMap = new Map(prevRegionRows.map((row) => [row.region, Number(row.prev_avg)]));
        const regionList = currentRegionRows.map((row) => {
                  const avgPrice = Number(row.avg_price);
                  const minPrice = Number(row.min_price);
                  const maxPrice = Number(row.max_price);
                  const prevAvg = prevAvgMap.get(row.region);
                  const hasPrev = typeof prevAvg === 'number';
                  const delta = hasPrev ? avgPrice - (prevAvg as number) : 0;
                  const deltaPct = hasPrev && prevAvg ? (delta / prevAvg) * 100 : 0;
                  const uniqueDays = Number(row.unique_days);
                  return {
                    region: row.region,
                    avgPrice,
                    count: Number(row.count),
                    minPrice,
                    maxPrice,
                    q1: Number(row.q1),
                    median: Number(row.median),
                    q3: Number(row.q3),
                    std: Number(row.std),
                    volatility: avgPrice ? (maxPrice - minPrice) / avgPrice : 0,
                    missingRate: regionExpectedDays > 0 ? 1 - uniqueDays / regionExpectedDays : 0,
                    latestTs: Number(row.latest_ts),
                    hasPrev,
                    delta,
                    deltaPct,
                  };
                });
        const overallAvg = regionList.length > 0
                    ? regionList.reduce((sum, item) => sum + item.avgPrice, 0) / regionList.length
                    : null;
        const minAvg = regionList.length > 0 ? Math.min(...regionList.map((item) => item.avgPrice)) : 0;
        const maxAvg = regionList.length > 0 ? Math.max(...regionList.map((item) => item.avgPrice)) : 0;
        const rangeMin = regionList.length > 0 ? Math.min(...regionList.map((item) => item.minPrice)) : 0;
        const rangeMax = regionList.length > 0 ? Math.max(...regionList.map((item) => item.maxPrice)) : 0;
        const result = {
                  ranking,
                  distribution,
                  meta: {
                    meanLatestPrice,
                    expectedDays: compareExpectedDays,
                    selectedPointCount: uniquePointIds.length,
                  },
                  latestRegionAvg,
                  quality: {
                    totalSamples: totalRegionSamples,
                    latestDate: latestQualityDate,
                    missingDays: qualityMissingDays,
                  },
                  regions: {
                    list: regionList,
                    overallAvg,
                    minAvg,
                    maxAvg,
                    rangeMin,
                    rangeMax,
                    windowLabel:
                      normalizedRegionWindow === 'all' ? '当前筛选区间' : `近 ${normalizedRegionWindow} 天`,
                    expectedDays: regionExpectedDays,
                  },
                };
        this.logPerf('getCompareAnalytics', startedAt, {
          selectedPoints: uniquePointIds.length,
          compareRows: compareRows.length,
          regionRows: totalRegionSamples,
          groupedRegions: regionList.length,
          regionWindow: normalizedRegionWindow,
          regionLevel: normalizedRegionLevel,
          hasCommodity: Boolean(commodity),
        });
        return result;
    }


}
