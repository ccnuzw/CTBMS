import { BadRequestException } from "@nestjs/common";
import { CollectionPointType, GeoLevel, MarketAlertAction, MarketAlertRuleType, MarketAlertSeverity, MarketAlertStatus, PriceData, PriceInputMethod, PriceReviewStatus, PriceSourceType, PriceSubType, Prisma, PriceQualityTag as PrismaPriceQualityTag } from "@prisma/client";
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
export type { CollectionPointSummary };
type PricePointGroup = {
  point: CollectionPointSummary;
  data: Array<{ date: Date; price: number; change: number | null }>;
};
export type { PricePointGroup };
type PriceDataRecord = PriceData & { collectionPoint?: CollectionPointSummary };
export type { PriceDataRecord };
type PriceQualityTag = PrismaPriceQualityTag;
export type { PriceQualityTag };
type AlertRulePayload = {
  name: string;
  type: MarketAlertRuleType;
  threshold?: number;
  days?: number;
  direction?: 'UP' | 'DOWN' | 'BOTH';
  severity?: MarketAlertSeverity;
};
export type { AlertRulePayload };
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
export type { AlertRuleInput };
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
export type { AlertHit };
type RegionAnalyticsLevel = 'province' | 'city' | 'district';
export type { RegionAnalyticsLevel };
type RegionAnalyticsWindow = '7' | '30' | '90' | 'all';
export type { RegionAnalyticsWindow };
const COMMODITY_CODE_TO_LABEL: Record<string, string> = {
  CORN: '玉米',
  WHEAT: '小麦',
  SOYBEAN: '大豆',
  RICE: '稻谷',
  SORGHUM: '高粱',
  BARLEY: '大麦',
};
export { COMMODITY_CODE_TO_LABEL };
const LEGACY_PRICE_SUBTYPE_TO_CANONICAL: Record<string, PriceSubType> = {
  STATION_ORIGIN: PriceSubType.STATION,
  STATION_DEST: PriceSubType.STATION,
};
export { LEGACY_PRICE_SUBTYPE_TO_CANONICAL };
const CORRECTED_NOTE_KEYWORDS = ['修正', '更正', '校正', '修订'];
export { CORRECTED_NOTE_KEYWORDS };
const IMPUTED_NOTE_KEYWORDS = ['补录', '估算', '插值', '补齐', '回填'];
export { IMPUTED_NOTE_KEYWORDS };
const LATE_HOURS_THRESHOLD = 36;
export { LATE_HOURS_THRESHOLD };
const PRICE_QUALITY_TAGS = [
  PrismaPriceQualityTag.RAW,
  PrismaPriceQualityTag.IMPUTED,
  PrismaPriceQualityTag.CORRECTED,
  PrismaPriceQualityTag.LATE,
] as const;
export { PRICE_QUALITY_TAGS };
export function parseCsv(value?: string | string[]) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
export function normalizePriceSubType(value?: string | null) {
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
export function parsePriceSubTypes(value?: string | string[]) {
  const parsed = parseCsv(value)
    .map((item) => normalizePriceSubType(item))
    .filter((item): item is PriceSubType => Boolean(item));
  return [...new Set(parsed)];
}
export function resolveReviewStatuses(scope?: string | null) {
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
export function resolveInputMethods(scope?: string | null) {
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
export function resolveDateRange(days = 30, startDate?: Date | string, endDate?: Date | string) {
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
export function resolveCommodityCandidates(commodity?: string) {
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
export function buildCommodityFilter(commodity?: string): string | Prisma.StringFilter | undefined {
  const candidates = resolveCommodityCandidates(commodity);
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  return { in: candidates };
}
export function toDateKey(date: Date) {
  return date.toISOString().split('T')[0];
}
export function inferQualityTag(
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
export function scoreGrade(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}
export function quantile(sorted: number[], q: number) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}
export function normalizeRegionLevel(level?: string | null): RegionAnalyticsLevel {
  const value = (level || '').trim().toLowerCase();
  if (value === 'province' || value === 'district') return value;
  return 'city';
}
export function normalizeRegionWindow(window?: string | null): RegionAnalyticsWindow {
  const value = (window || '').trim().toLowerCase();
  if (value === '7' || value === '30' || value === '90' || value === 'all') {
    return value;
  }
  return '30';
}
export function getRegionNameByLevel(
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
export function parseAlertRulePayload(value: string): AlertRulePayload | null {
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
export function normalizeAlertRuleInput(input: AlertRuleInput) {
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
export function resolveAlertAction(fromStatus: MarketAlertStatus, toStatus: MarketAlertStatus) {
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
export function isValidStatusTransition(fromStatus: MarketAlertStatus, toStatus: MarketAlertStatus) {
  if (fromStatus === toStatus) return true;
  if (fromStatus === 'OPEN' && (toStatus === 'ACKNOWLEDGED' || toStatus === 'CLOSED'))
    return true;
  if (fromStatus === 'ACKNOWLEDGED' && (toStatus === 'OPEN' || toStatus === 'CLOSED'))
    return true;
  if (fromStatus === 'CLOSED' && toStatus === 'OPEN') return true;
  return false;
}
