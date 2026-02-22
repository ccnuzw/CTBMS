import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { Prisma } from "@prisma/client";

@Injectable()
export class PriceTimeseriesService {
    private readonly logger = new Logger(PriceTimeseriesService.name);

    constructor(private prisma: PrismaService) {}



    /**
     * 获取趋势数据 (用于 K 线图)
     */
    async getTrend(commodity: string, location: string, days = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const commodityFilter = PriceDataUtils.buildCommodityFilter(commodity);
        const data = await this.prisma.priceData.findMany({
                  where: {
                    ...(commodityFilter ? { commodity: commodityFilter } : {}),
                    location: { contains: location, mode: 'insensitive' },
                    effectiveDate: { gte: startDate },
                  },
                  orderBy: { effectiveDate: 'asc' },
                  select: {
                    effectiveDate: true,
                    price: true,
                    dayChange: true,
                  },
                });
        return data.map((item) => ({
          date: item.effectiveDate,
          price: Number(item.price),
          change: item.dayChange ? Number(item.dayChange) : null,
        }));
    }



    /**
     * 获取价格热力地图数据
     */
    async getHeatmap(commodity: string, date?: Date) {
        const targetDate = date || new Date();
        const commodityFilter = PriceDataUtils.buildCommodityFilter(commodity);
        const data = await this.prisma.priceData.findMany({
                  where: {
                    ...(commodityFilter ? { commodity: commodityFilter } : {}),
                    effectiveDate: targetDate,
                  },
                  select: {
                    location: true,
                    region: true,
                    price: true,
                    dayChange: true,
                    // 新增：采集点信息
                    collectionPointId: true,
                    collectionPoint: {
                      select: { code: true, name: true, type: true },
                    },
                  },
                });
        return data.map((item) => ({
          location: item.location,
          region: item.region,
          price: Number(item.price),
          change: item.dayChange ? Number(item.dayChange) : null,
          collectionPointId: item.collectionPointId,
          collectionPoint: item.collectionPoint,
        }));
    }



    /**
     * 按采集点查询历史价格（时间序列）
     * 用于连续性数据分析
     */
    async getByCollectionPoint(collectionPointId: string, commodity?: string, days = 30, startDate?: Date, endDate?: Date, subTypes?: string | string[], reviewScope?: string, sourceScope?: string) {
        const { startDate: resolvedStart, endDate: resolvedEnd } = PriceDataUtils.resolveDateRange(
                  days,
                  startDate,
                  endDate,
                );
        const where: Prisma.PriceDataWhereInput = {
                  collectionPointId,
                };
        const commodityFilter = PriceDataUtils.buildCommodityFilter(commodity);
        if (commodityFilter) where.commodity = commodityFilter;
        const subTypeList = PriceDataUtils.parsePriceSubTypes(subTypes);
        if (subTypeList.length > 0) {
          where.subType = { in: subTypeList };
        }

        const reviewStatuses = PriceDataUtils.resolveReviewStatuses(reviewScope);
        if (reviewStatuses && reviewStatuses.length > 0) {
          where.reviewStatus = { in: reviewStatuses };
        }

        const inputMethods = PriceDataUtils.resolveInputMethods(sourceScope);
        if (inputMethods && inputMethods.length > 0) {
          where.inputMethod = { in: inputMethods };
        }

        if (resolvedStart || resolvedEnd) {
          where.effectiveDate = {};
          if (resolvedStart) where.effectiveDate.gte = resolvedStart;
          if (resolvedEnd) where.effectiveDate.lte = resolvedEnd;
        }

        const [data, collectionPoint] = await Promise.all([
                  this.prisma.priceData.findMany({
                    where,
                    orderBy: { effectiveDate: 'asc' },
                    select: {
                      id: true,
                      effectiveDate: true,
                      commodity: true,
                      price: true,
                      dayChange: true,
                      sourceType: true,
                      subType: true,
                      note: true,
                    },
                  }),
                  this.prisma.collectionPoint.findUnique({
                    where: { id: collectionPointId },
                    select: { id: true, code: true, name: true, shortName: true, type: true, regionCode: true },
                  }),
                ]);
        return {
          collectionPoint,
          data: data.map((item) => ({
            id: item.id,
            date: item.effectiveDate,
            commodity: item.commodity,
            price: Number(item.price),
            change: item.dayChange ? Number(item.dayChange) : null,
            sourceType: item.sourceType,
            subType: item.subType,
            note: item.note,
          })),
          summary: {
            count: data.length,
            minPrice: data.length > 0 ? Math.min(...data.map((d) => Number(d.price))) : null,
            maxPrice: data.length > 0 ? Math.max(...data.map((d) => Number(d.price))) : null,
            avgPrice:
              data.length > 0 ? data.reduce((sum, d) => sum + Number(d.price), 0) / data.length : null,
          },
        };
    }



    /**
     * 按行政区划查询价格数据（支持聚合）
     * 用于区域连续性分析
     */
    async getByRegion(regionCode: string, commodity?: string, days = 30, startDate?: Date, endDate?: Date, subTypes?: string | string[], reviewScope?: string, sourceScope?: string, includeData = false) {
        const startedAt = Date.now();
        const { startDate: resolvedStart, endDate: resolvedEnd } = PriceDataUtils.resolveDateRange(
                  days,
                  startDate,
                  endDate,
                );
        const where: Prisma.PriceDataWhereInput = {
                  regionCode,
                };
        const commodityFilter = PriceDataUtils.buildCommodityFilter(commodity);
        if (commodityFilter) where.commodity = commodityFilter;
        const subTypeList = PriceDataUtils.parsePriceSubTypes(subTypes);
        if (subTypeList.length > 0) {
          where.subType = { in: subTypeList };
        }

        const reviewStatuses = PriceDataUtils.resolveReviewStatuses(reviewScope);
        if (reviewStatuses && reviewStatuses.length > 0) {
          where.reviewStatus = { in: reviewStatuses };
        }

        const inputMethods = PriceDataUtils.resolveInputMethods(sourceScope);
        if (inputMethods && inputMethods.length > 0) {
          where.inputMethod = { in: inputMethods };
        }

        if (resolvedStart || resolvedEnd) {
          where.effectiveDate = {};
          if (resolvedStart) where.effectiveDate.gte = resolvedStart;
          if (resolvedEnd) where.effectiveDate.lte = resolvedEnd;
        }

        const trendRows = await this.prisma.priceData.findMany({
                  where,
                  orderBy: [{ effectiveDate: 'asc' }],
                  select: {
                    effectiveDate: true,
                    price: true,
                    location: true,
                  },
                });
        const data = includeData
                  ? await this.prisma.priceData.findMany({
                      where,
                      orderBy: [{ effectiveDate: 'asc' }, { location: 'asc' }],
                      select: {
                        id: true,
                        effectiveDate: true,
                        location: true,
                        commodity: true,
                        price: true,
                        dayChange: true,
                        sourceType: true,
                        collectionPointId: true,
                        collectionPoint: {
                          select: { code: true, name: true, type: true },
                        },
                      },
                    })
                  : [];
        const region = await this.prisma.administrativeRegion.findUnique({
                  where: { code: regionCode },
                  select: { code: true, name: true, level: true, shortName: true },
                });
        const dailyAggregation: Record<string, { prices: number[]; count: number }> = {};
        for (const item of trendRows) {
          const dateKey = item.effectiveDate.toISOString().split('T')[0];
          if (!dailyAggregation[dateKey]) {
            dailyAggregation[dateKey] = { prices: [], count: 0 };
          }
          dailyAggregation[dateKey].prices.push(Number(item.price));
          dailyAggregation[dateKey].count++;
        }

        const trend = Object.entries(dailyAggregation)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, agg]) => ({
                    date,
                    avgPrice: agg.prices.reduce((a, b) => a + b, 0) / agg.prices.length,
                    minPrice: Math.min(...agg.prices),
                    maxPrice: Math.max(...agg.prices),
                    count: agg.count,
                  }));
        const result = {
                  region,
                  data: data.map((item) => ({
                    id: item.id,
                    date: item.effectiveDate,
                    location: item.location,
                    commodity: item.commodity,
                    price: Number(item.price),
                    change: item.dayChange ? Number(item.dayChange) : null,
                    sourceType: item.sourceType,
                    collectionPoint: item.collectionPoint,
                  })),
                  trend,
                  summary: {
                    totalRecords: trendRows.length,
                    uniqueLocations: [...new Set(trendRows.map((d) => d.location))].length,
                  },
                };
        this.logPerf('getByRegion', startedAt, {
          regionCode,
          includeData,
          trendRows: trendRows.length,
          dataRows: data.length,
          hasCommodity: Boolean(commodity),
        });
        return result;
    }



    /**
     * 获取多采集点对比趋势
     */
    async getMultiPointTrend(collectionPointIds: string[], commodity: string, days = 30, startDate?: Date, endDate?: Date, subTypes?: string | string[], reviewScope?: string, sourceScope?: string) {
        const { startDate: resolvedStart, endDate: resolvedEnd } = PriceDataUtils.resolveDateRange(
                  days,
                  startDate,
                  endDate,
                );
        const subTypeList = PriceDataUtils.parsePriceSubTypes(subTypes);
        const commodityFilter = PriceDataUtils.buildCommodityFilter(commodity);
        const reviewStatuses = PriceDataUtils.resolveReviewStatuses(reviewScope);
        const inputMethods = PriceDataUtils.resolveInputMethods(sourceScope);
        const data = await this.prisma.priceData.findMany({
                  where: {
                    collectionPointId: { in: collectionPointIds },
                    ...(commodityFilter ? { commodity: commodityFilter } : {}),
                    ...(subTypeList.length > 0 ? { subType: { in: subTypeList } } : {}),
                    ...(reviewStatuses && reviewStatuses.length > 0
                      ? { reviewStatus: { in: reviewStatuses } }
                      : {}),
                    ...(inputMethods && inputMethods.length > 0 ? { inputMethod: { in: inputMethods } } : {}),
                    effectiveDate: {
                      ...(resolvedStart ? { gte: resolvedStart } : {}),
                      ...(resolvedEnd ? { lte: resolvedEnd } : {}),
                    },
                  },
                  orderBy: { effectiveDate: 'asc' },
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
        const grouped: Record<string, PricePointGroup> = {};
        for (const item of data) {
          const pointId = item.collectionPointId!;
          if (!grouped[pointId]) {
            grouped[pointId] = {
              point: item.collectionPoint,
              data: [],
            };
          }
          grouped[pointId].data.push({
            date: item.effectiveDate,
            price: Number(item.price),
            change: item.dayChange ? Number(item.dayChange) : null,
          });
        }

        return Object.values(grouped);
    }


}
