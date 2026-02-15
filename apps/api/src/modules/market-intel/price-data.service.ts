import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
  PriceInputMethod,
  PriceQualityTag as PrismaPriceQualityTag,
  PriceReviewStatus,
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
const PRICE_QUALITY_TAGS = [
  PrismaPriceQualityTag.RAW,
  PrismaPriceQualityTag.IMPUTED,
  PrismaPriceQualityTag.CORRECTED,
  PrismaPriceQualityTag.LATE,
] as const;
type PriceQualityTag = PrismaPriceQualityTag;
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

type RegionAnalyticsLevel = 'province' | 'city' | 'district';
type RegionAnalyticsWindow = '7' | '30' | '90' | 'all';

@Injectable()
export class PriceDataService {
  private readonly logger = new Logger(PriceDataService.name);

  constructor(private prisma: PrismaService) {}

  private logPerf(method: string, startedAt: number, metadata: Record<string, unknown>) {
    const durationMs = Date.now() - startedAt;
    if (durationMs < 400) return;
    this.logger.warn(`[perf] ${method} ${durationMs}ms ${JSON.stringify(metadata)}`);
  }

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

  private resolveReviewStatuses(scope?: string | null) {
    const approved = PriceReviewStatus.APPROVED;
    const pending = PriceReviewStatus.PENDING;
    const autoApproved =
      (PriceReviewStatus as unknown as Record<string, PriceReviewStatus>).AUTO_APPROVED ||
      ('AUTO_APPROVED' as PriceReviewStatus);
    const defaultStatuses = [approved, autoApproved, pending].filter(
      (status): status is PriceReviewStatus => Boolean(status),
    );
    const normalized = (scope || '').trim().toUpperCase();
    if (!normalized || normalized === 'APPROVED_AND_PENDING') {
      return defaultStatuses;
    }
    if (normalized === 'APPROVED_ONLY') {
      return [approved, autoApproved].filter((status): status is PriceReviewStatus =>
        Boolean(status),
      );
    }
    if (normalized === 'ALL') {
      return null;
    }
    return defaultStatuses;
  }

  private resolveInputMethods(scope?: string | null) {
    const aiExtracted = PriceInputMethod.AI_EXTRACTED;
    const manualEntry =
      (PriceInputMethod as unknown as Record<string, PriceInputMethod>).MANUAL_ENTRY ||
      ('MANUAL_ENTRY' as PriceInputMethod);
    const bulkImport =
      (PriceInputMethod as unknown as Record<string, PriceInputMethod>).BULK_IMPORT ||
      ('BULK_IMPORT' as PriceInputMethod);
    const normalized = (scope || '').trim().toUpperCase();
    if (!normalized || normalized === 'ALL') {
      return null;
    }
    if (normalized === 'AI_ONLY') {
      return [aiExtracted].filter(Boolean) as PriceInputMethod[];
    }
    if (normalized === 'MANUAL_ONLY') {
      return [manualEntry, bulkImport].filter((method): method is PriceInputMethod =>
        Boolean(method),
      );
    }
    return null;
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

  private quantile(sorted: number[], q: number) {
    if (sorted.length === 0) return 0;
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    return sorted[base];
  }

  private normalizeRegionLevel(level?: string | null): RegionAnalyticsLevel {
    const value = (level || '').trim().toLowerCase();
    if (value === 'province' || value === 'district') return value;
    return 'city';
  }

  private normalizeRegionWindow(window?: string | null): RegionAnalyticsWindow {
    const value = (window || '').trim().toLowerCase();
    if (value === '7' || value === '30' || value === '90' || value === 'all') {
      return value;
    }
    return '30';
  }

  private getRegionNameByLevel(
    row: Pick<PriceData, 'province' | 'city' | 'district' | 'region' | 'location'>,
    level: RegionAnalyticsLevel,
  ) {
    if (level === 'province') {
      return row.province || row.region?.[0] || row.location || '其他';
    }
    if (level === 'district') {
      return row.district || row.region?.[2] || row.region?.[1] || row.location || '其他';
    }
    return row.city || row.region?.[1] || row.region?.[0] || row.location || '其他';
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
    const createdAt = new Date();
    const qualityTag = this.inferQualityTag({
      note: dto.note || null,
      effectiveDate: dto.effectiveDate,
      createdAt,
    });

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
        qualityTag,
      },
    });
  }

  /**
   * 查询价格数据 (分页)
   * 增强版：支持按采集点和行政区划过滤
   */
  async findAll(query: PriceDataQuery) {
    const startedAt = Date.now();
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
      reviewScope,
      sourceScope,
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
    const reviewStatuses = this.resolveReviewStatuses(reviewScope);
    if (reviewStatuses && reviewStatuses.length > 0) {
      andFilters.push({ reviewStatus: { in: reviewStatuses } });
    }
    const inputMethods = this.resolveInputMethods(sourceScope);
    if (inputMethods && inputMethods.length > 0) {
      andFilters.push({ inputMethod: { in: inputMethods } });
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

    const qualityTagList = this.parseCsv(qualityTags).filter((value): value is PriceQualityTag =>
      PRICE_QUALITY_TAGS.includes(value as PriceQualityTag),
    );
    if (qualityTagList.length > 0) {
      andFilters.push({ qualityTag: { in: qualityTagList } });
    }
    const where = andFilters.length > 0 ? { AND: andFilters } : {};

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

    const result = {
      data: data.map((item) => this.serializePriceData(item)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
    this.logPerf('findAll', startedAt, {
      page,
      pageSize,
      hasKeyword: Boolean(keyword),
      hasQualityTags: qualityTagList.length > 0,
      resultSize: result.data.length,
      total,
    });
    return result;
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
    const reviewStatuses = this.resolveReviewStatuses(reviewScope);
    if (reviewStatuses && reviewStatuses.length > 0) {
      andFilters.push({ reviewStatus: { in: reviewStatuses } });
    }
    const inputMethods = this.resolveInputMethods(sourceScope);
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
      threshold:
        input.threshold ?? (existing.threshold === null ? undefined : Number(existing.threshold)),
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
    const reviewStatuses = this.resolveReviewStatuses(
      (query as { reviewScope?: string }).reviewScope,
    );
    const inputMethods = this.resolveInputMethods((query as { sourceScope?: string }).sourceScope);

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
    if (reviewStatuses && reviewStatuses.length > 0) {
      andFilters.push({ reviewStatus: { in: reviewStatuses } });
    }
    if (inputMethods && inputMethods.length > 0) {
      andFilters.push({ inputMethod: { in: inputMethods } });
    }
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

  async evaluateAlerts(
    query: Partial<PriceDataQuery> & { days?: number | string; limit?: number | string },
  ) {
    const hits = await this.buildAlertHits(query);
    let created = 0;
    let updated = 0;
    let closed = 0;
    const activeDedupeKeys = new Set(hits.map((hit) => hit.dedupeKey));

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

    const staleFilters: Prisma.MarketAlertInstanceWhereInput[] = [
      { status: { in: [MarketAlertStatus.OPEN, MarketAlertStatus.ACKNOWLEDGED] } },
    ];
    const commodityFilter = this.buildCommodityFilter(query.commodity);
    if (commodityFilter) {
      staleFilters.push(
        typeof commodityFilter === 'string'
          ? { commodity: commodityFilter }
          : { commodity: commodityFilter },
      );
    }
    if (resolvedStart || resolvedEnd) {
      staleFilters.push({
        triggerDate: {
          ...(resolvedStart ? { gte: resolvedStart } : {}),
          ...(resolvedEnd ? { lte: resolvedEnd } : {}),
        },
      });
    }
    if (collectionPointIdList.length > 0) {
      staleFilters.push({ pointId: { in: collectionPointIdList } });
    }
    if (pointTypeList.length > 0) {
      staleFilters.push({ pointType: { in: pointTypeList } });
    }
    if (query.regionCode) {
      staleFilters.push({
        OR: [
          { pointId: { contains: query.regionCode } },
          { regionLabel: { contains: query.regionCode, mode: 'insensitive' } },
        ],
      });
    }
    if (activeDedupeKeys.size > 0) {
      staleFilters.push({ dedupeKey: { notIn: Array.from(activeDedupeKeys) } });
    }

    const staleAlerts = await this.prisma.marketAlertInstance.findMany({
      where: { AND: staleFilters },
      select: { id: true, status: true, dedupeKey: true },
    });
    if (staleAlerts.length > 0) {
      const autoCloseReason = '命中条件已解除，系统自动关闭';
      await this.prisma.$transaction(async (tx) => {
        for (const staleAlert of staleAlerts) {
          await tx.marketAlertInstance.update({
            where: { id: staleAlert.id },
            data: {
              status: MarketAlertStatus.CLOSED,
              closedReason: autoCloseReason,
            },
          });
          await tx.marketAlertStatusLog.create({
            data: {
              instanceId: staleAlert.id,
              action: MarketAlertAction.AUTO_CLOSE,
              fromStatus: staleAlert.status,
              toStatus: MarketAlertStatus.CLOSED,
              operator: 'system-auto-evaluator',
              reason: autoCloseReason,
              meta: { dedupeKey: staleAlert.dedupeKey },
            },
          });
        }
      });
      closed = staleAlerts.length;
    }

    return {
      evaluatedAt: new Date(),
      total: hits.length,
      created,
      updated,
      closed,
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
    if (collectionPointIdList.length > 0)
      andFilters.push({ pointId: { in: collectionPointIdList } });
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
    reviewScope?: string,
    sourceScope?: string,
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
    const reviewStatuses = this.resolveReviewStatuses(reviewScope);
    if (reviewStatuses && reviewStatuses.length > 0) {
      where.reviewStatus = { in: reviewStatuses };
    }
    const inputMethods = this.resolveInputMethods(sourceScope);
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
  async getByRegion(
    regionCode: string,
    commodity?: string,
    days = 30,
    startDate?: Date,
    endDate?: Date,
    subTypes?: string | string[],
    reviewScope?: string,
    sourceScope?: string,
    includeData = false,
  ) {
    const startedAt = Date.now();
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
    const reviewStatuses = this.resolveReviewStatuses(reviewScope);
    if (reviewStatuses && reviewStatuses.length > 0) {
      where.reviewStatus = { in: reviewStatuses };
    }
    const inputMethods = this.resolveInputMethods(sourceScope);
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

    // 获取行政区划信息
    const region = await this.prisma.administrativeRegion.findUnique({
      where: { code: regionCode },
      select: { code: true, name: true, level: true, shortName: true },
    });

    // 按日期聚合计算均价
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
  async getMultiPointTrend(
    collectionPointIds: string[],
    commodity: string,
    days = 30,
    startDate?: Date,
    endDate?: Date,
    subTypes?: string | string[],
    reviewScope?: string,
    sourceScope?: string,
  ) {
    const { startDate: resolvedStart, endDate: resolvedEnd } = this.resolveDateRange(
      days,
      startDate,
      endDate,
    );

    const subTypeList = this.parsePriceSubTypes(subTypes);
    const commodityFilter = this.buildCommodityFilter(commodity);
    const reviewStatuses = this.resolveReviewStatuses(reviewScope);
    const inputMethods = this.resolveInputMethods(sourceScope);

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
    const { startDate: resolvedStart, endDate: resolvedEnd } = this.resolveDateRange(
      days,
      startDate,
      endDate,
    );
    const commodityFilter = this.buildCommodityFilter(commodity);
    const subTypeList = this.parsePriceSubTypes(subTypes);
    const reviewStatuses = this.resolveReviewStatuses(reviewScope);
    const inputMethods = this.resolveInputMethods(sourceScope);
    const normalizedRegionLevel = this.normalizeRegionLevel(regionLevel);
    const normalizedRegionWindow = this.normalizeRegionWindow(regionWindow);
    const regionalSourceType =
      (PriceSourceType as unknown as Record<string, PriceSourceType>).REGIONAL ||
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

    // 1) 采集点对比（排行/分布）
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
    const meanLatestPrice =
      latestRecords.length > 0
        ? latestRecords.reduce((sum, row) => sum + Number(row.price), 0) / latestRecords.length
        : null;
    const compareExpectedDays =
      startDate && endDate ? calcExpectedDays(resolvedStart, resolvedEnd) : null;

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
          q1: this.quantile(sorted, 0.25),
          median: this.quantile(sorted, 0.5),
          q3: this.quantile(sorted, 0.75),
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

    // 2) 区域统计与质量概览（不依赖 selectedPointIds）
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

    const pointTypeList = this.parseCsv(pointTypes).filter((value): value is CollectionPointType =>
      Object.values(CollectionPointType).includes(value as CollectionPointType),
    );

    const regionExpression =
      normalizedRegionLevel === 'province'
        ? "COALESCE(NULLIF(p.\"province\", ''), NULLIF((p.\"region\")[1], ''), NULLIF(p.\"location\", ''), '其他')"
        : normalizedRegionLevel === 'district'
          ? "COALESCE(NULLIF(p.\"district\", ''), NULLIF((p.\"region\")[3], ''), NULLIF((p.\"region\")[2], ''), NULLIF(p.\"location\", ''), '其他')"
          : "COALESCE(NULLIF(p.\"city\", ''), NULLIF((p.\"region\")[2], ''), NULLIF((p.\"region\")[1], ''), NULLIF(p.\"location\", ''), '其他')";

    const commodityCandidates = this.resolveCommodityCandidates(commodity);
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

    const qualityExpectedDays =
      startDate && endDate ? calcExpectedDays(resolvedStart, resolvedEnd) : null;
    const qualityMissingDays =
      qualityExpectedDays !== null ? Math.max(0, qualityExpectedDays - activeRegionDays) : null;

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

    const windowEnd =
      endDate && !Number.isNaN(endDate.getTime())
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
    const prevWindowStart =
      windowDays && prevWindowEnd
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

    const prevRegionRows =
      windowDays && prevWindowStart && prevWindowEnd
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

    const overallAvg =
      regionList.length > 0
        ? regionList.reduce((sum, item) => sum + item.avgPrice, 0) / regionList.length
        : null;
    const minAvg = regionList.length > 0 ? Math.min(...regionList.map((item) => item.avgPrice)) : 0;
    const maxAvg = regionList.length > 0 ? Math.max(...regionList.map((item) => item.avgPrice)) : 0;
    const rangeMin =
      regionList.length > 0 ? Math.min(...regionList.map((item) => item.minPrice)) : 0;
    const rangeMax =
      regionList.length > 0 ? Math.max(...regionList.map((item) => item.maxPrice)) : 0;

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
      qualityTag: data.qualityTag || this.inferQualityTag(data),
    };
  }
}
