import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { PriceDataQuery } from "@packages/types";
import { CollectionPointType, MarketAlertStatus, MarketAlertAction, MarketAlertSeverity, PriceSourceType, Prisma } from "@prisma/client";
import * as PriceDataUtils from './price-data.utils';
import type { AlertHit, AlertRuleInput } from './price-data.utils';

@Injectable()
export class PriceAlertService {
  private readonly ALERT_RULE_DOMAIN = 'PRICE_DATA';
  constructor(private prisma: PrismaService) {
  }

  private async ensureAlertRulesMigrated() {
    const currentCount = await this.prisma.marketAlertRule.count();
    if (currentCount > 0) return;
    const legacyRules = await this.prisma.businessMappingRule.findMany({
      where: { domain: this.ALERT_RULE_DOMAIN },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    if (legacyRules.length === 0) return;
    for (const legacyRule of legacyRules) {
      const payload = PriceDataUtils.parseAlertRulePayload(legacyRule.targetValue);
      if (!payload?.type) continue;

      const normalized = PriceDataUtils.normalizeAlertRuleInput({
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

  async listAlertRules() {
    return this.resolveAlertRules(false);
  }

  async createAlertRule(input: AlertRuleInput) {
    const normalized = PriceDataUtils.normalizeAlertRuleInput(input);
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
    const normalized = PriceDataUtils.normalizeAlertRuleInput(mergedInput);
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
    const { startDate: resolvedStart, endDate: resolvedEnd } = PriceDataUtils.resolveDateRange(
      daysValue,
      query.startDate,
      query.endDate,
    );
    const commodityFilter = PriceDataUtils.buildCommodityFilter(query.commodity);
    const pointTypeList = PriceDataUtils.parseCsv(query.pointTypes).filter(
      (value): value is CollectionPointType =>
        Object.values(CollectionPointType).includes(value as CollectionPointType),
    );
    const subTypeList = PriceDataUtils.parsePriceSubTypes(query.subTypes);
    const collectionPointIdList = PriceDataUtils.parseCsv(query.collectionPointIds);
    const reviewStatuses = PriceDataUtils.resolveReviewStatuses(
      (query as { reviewScope?: string }).reviewScope,
    );
    const inputMethods = PriceDataUtils.resolveInputMethods((query as { sourceScope?: string }).sourceScope);
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
    const meanLatestPrice = latestRecords.length > 0
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
          dedupeKey: `${rule.id}:${pointKey}:${PriceDataUtils.toDateKey(latest.effectiveDate)}`,
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
    const { startDate: resolvedStart, endDate: resolvedEnd } = PriceDataUtils.resolveDateRange(
      daysValue,
      query.startDate,
      query.endDate,
    );
    const collectionPointIdList = PriceDataUtils.parseCsv(query.collectionPointIds);
    const pointTypeList = PriceDataUtils.parseCsv(query.pointTypes).filter(
      (value): value is CollectionPointType =>
        Object.values(CollectionPointType).includes(value as CollectionPointType),
    );
    const staleFilters: Prisma.MarketAlertInstanceWhereInput[] = [
      { status: { in: [MarketAlertStatus.OPEN, MarketAlertStatus.ACKNOWLEDGED] } },
    ];
    const commodityFilter = PriceDataUtils.buildCommodityFilter(query.commodity);
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

  async updateAlertStatus(id: string, status: MarketAlertStatus, note?: string, reason?: string, operator = 'system-user-placeholder') {
    if (!Object.values(MarketAlertStatus).includes(status)) {
      throw new BadRequestException('状态不合法');
    }

    const alert = await this.prisma.marketAlertInstance.findUnique({ where: { id } });
    if (!alert) {
      throw new NotFoundException('预警实例不存在');
    }

    if (!PriceDataUtils.isValidStatusTransition(alert.status, status)) {
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
          action: PriceDataUtils.resolveAlertAction(alert.status, status),
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

  async getAlerts(query: Partial<PriceDataQuery> & {
    days?: number | string;
    severity?: string;
    status?: string;
    limit?: number | string;
    refresh?: string | boolean;
  }) {
    const refreshRaw = query.refresh;
    const shouldRefresh = refreshRaw === true || ['true', '1', 'yes'].includes(String(refreshRaw).toLowerCase());
    if (shouldRefresh) {
      await this.evaluateAlerts(query);
    }

    const daysValue = Number(query.days) || 30;
    const { startDate: resolvedStart, endDate: resolvedEnd } = PriceDataUtils.resolveDateRange(
      daysValue,
      query.startDate,
      query.endDate,
    );
    const collectionPointIdList = PriceDataUtils.parseCsv(query.collectionPointIds);
    const pointTypeList = PriceDataUtils.parseCsv(query.pointTypes).filter(
      (value): value is CollectionPointType =>
        Object.values(CollectionPointType).includes(value as CollectionPointType),
    );
    const andFilters: Prisma.MarketAlertInstanceWhereInput[] = [];
    const commodityFilter = PriceDataUtils.buildCommodityFilter(query.commodity);
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
}
