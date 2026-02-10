import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CreatePriceDataDto, PriceDataQuery } from '@packages/types';
import { Decimal } from '@prisma/client/runtime/library';
import {
  CollectionPointType,
  GeoLevel,
  MarketAlertAction,
  MarketAlertRuleType,
  MarketAlertSeverity,
  MarketAlertStatus,
  PriceData,
  PriceSourceType,
  PriceSubType,
  Prisma,
} from '@prisma/client';

type CollectionPointSummary = {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  type: CollectionPointType;
  regionCode?: string | null;
  region?: {
    code: string;
    name: string;
    shortName: string | null;
  } | null;
} | null;

type PricePointGroup = {
  point: CollectionPointSummary;
  data: Array<{ date: Date; price: number; change: number | null }>;
};

type PriceDataRecord = PriceData & { collectionPoint?: CollectionPointSummary };

const COMMODITY_CODE_TO_LABEL: Record<string, string> = {
  CORN: '玉米',
  WHEAT: '小麦',
  SOYBEAN: '大豆',
  RICE: '稻谷',
  SORGHUM: '高粱',
  BARLEY: '大麦',
};
const LEGACY_PRICE_SUBTYPE_TO_CANONICAL: Record<string, PriceSubType> = {
  STATION_ORIGIN: PriceSubType.STATION,
  STATION_DEST: PriceSubType.STATION,
};

const CORRECTED_NOTE_KEYWORDS = ['修正', '更正', '校正', '修订'];
const IMPUTED_NOTE_KEYWORDS = ['补录', '估算', '插值', '补齐', '回填'];
const LATE_HOURS_THRESHOLD = 36;
const PRICE_QUALITY_TAGS = ['RAW', 'IMPUTED', 'CORRECTED', 'LATE'] as const;
type PriceQualityTag = (typeof PRICE_QUALITY_TAGS)[number];
const ALERT_RULE_DOMAIN = 'MARKET_ALERT_RULE';

type AlertRulePayload = {
  name: string;
  type: MarketAlertRuleType;
  threshold?: number;
  days?: number;
  direction?: 'UP' | 'DOWN' | 'BOTH';
  severity?: MarketAlertSeverity;
};

type AlertRuleInput = {
  name: string;
  type: MarketAlertRuleType;
  threshold?: number;
  days?: number;
  direction?: 'UP' | 'DOWN' | 'BOTH';
  severity?: MarketAlertSeverity;
  priority?: number;
  isActive?: boolean;
};

type AlertHit = {
  dedupeKey: string;
  ruleId: string;
  ruleName: string;
  ruleType: MarketAlertRuleType;
  severity: MarketAlertSeverity;
  pointId: string;
  pointName: string;
  pointType: string;
  regionLabel: string | null;
  commodity: string;
  triggerDate: Date;
  triggerValue: number;
  thresholdValue: number;
  message: string;
};

@Injectable()
export class PriceDataService {
  constructor(private prisma: PrismaService) {}

  private parseCsv(value?: string | string[]) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private normalizePriceSubType(value?: string | null) {
    if (!value) return null;
    const normalized = value.trim().toUpperCase();
    if (!normalized) return null;
    if (LEGACY_PRICE_SUBTYPE_TO_CANONICAL[normalized]) {
      return LEGACY_PRICE_SUBTYPE_TO_CANONICAL[normalized];
    }
    if (Object.values(PriceSubType).includes(normalized as PriceSubType)) {
      return normalized as PriceSubType;
    }
    return null;
  }

  private parsePriceSubTypes(value?: string | string[]) {
    const parsed = this.parseCsv(value)
      .map((item) => this.normalizePriceSubType(item))
      .filter((item): item is PriceSubType => Boolean(item));
    return [...new Set(parsed)];
  }

  private resolveDateRange(days = 30, startDate?: Date | string, endDate?: Date | string) {
    const resolvedStart = startDate ? new Date(startDate) : undefined;
    const resolvedEnd = endDate ? new Date(endDate) : undefined;
    if (!resolvedStart && days) {
      const end = resolvedEnd ?? new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - days);
      return { startDate: start, endDate: resolvedEnd ?? end };
    }
    return { startDate: resolvedStart, endDate: resolvedEnd };
  }

  private resolveCommodityCandidates(commodity?: string) {
    if (!commodity) return [];
    const value = commodity.trim();
    if (!value) return [];

    const candidates = new Set<string>([value]);
    const upperCode = value.toUpperCase();
    const mappedLabel = COMMODITY_CODE_TO_LABEL[upperCode];
    if (mappedLabel) {
      candidates.add(upperCode);
      candidates.add(mappedLabel);
    }

    const reverseCode = Object.entries(COMMODITY_CODE_TO_LABEL).find(
      ([, label]) => label === value,
    )?.[0];
    if (reverseCode) {
      candidates.add(reverseCode);
      candidates.add(COMMODITY_CODE_TO_LABEL[reverseCode]);
    }

    return Array.from(candidates);
  }

  private buildCommodityFilter(commodity?: string): string | Prisma.StringFilter | undefined {
    const candidates = this.resolveCommodityCandidates(commodity);
    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];
    return { in: candidates };
  }

  private toDateKey(date: Date) {
    return date.toISOString().split('T')[0];
  }

  private inferQualityTag(
    data: Pick<PriceData, 'note' | 'effectiveDate' | 'createdAt'>,
  ): PriceQualityTag {
    const note = (data.note || '').trim();
    if (CORRECTED_NOTE_KEYWORDS.some((keyword) => note.includes(keyword))) {
      return 'CORRECTED';
    }
    if (IMPUTED_NOTE_KEYWORDS.some((keyword) => note.includes(keyword))) {
      return 'IMPUTED';
    }
    const lateHours = (data.createdAt.getTime() - data.effectiveDate.getTime()) / (1000 * 60 * 60);
    if (lateHours > LATE_HOURS_THRESHOLD) {
      return 'LATE';
    }
    return 'RAW';
  }

  private scoreGrade(score: number): 'A' | 'B' | 'C' | 'D' {
    if (score >= 85) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    return 'D';
  }

  private parseAlertRulePayload(value: string): AlertRulePayload | null {
    try {
      const parsed = JSON.parse(value) as AlertRulePayload;
      if (!parsed || typeof parsed !== 'object' || !parsed.type) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private normalizeAlertRuleInput(input: AlertRuleInput) {
    const name = (input.name || '').trim();
    if (!name) {
      throw new BadRequestException('规则名称不能为空');
    }
    const type = input.type;
    if (!type) {
      throw new BadRequestException('规则类型不能为空');
    }
    const threshold = input.threshold !== undefined ? Number(input.threshold) : null;
    const days = input.days !== undefined ? Number(input.days) : null;
    const direction = (input.direction || 'BOTH') as 'UP' | 'DOWN' | 'BOTH';
    const severity = (input.severity || 'MEDIUM') as MarketAlertSeverity;
    if (
      (type === 'DAY_CHANGE_ABS' ||
        type === 'DAY_CHANGE_PCT' ||
        type === 'DEVIATION_FROM_MEAN_PCT') &&
      (!threshold || threshold <= 0)
    ) {
      throw new BadRequestException('阈值必须为正数');
    }
    if (type === 'CONTINUOUS_DAYS' && (!days || days < 2)) {
      throw new BadRequestException('连续天数必须 >= 2');
    }
    return {
      name,
      type,
      threshold: type === 'CONTINUOUS_DAYS' ? null : threshold,
      days: type === 'CONTINUOUS_DAYS' ? days : null,
      direction,
      severity,
      priority: Number(input.priority) || 0,
      isActive: input.isActive ?? true,
    };
  }

  private async ensureAlertRulesMigrated() {
    const currentCount = await this.prisma.marketAlertRule.count();
    if (currentCount > 0) return;

    const legacyRules = await this.prisma.businessMappingRule.findMany({
      where: { domain: ALERT_RULE_DOMAIN },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    if (legacyRules.length === 0) return;

    for (const legacyRule of legacyRules) {
      const payload = this.parseAlertRulePayload(legacyRule.targetValue);
      if (!payload?.type) continue;

      const normalized = this.normalizeAlertRuleInput({
        name: payload.name || legacyRule.description || legacyRule.pattern,
        type: payload.type,
        threshold: payload.threshold,
        days: payload.days,
        direction: payload.direction || 'BOTH',
        severity: payload.severity || 'MEDIUM',
        priority: legacyRule.priority,
        isActive: legacyRule.isActive,
      });

      await this.prisma.marketAlertRule.upsert({
        where: { legacyRuleId: legacyRule.id },
        create: {
          name: normalized.name,
          type: normalized.type,
          threshold: normalized.threshold,
          days: normalized.days,
          direction: normalized.direction,
          severity: normalized.severity,
          priority: normalized.priority,
          isActive: normalized.isActive,
          legacyRuleId: legacyRule.id,
        },
        update: {
          name: normalized.name,
          type: normalized.type,
          threshold: normalized.threshold,
          days: normalized.days,
          direction: normalized.direction,
          severity: normalized.severity,
          priority: normalized.priority,
          isActive: normalized.isActive,
        },
      });
    }
  }

  private async resolveAlertRules(onlyActive = true) {
    await this.ensureAlertRulesMigrated();
    const rows = await this.prisma.marketAlertRule.findMany({
      where: {
        ...(onlyActive ? { isActive: true } : {}),
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      threshold: row.threshold === null ? undefined : Number(row.threshold),
      days: row.days === null ? undefined : row.days,
      direction: (row.direction || 'BOTH') as 'UP' | 'DOWN' | 'BOTH',
      severity: row.severity,
      isActive: row.isActive,
      priority: row.priority,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  private resolveAlertAction(fromStatus: MarketAlertStatus, toStatus: MarketAlertStatus) {
    if (fromStatus === 'OPEN' && toStatus === 'ACKNOWLEDGED') {
      return MarketAlertAction.ACK;
    }
    if (toStatus === 'CLOSED') {
      return MarketAlertAction.CLOSE;
    }
    if (toStatus === 'OPEN' && fromStatus !== 'OPEN') {
      return MarketAlertAction.REOPEN;
    }
    return MarketAlertAction.UPDATE_HIT;
  }

  private isValidStatusTransition(fromStatus: MarketAlertStatus, toStatus: MarketAlertStatus) {
    if (fromStatus === toStatus) return true;
    if (fromStatus === 'OPEN' && (toStatus === 'ACKNOWLEDGED' || toStatus === 'CLOSED'))
      return true;
    if (fromStatus === 'ACKNOWLEDGED' && (toStatus === 'OPEN' || toStatus === 'CLOSED'))
      return true;
    if (fromStatus === 'CLOSED' && toStatus === 'OPEN') return true;
    return false;
  }

  /**
   * 创建价格数据
   */
  async create(dto: CreatePriceDataDto, authorId: string) {
    // 获取昨日价格用于计算涨跌
    const yesterday = new Date(dto.effectiveDate);
    yesterday.setDate(yesterday.getDate() - 1);

    const yesterdayPrice = await this.prisma.priceData.findFirst({
      where: {
        commodity: dto.commodity,
        location: dto.location,
        effectiveDate: yesterday,
      },
      select: { price: true },
    });

    // 获取去年同期价格
    const lastYear = new Date(dto.effectiveDate);
    lastYear.setFullYear(lastYear.getFullYear() - 1);

    const lastYearPrice = await this.prisma.priceData.findFirst({
      where: {
        commodity: dto.commodity,
        location: dto.location,
        effectiveDate: lastYear,
      },
      select: { price: true },
    });

    const dayChange = yesterdayPrice ? dto.price - Number(yesterdayPrice.price) : null;
    const yearChange = lastYearPrice ? dto.price - Number(lastYearPrice.price) : null;

    return this.prisma.priceData.create({
      data: {
        effectiveDate: dto.effectiveDate,
        commodity: dto.commodity,
        grade: dto.grade,
        location: dto.location,
        region: dto.region || [],
        price: new Decimal(dto.price),
        moisture: dto.moisture ? new Decimal(dto.moisture) : null,
        bulkDensity: dto.bulkDensity,
        toxin: dto.toxin ? new Decimal(dto.toxin) : null,
        freight: dto.freight ? new Decimal(dto.freight) : null,
        inventory: dto.inventory,
        dayChange: dayChange ? new Decimal(dayChange) : null,
        yearChange: yearChange ? new Decimal(yearChange) : null,
        intelId: dto.intelId,
        authorId,
      },
    });
  }

  /**
   * 查询价格数据 (分页)
   * 增强版：支持按采集点和行政区划过滤
   */
  async findAll(query: PriceDataQuery) {
    const {
      sourceType,
      subType,
      subTypes,
      geoLevel,
      commodity,
      location,
      province,
      city,
      // enterpriseId, [REMOVED]
      startDate,
      endDate,
      keyword,
      collectionPointId,
      collectionPointIds,
      regionCode,
      pointTypes,
    } = query;
    const qualityTags = (query as { qualityTags?: string[] | string }).qualityTags;
    // Query 参数从 URL 传入时都是字符串，需要转换
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;

    const andFilters: Prisma.PriceDataWhereInput[] = [];
    const commodityFilter = this.buildCommodityFilter(commodity);
    if (commodityFilter) andFilters.push({ commodity: commodityFilter });
    if (location) andFilters.push({ location: { contains: location, mode: 'insensitive' } });
    if (province) andFilters.push({ province });
    if (city) andFilters.push({ city });
    // if (enterpriseId) andFilters.push({ enterpriseId }); [REMOVED]
    const resolvedSourceType = Object.values(PriceSourceType).includes(
      sourceType as PriceSourceType,
    )
      ? (sourceType as PriceSourceType)
      : undefined;
    if (resolvedSourceType) andFilters.push({ sourceType: resolvedSourceType });

    const subTypeList = this.parsePriceSubTypes(subTypes);
    const resolvedSubType = this.normalizePriceSubType(subType);
    if (subTypeList.length === 0 && resolvedSubType) {
      andFilters.push({ subType: resolvedSubType });
    }
    const resolvedGeoLevel = Object.values(GeoLevel).includes(geoLevel as GeoLevel)
      ? (geoLevel as GeoLevel)
      : undefined;
    if (resolvedGeoLevel) andFilters.push({ geoLevel: resolvedGeoLevel });
    if (subTypeList.length > 0) {
      andFilters.push({ subType: { in: subTypeList } });
    }

    // 采集点过滤
    if (collectionPointId) {
      andFilters.push({ collectionPointId });
    }
    const collectionPointIdList = this.parseCsv(collectionPointIds);
    if (collectionPointIdList.length > 0) {
      andFilters.push({ collectionPointId: { in: collectionPointIdList } });
    }

    // 行政区划过滤
    if (regionCode) {
      andFilters.push({ regionCode });
    }

    // 采集点类型过滤（含 REGIONAL 类型）
    const pointTypeList = this.parseCsv(pointTypes).filter((value): value is CollectionPointType =>
      Object.values(CollectionPointType).includes(value as CollectionPointType),
    );
    if (pointTypeList.length > 0) {
      const orConditions: Prisma.PriceDataWhereInput[] = [];
      orConditions.push({ collectionPoint: { type: { in: pointTypeList } } });
      if (pointTypeList.includes(CollectionPointType.REGION)) {
        orConditions.push({ sourceType: PriceSourceType.REGIONAL });
      }
      if (orConditions.length > 0) {
        andFilters.push({ OR: orConditions });
      }
    }

    // 日期范围
    if (startDate || endDate) {
      const range: Prisma.DateTimeFilter = {};
      if (startDate) range.gte = new Date(startDate);
      if (endDate) range.lte = new Date(endDate);
      andFilters.push({ effectiveDate: range });
    }

    // Keyword Search
    if (keyword) {
      andFilters.push({
        OR: [
          { commodity: { contains: keyword, mode: 'insensitive' } },
          { location: { contains: keyword, mode: 'insensitive' } },
          { region: { has: keyword } },
        ],
      });
    }

    const where = andFilters.length > 0 ? { AND: andFilters } : {};
    const qualityTagList = this.parseCsv(qualityTags).filter((value): value is PriceQualityTag =>
      PRICE_QUALITY_TAGS.includes(value as PriceQualityTag),
    );

    if (qualityTagList.length > 0) {
      const fullData = await this.prisma.priceData.findMany({
        where,
        orderBy: { effectiveDate: 'desc' },
        include: {
          collectionPoint: {
            select: { id: true, code: true, name: true, shortName: true, type: true },
          },
        },
      });

      const filtered = fullData
        .map((item) => this.serializePriceData(item))
        .filter((item) => qualityTagList.includes(item.qualityTag));
      const total = filtered.length;
      const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

      return {
        data: paged,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.priceData.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { effectiveDate: 'desc' },
        // 新增：包含采集点关联信息
        include: {
          collectionPoint: {
            select: { id: true, code: true, name: true, shortName: true, type: true },
          },
        },
      }),
      this.prisma.priceData.count({ where }),
    ]);

    return {
      data: data.map((item) => this.serializePriceData(item)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
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
      days,
    } = query;
    const daysValue = Number(days) || 30;
    const { startDate: resolvedStart, endDate: resolvedEnd } = this.resolveDateRange(
      daysValue,
      startDate,
      endDate,
    );
    const commodityFilter = this.buildCommodityFilter(commodity);
    const subTypeList = this.parsePriceSubTypes(subTypes);
    const pointTypeList = this.parseCsv(pointTypes).filter((value): value is CollectionPointType =>
      Object.values(CollectionPointType).includes(value as CollectionPointType),
    );
    const collectionPointIdList = [
      ...this.parseCsv(collectionPointIds),
      ...(collectionPointId ? [collectionPointId] : []),
    ];

    const andFilters: Prisma.PriceDataWhereInput[] = [];
    if (commodityFilter) andFilters.push({ commodity: commodityFilter });
    if (regionCode) andFilters.push({ regionCode });
    if (subTypeList.length > 0) andFilters.push({ subType: { in: subTypeList } });
    if (collectionPointIdList.length > 0) {
      andFilters.push({ collectionPointId: { in: [...new Set(collectionPointIdList)] } });
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
    const expectedDays =
      rangeStart && rangeEnd
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
      const dateKey = this.toDateKey(row.effectiveDate);
      group.uniqueDays.add(dateKey);
      group.recordCount += 1;
      if (!group.latestDate || row.effectiveDate > group.latestDate) {
        group.latestDate = row.effectiveDate;
      }
      const qualityTag = this.inferQualityTag(row);
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
          grade: this.scoreGrade(score),
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

  async listAlertRules() {
    return this.resolveAlertRules(false);
  }

  async createAlertRule(input: AlertRuleInput) {
    const normalized = this.normalizeAlertRuleInput(input);
    await this.prisma.marketAlertRule.create({
      data: {
        name: normalized.name,
        type: normalized.type,
        threshold: normalized.threshold,
        days: normalized.days,
        direction: normalized.direction,
        severity: normalized.severity,
        priority: normalized.priority,
        isActive: normalized.isActive,
      },
    });
    return this.resolveAlertRules(false);
  }

  async updateAlertRule(id: string, input: Partial<AlertRuleInput>) {
    const existing = await this.prisma.marketAlertRule.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('预警规则不存在');
    }

    const mergedInput: AlertRuleInput = {
      name: input.name ?? existing.name,
      type: input.type ?? existing.type,
      threshold: input.threshold ?? (existing.threshold === null ? undefined : Number(existing.threshold)),
      days: input.days ?? (existing.days === null ? undefined : existing.days),
      direction: input.direction ?? ((existing.direction || 'BOTH') as 'UP' | 'DOWN' | 'BOTH'),
      severity: input.severity ?? existing.severity,
      priority: input.priority ?? existing.priority,
      isActive: input.isActive ?? existing.isActive,
    };
    const normalized = this.normalizeAlertRuleInput(mergedInput);

    await this.prisma.marketAlertRule.update({
      where: { id },
      data: {
        name: normalized.name,
        type: normalized.type,
        threshold: normalized.threshold,
        days: normalized.days,
        direction: normalized.direction,
        severity: normalized.severity,
        priority: normalized.priority,
        isActive: normalized.isActive,
      },
    });
    return this.resolveAlertRules(false);
  }

  async removeAlertRule(id: string) {
    const existing = await this.prisma.marketAlertRule.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('预警规则不存在');
    }
    await this.prisma.marketAlertRule.delete({ where: { id } });
    return { success: true };
  }

  private async buildAlertHits(query: Partial<PriceDataQuery> & { days?: number | string }) {
    const rules = await this.resolveAlertRules(true);
    if (rules.length === 0) {
      return [] as AlertHit[];
    }

    const daysValue = Number(query.days) || 30;
    const { startDate: resolvedStart, endDate: resolvedEnd } = this.resolveDateRange(
      daysValue,
      query.startDate,
      query.endDate,
    );
    const commodityFilter = this.buildCommodityFilter(query.commodity);
    const pointTypeList = this.parseCsv(query.pointTypes).filter(
      (value): value is CollectionPointType =>
        Object.values(CollectionPointType).includes(value as CollectionPointType),
    );
    const subTypeList = this.parsePriceSubTypes(query.subTypes);
    const collectionPointIdList = this.parseCsv(query.collectionPointIds);

    const andFilters: Prisma.PriceDataWhereInput[] = [];
    if (commodityFilter) andFilters.push({ commodity: commodityFilter });
    if (resolvedStart || resolvedEnd) {
      andFilters.push({
        effectiveDate: {
          ...(resolvedStart ? { gte: resolvedStart } : {}),
          ...(resolvedEnd ? { lte: resolvedEnd } : {}),
        },
      });
    }
    if (query.regionCode) andFilters.push({ regionCode: query.regionCode });
    if (subTypeList.length > 0) andFilters.push({ subType: { in: subTypeList } });
    if (collectionPointIdList.length > 0) {
      andFilters.push({ collectionPointId: { in: collectionPointIdList } });
    }
    if (pointTypeList.length > 0) {
      const orConditions: Prisma.PriceDataWhereInput[] = [
        { collectionPoint: { type: { in: pointTypeList } } },
      ];
      if (pointTypeList.includes(CollectionPointType.REGION)) {
        orConditions.push({ sourceType: PriceSourceType.REGIONAL });
      }
      andFilters.push({ OR: orConditions });
    }

    const rows = await this.prisma.priceData.findMany({
      where: andFilters.length > 0 ? { AND: andFilters } : {},
      orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        collectionPoint: {
          select: {
            id: true,
            name: true,
            shortName: true,
            code: true,
            type: true,
            region: { select: { name: true, shortName: true } },
          },
        },
      },
    });

    if (rows.length === 0) {
      return [] as AlertHit[];
    }

    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const pointKey =
        row.collectionPointId || `REGIONAL:${row.regionCode || 'NA'}:${row.location}`;
      if (!grouped.has(pointKey)) {
        grouped.set(pointKey, []);
      }
      grouped.get(pointKey)!.push(row);
    }

    const latestRecords = Array.from(grouped.values())
      .map((list) => list[list.length - 1])
      .filter(Boolean);
    const meanLatestPrice =
      latestRecords.length > 0
        ? latestRecords.reduce((sum, item) => sum + Number(item.price), 0) / latestRecords.length
        : 0;

    const hits: AlertHit[] = [];
    for (const [pointKey, list] of grouped.entries()) {
      const latest = list[list.length - 1];
      if (!latest) continue;
      const latestPrice = Number(latest.price);
      const latestChange = latest.dayChange ? Number(latest.dayChange) : 0;
      const latestChangePct = latestPrice ? Math.abs((latestChange / latestPrice) * 100) : 0;
      const pointName =
        latest.collectionPoint?.shortName || latest.collectionPoint?.name || latest.location;
      const pointType = latest.collectionPoint?.type || CollectionPointType.REGION;
      const regionLabel =
        latest.collectionPoint?.region?.shortName ||
        latest.collectionPoint?.region?.name ||
        latest.city ||
        latest.province ||
        null;

      for (const rule of rules) {
        let hit = false;
        let value = 0;
        let thresholdValue = Number(rule.threshold) || 0;
        let message = '';

        if (rule.type === 'DAY_CHANGE_ABS') {
          value = Math.abs(latestChange);
          hit = value >= thresholdValue;
          message = `${pointName} 单日涨跌 ${latestChange > 0 ? '+' : ''}${latestChange.toFixed(2)} 元/吨`;
        } else if (rule.type === 'DAY_CHANGE_PCT') {
          value = latestChangePct;
          hit = value >= thresholdValue;
          message = `${pointName} 单日波动 ${value.toFixed(2)}%`;
        } else if (rule.type === 'DEVIATION_FROM_MEAN_PCT') {
          value = meanLatestPrice
            ? Math.abs((latestPrice - meanLatestPrice) / meanLatestPrice) * 100
            : 0;
          hit = value >= thresholdValue;
          message = `${pointName} 偏离均值 ${value.toFixed(2)}%`;
        } else if (rule.type === 'CONTINUOUS_DAYS') {
          const windowDays = Math.max(2, Number(rule.days) || 3);
          const recent = list.slice(-windowDays);
          if (recent.length >= windowDays) {
            const up = recent.every(
              (item, index) => index === 0 || Number(item.price) >= Number(recent[index - 1].price),
            );
            const down = recent.every(
              (item, index) => index === 0 || Number(item.price) <= Number(recent[index - 1].price),
            );
            const direction = rule.direction || 'BOTH';
            hit = direction === 'BOTH' ? up || down : direction === 'UP' ? up : down;
            value = windowDays;
            thresholdValue = windowDays;
            message = `${pointName} 连续 ${windowDays} 天${up ? '上涨' : '下跌'}`;
          }
        }

        if (!hit) continue;
        hits.push({
          dedupeKey: `${rule.id}:${pointKey}:${this.toDateKey(latest.effectiveDate)}`,
          ruleId: rule.id,
          ruleName: rule.name,
          ruleType: rule.type,
          severity: rule.severity,
          pointId: pointKey,
          pointName,
          pointType,
          regionLabel,
          commodity: latest.commodity,
          triggerDate: latest.effectiveDate,
          triggerValue: Number(value.toFixed(2)),
          thresholdValue: Number(thresholdValue.toFixed(2)),
          message,
        });
      }
    }

    return hits;
  }

  async evaluateAlerts(query: Partial<PriceDataQuery> & { days?: number | string; limit?: number | string }) {
    const hits = await this.buildAlertHits(query);
    let created = 0;
    let updated = 0;

    for (const hit of hits) {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.marketAlertInstance.findFirst({
          where: {
            dedupeKey: hit.dedupeKey,
            status: { in: [MarketAlertStatus.OPEN, MarketAlertStatus.ACKNOWLEDGED] },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (existing) {
          await tx.marketAlertInstance.update({
            where: { id: existing.id },
            data: {
              severity: hit.severity,
              pointName: hit.pointName,
              pointType: hit.pointType,
              regionLabel: hit.regionLabel,
              commodity: hit.commodity,
              triggerDate: hit.triggerDate,
              lastTriggeredAt: new Date(),
              triggerValue: hit.triggerValue,
              thresholdValue: hit.thresholdValue,
              message: hit.message,
            },
          });
          await tx.marketAlertStatusLog.create({
            data: {
              instanceId: existing.id,
              action: MarketAlertAction.UPDATE_HIT,
              fromStatus: existing.status,
              toStatus: existing.status,
              operator: 'system-user-placeholder',
              meta: {
                triggerValue: hit.triggerValue,
                thresholdValue: hit.thresholdValue,
                message: hit.message,
              },
            },
          });
          updated += 1;
          return;
        }

        const createdAlert = await tx.marketAlertInstance.create({
          data: {
            ruleId: hit.ruleId,
            status: MarketAlertStatus.OPEN,
            severity: hit.severity,
            dedupeKey: hit.dedupeKey,
            pointId: hit.pointId,
            pointName: hit.pointName,
            pointType: hit.pointType,
            regionLabel: hit.regionLabel,
            commodity: hit.commodity,
            triggerDate: hit.triggerDate,
            firstTriggeredAt: new Date(),
            lastTriggeredAt: new Date(),
            triggerValue: hit.triggerValue,
            thresholdValue: hit.thresholdValue,
            message: hit.message,
          },
        });
        await tx.marketAlertStatusLog.create({
          data: {
            instanceId: createdAlert.id,
            action: MarketAlertAction.CREATE,
            toStatus: MarketAlertStatus.OPEN,
            operator: 'system-user-placeholder',
            meta: {
              ruleType: hit.ruleType,
              triggerValue: hit.triggerValue,
              thresholdValue: hit.thresholdValue,
            },
          },
        });
        created += 1;
      });
    }

    return {
      evaluatedAt: new Date(),
      total: hits.length,
      created,
      updated,
      closed: 0,
    };
  }

  async listAlertLogs(id: string) {
    const exists = await this.prisma.marketAlertInstance.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('预警实例不存在');
    }
    return this.prisma.marketAlertStatusLog.findMany({
      where: { instanceId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateAlertStatus(
    id: string,
    status: MarketAlertStatus,
    note?: string,
    reason?: string,
    operator = 'system-user-placeholder',
  ) {
    if (!Object.values(MarketAlertStatus).includes(status)) {
      throw new BadRequestException('状态不合法');
    }

    const alert = await this.prisma.marketAlertInstance.findUnique({ where: { id } });
    if (!alert) {
      throw new NotFoundException('预警实例不存在');
    }
    if (!this.isValidStatusTransition(alert.status, status)) {
      throw new BadRequestException(`不允许状态流转: ${alert.status} -> ${status}`);
    }

    const cleanNote = note?.trim() || undefined;
    const cleanReason = reason?.trim() || undefined;
    if (status === MarketAlertStatus.CLOSED && !cleanReason && !cleanNote) {
      throw new BadRequestException('关闭预警时必须提供原因');
    }

    const updated = await this.prisma.marketAlertInstance.update({
      where: { id },
      data: {
        status,
        note: cleanNote ?? alert.note ?? null,
        closedReason:
          status === MarketAlertStatus.CLOSED
            ? cleanReason || cleanNote || alert.closedReason || null
            : null,
      },
    });

    if (alert.status !== status) {
      await this.prisma.marketAlertStatusLog.create({
        data: {
          instanceId: alert.id,
          action: this.resolveAlertAction(alert.status, status),
          fromStatus: alert.status,
          toStatus: status,
          operator,
          note: cleanNote || null,
          reason: cleanReason || null,
        },
      });
    }

    return {
      success: true,
      id: updated.id,
      status: updated.status,
      note: updated.note,
      reason: updated.closedReason,
      updatedAt: updated.updatedAt,
    };
  }

  async getAlerts(
    query: Partial<PriceDataQuery> & {
      days?: number | string;
      severity?: string;
      status?: string;
      limit?: number | string;
      refresh?: string | boolean;
    },
  ) {
    const refreshRaw = query.refresh;
    const shouldRefresh =
      refreshRaw === true || ['true', '1', 'yes'].includes(String(refreshRaw).toLowerCase());
    if (shouldRefresh) {
      await this.evaluateAlerts(query);
    }

    const daysValue = Number(query.days) || 30;
    const { startDate: resolvedStart, endDate: resolvedEnd } = this.resolveDateRange(
      daysValue,
      query.startDate,
      query.endDate,
    );
    const collectionPointIdList = this.parseCsv(query.collectionPointIds);
    const pointTypeList = this.parseCsv(query.pointTypes).filter(
      (value): value is CollectionPointType =>
        Object.values(CollectionPointType).includes(value as CollectionPointType),
    );

    const andFilters: Prisma.MarketAlertInstanceWhereInput[] = [];
    const commodityFilter = this.buildCommodityFilter(query.commodity);
    if (commodityFilter) {
      andFilters.push(
        typeof commodityFilter === 'string'
          ? { commodity: commodityFilter }
          : { commodity: commodityFilter },
      );
    }
    if (resolvedStart || resolvedEnd) {
      andFilters.push({
        triggerDate: {
          ...(resolvedStart ? { gte: resolvedStart } : {}),
          ...(resolvedEnd ? { lte: resolvedEnd } : {}),
        },
      });
    }
    if (collectionPointIdList.length > 0) andFilters.push({ pointId: { in: collectionPointIdList } });
    if (pointTypeList.length > 0) andFilters.push({ pointType: { in: pointTypeList } });
    if (query.regionCode) {
      andFilters.push({
        OR: [
          { pointId: { contains: query.regionCode } },
          { regionLabel: { contains: query.regionCode, mode: 'insensitive' } },
        ],
      });
    }

    const severity = (query.severity || '').toUpperCase();
    if (Object.values(MarketAlertSeverity).includes(severity as MarketAlertSeverity)) {
      andFilters.push({ severity: severity as MarketAlertSeverity });
    }
    const status = (query.status || '').toUpperCase();
    if (Object.values(MarketAlertStatus).includes(status as MarketAlertStatus)) {
      andFilters.push({ status: status as MarketAlertStatus });
    }

    const rows = await this.prisma.marketAlertInstance.findMany({
      where: andFilters.length > 0 ? { AND: andFilters } : {},
      include: {
        rule: { select: { id: true, name: true, type: true } },
      },
    });

    const limit = Number(query.limit) || 200;
    const sorted = rows.sort((a, b) => {
      const severityRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      const rankDiff = severityRank[b.severity] - severityRank[a.severity];
      if (rankDiff !== 0) return rankDiff;
      return b.triggerDate.getTime() - a.triggerDate.getTime();
    });

    return {
      total: rows.length,
      data: sorted.slice(0, limit).map((item) => ({
        id: item.id,
        ruleId: item.ruleId,
        ruleName: item.rule.name,
        ruleType: item.rule.type,
        severity: item.severity,
        status: item.status,
        note: item.note || undefined,
        pointId: item.pointId,
        pointName: item.pointName,
        pointType: item.pointType,
        regionLabel: item.regionLabel,
        commodity: item.commodity,
        date: item.triggerDate,
        triggerDate: item.triggerDate,
        firstTriggeredAt: item.firstTriggeredAt,
        lastTriggeredAt: item.lastTriggeredAt,
        value: Number(item.triggerValue),
        triggerValue: Number(item.triggerValue),
        threshold: Number(item.thresholdValue),
        thresholdValue: Number(item.thresholdValue),
        message: item.message,
        closedReason: item.closedReason,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    };
  }

  /**
   * 获取趋势数据 (用于 K 线图)
   */
  async getTrend(commodity: string, location: string, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const commodityFilter = this.buildCommodityFilter(commodity);

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
    const commodityFilter = this.buildCommodityFilter(commodity);

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
  async getByCollectionPoint(
    collectionPointId: string,
    commodity?: string,
    days = 30,
    startDate?: Date,
    endDate?: Date,
    subTypes?: string | string[],
  ) {
    const { startDate: resolvedStart, endDate: resolvedEnd } = this.resolveDateRange(
      days,
      startDate,
      endDate,
    );

    const where: Prisma.PriceDataWhereInput = {
      collectionPointId,
    };
    const commodityFilter = this.buildCommodityFilter(commodity);
    if (commodityFilter) where.commodity = commodityFilter;
    const subTypeList = this.parsePriceSubTypes(subTypes);
    if (subTypeList.length > 0) {
      where.subType = { in: subTypeList };
    }
    if (resolvedStart || resolvedEnd) {
      where.effectiveDate = {};
      if (resolvedStart) where.effectiveDate.gte = resolvedStart;
      if (resolvedEnd) where.effectiveDate.lte = resolvedEnd;
    }

    const data = await this.prisma.priceData.findMany({
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
    });

    // 获取采集点信息
    const collectionPoint = await this.prisma.collectionPoint.findUnique({
      where: { id: collectionPointId },
      select: { id: true, code: true, name: true, shortName: true, type: true, regionCode: true },
    });

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
  async getByRegion(
    regionCode: string,
    commodity?: string,
    days = 30,
    startDate?: Date,
    endDate?: Date,
    subTypes?: string | string[],
  ) {
    const { startDate: resolvedStart, endDate: resolvedEnd } = this.resolveDateRange(
      days,
      startDate,
      endDate,
    );

    const where: Prisma.PriceDataWhereInput = {
      regionCode,
    };
    const commodityFilter = this.buildCommodityFilter(commodity);
    if (commodityFilter) where.commodity = commodityFilter;
    const subTypeList = this.parsePriceSubTypes(subTypes);
    if (subTypeList.length > 0) {
      where.subType = { in: subTypeList };
    }
    if (resolvedStart || resolvedEnd) {
      where.effectiveDate = {};
      if (resolvedStart) where.effectiveDate.gte = resolvedStart;
      if (resolvedEnd) where.effectiveDate.lte = resolvedEnd;
    }

    const data = await this.prisma.priceData.findMany({
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
    });

    // 获取行政区划信息
    const region = await this.prisma.administrativeRegion.findUnique({
      where: { code: regionCode },
      select: { code: true, name: true, level: true, shortName: true },
    });

    // 按日期聚合计算均价
    const dailyAggregation: Record<string, { prices: number[]; count: number }> = {};
    for (const item of data) {
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

    return {
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
        totalRecords: data.length,
        uniqueLocations: [...new Set(data.map((d) => d.location))].length,
      },
    };
  }

  /**
   * 获取多采集点对比趋势
   */
  async getMultiPointTrend(
    collectionPointIds: string[],
    commodity: string,
    days = 30,
    startDate?: Date,
    endDate?: Date,
    subTypes?: string | string[],
  ) {
    const { startDate: resolvedStart, endDate: resolvedEnd } = this.resolveDateRange(
      days,
      startDate,
      endDate,
    );

    const subTypeList = this.parsePriceSubTypes(subTypes);
    const commodityFilter = this.buildCommodityFilter(commodity);

    const data = await this.prisma.priceData.findMany({
      where: {
        collectionPointId: { in: collectionPointIds },
        ...(commodityFilter ? { commodity: commodityFilter } : {}),
        ...(subTypeList.length > 0 ? { subType: { in: subTypeList } } : {}),
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

    // 按采集点分组
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

  /**
   * 获取单条价格数据
   */
  async findOne(id: string) {
    const data = await this.prisma.priceData.findUnique({ where: { id } });
    if (!data) {
      throw new NotFoundException(`价格数据 ID ${id} 不存在`);
    }
    return this.serializePriceData(data);
  }

  /**
   * 删除价格数据
   */
  async remove(id: string) {
    const existing = await this.prisma.priceData.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`价格数据 ID ${id} 不存在`);
    }
    await this.prisma.priceData.delete({ where: { id } });
    return { success: true };
  }

  /**
   * 序列化 Decimal 字段
   */
  private serializePriceData(data: PriceDataRecord) {
    return {
      ...data,
      price: Number(data.price),
      moisture: data.moisture ? Number(data.moisture) : null,
      toxin: data.toxin ? Number(data.toxin) : null,
      freight: data.freight ? Number(data.freight) : null,
      foldPrice: data.foldPrice ? Number(data.foldPrice) : null,
      dayChange: data.dayChange ? Number(data.dayChange) : null,
      yearChange: data.yearChange ? Number(data.yearChange) : null,
      qualityTag: this.inferQualityTag(data),
    };
  }
}
