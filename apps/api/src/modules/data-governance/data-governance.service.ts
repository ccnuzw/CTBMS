import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, DataFreshnessStatus, DataSourceType, MetricStatus, EvidenceConflictResolution, QualityIssueSeverity } from '@prisma/client';
import {
  CreateWeatherObservationDto,
  UpdateWeatherObservationDto,
  WeatherObservationQueryDto,
  CreateLogisticsRouteSnapshotDto,
  UpdateLogisticsRouteSnapshotDto,
  LogisticsRouteSnapshotQueryDto,
  CreateMetricCatalogDto,
  UpdateMetricCatalogDto,
  MetricCatalogQueryDto,
  CreateMetricValueSnapshotDto,
  UpdateMetricValueSnapshotDto,
  MetricValueSnapshotQueryDto,
  CreateEvidenceBundleDto,
  UpdateEvidenceBundleDto,
  EvidenceBundleQueryDto,
  EvidenceClaimQueryDto,
  EvidenceConflictQueryDto,
  CreateDataQualityIssueDto,
  UpdateDataQualityIssueDto,
  DataQualityIssueQueryDto,
  CreateDataSourceHealthSnapshotDto,
  UpdateDataSourceHealthSnapshotDto,
  DataSourceHealthSnapshotQueryDto,
  CreateStandardizationMappingRuleDto,
  UpdateStandardizationMappingRuleDto,
  StandardizationMappingRuleQueryDto,
} from '@packages/types';
import { PrismaService } from '../../prisma';

@Injectable()
export class DataGovernanceService {
  constructor(private readonly prisma: PrismaService) {}

  async createWeatherObservation(dto: CreateWeatherObservationDto) {
    return this.prisma.weatherObservation.create({
      data: {
        connectorId: dto.connectorId ?? null,
        regionCode: dto.regionCode,
        stationCode: dto.stationCode ?? null,
        dataTime: new Date(dto.dataTime),
        tempC: dto.tempC ?? null,
        rainfallMm: dto.rainfallMm ?? null,
        windSpeed: dto.windSpeed ?? null,
        anomalyScore: dto.anomalyScore ?? null,
        eventLevel: dto.eventLevel ?? null,
        freshnessStatus: dto.freshnessStatus as DataFreshnessStatus,
        qualityScore: new Prisma.Decimal(dto.qualityScore),
        sourceType: dto.sourceType as DataSourceType,
        sourceRecordId: dto.sourceRecordId ?? null,
        collectedAt: dto.collectedAt ? new Date(dto.collectedAt) : undefined,
      },
    });
  }

  async listWeatherObservations(query: WeatherObservationQueryDto) {
    const { page, pageSize, regionCode, connectorId, sourceType, from, to } = query;
    const where: Prisma.WeatherObservationWhereInput = {
      regionCode: regionCode ?? undefined,
      connectorId: connectorId ?? undefined,
      sourceType: sourceType ? (sourceType as DataSourceType) : undefined,
    };
    if (from || to) {
      where.dataTime = {
        gte: from ? new Date(from) : undefined,
        lte: to ? new Date(to) : undefined,
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.weatherObservation.findMany({
        where,
        orderBy: { dataTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.weatherObservation.count({ where }),
    ]);

    return this.wrapPage(data, total, page, pageSize);
  }

  async getWeatherObservation(id: string) {
    const record = await this.prisma.weatherObservation.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`WeatherObservation not found: ${id}`);
    return record;
  }

  async updateWeatherObservation(id: string, dto: UpdateWeatherObservationDto) {
    await this.getWeatherObservation(id);
    return this.prisma.weatherObservation.update({
      where: { id },
      data: {
        connectorId: dto.connectorId ?? undefined,
        regionCode: dto.regionCode ?? undefined,
        stationCode: dto.stationCode ?? undefined,
        dataTime: dto.dataTime ? new Date(dto.dataTime) : undefined,
        tempC: dto.tempC ?? undefined,
        rainfallMm: dto.rainfallMm ?? undefined,
        windSpeed: dto.windSpeed ?? undefined,
        anomalyScore: dto.anomalyScore ?? undefined,
        eventLevel: dto.eventLevel ?? undefined,
        freshnessStatus: dto.freshnessStatus
          ? (dto.freshnessStatus as DataFreshnessStatus)
          : undefined,
        qualityScore: dto.qualityScore !== undefined
          ? new Prisma.Decimal(dto.qualityScore)
          : undefined,
        sourceType: dto.sourceType ? (dto.sourceType as DataSourceType) : undefined,
        sourceRecordId: dto.sourceRecordId ?? undefined,
        collectedAt: dto.collectedAt ? new Date(dto.collectedAt) : undefined,
      },
    });
  }

  async deleteWeatherObservation(id: string) {
    await this.getWeatherObservation(id);
    return this.prisma.weatherObservation.delete({ where: { id } });
  }

  async createLogisticsRouteSnapshot(dto: CreateLogisticsRouteSnapshotDto) {
    return this.prisma.logisticsRouteSnapshot.create({
      data: {
        connectorId: dto.connectorId ?? null,
        routeCode: dto.routeCode,
        originRegionCode: dto.originRegionCode,
        destinationRegionCode: dto.destinationRegionCode,
        transportMode: dto.transportMode,
        dataTime: new Date(dto.dataTime),
        freightCost: new Prisma.Decimal(dto.freightCost),
        transitHours: dto.transitHours ?? null,
        delayIndex: dto.delayIndex ?? null,
        capacityUtilization: dto.capacityUtilization ?? null,
        eventFlag: dto.eventFlag ?? null,
        freshnessStatus: dto.freshnessStatus as DataFreshnessStatus,
        qualityScore: new Prisma.Decimal(dto.qualityScore),
        sourceType: dto.sourceType as DataSourceType,
        sourceRecordId: dto.sourceRecordId ?? null,
        collectedAt: dto.collectedAt ? new Date(dto.collectedAt) : undefined,
      },
    });
  }

  async listLogisticsRouteSnapshots(query: LogisticsRouteSnapshotQueryDto) {
    const { page, pageSize, routeCode, originRegionCode, destinationRegionCode, connectorId, from, to } = query;
    const where: Prisma.LogisticsRouteSnapshotWhereInput = {
      routeCode: routeCode ?? undefined,
      originRegionCode: originRegionCode ?? undefined,
      destinationRegionCode: destinationRegionCode ?? undefined,
      connectorId: connectorId ?? undefined,
    };
    if (from || to) {
      where.dataTime = {
        gte: from ? new Date(from) : undefined,
        lte: to ? new Date(to) : undefined,
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.logisticsRouteSnapshot.findMany({
        where,
        orderBy: { dataTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.logisticsRouteSnapshot.count({ where }),
    ]);

    return this.wrapPage(data, total, page, pageSize);
  }

  async getLogisticsRouteSnapshot(id: string) {
    const record = await this.prisma.logisticsRouteSnapshot.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`LogisticsRouteSnapshot not found: ${id}`);
    return record;
  }

  async updateLogisticsRouteSnapshot(id: string, dto: UpdateLogisticsRouteSnapshotDto) {
    await this.getLogisticsRouteSnapshot(id);
    return this.prisma.logisticsRouteSnapshot.update({
      where: { id },
      data: {
        connectorId: dto.connectorId ?? undefined,
        routeCode: dto.routeCode ?? undefined,
        originRegionCode: dto.originRegionCode ?? undefined,
        destinationRegionCode: dto.destinationRegionCode ?? undefined,
        transportMode: dto.transportMode ?? undefined,
        dataTime: dto.dataTime ? new Date(dto.dataTime) : undefined,
        freightCost: dto.freightCost !== undefined
          ? new Prisma.Decimal(dto.freightCost)
          : undefined,
        transitHours: dto.transitHours ?? undefined,
        delayIndex: dto.delayIndex ?? undefined,
        capacityUtilization: dto.capacityUtilization ?? undefined,
        eventFlag: dto.eventFlag ?? undefined,
        freshnessStatus: dto.freshnessStatus
          ? (dto.freshnessStatus as DataFreshnessStatus)
          : undefined,
        qualityScore: dto.qualityScore !== undefined
          ? new Prisma.Decimal(dto.qualityScore)
          : undefined,
        sourceType: dto.sourceType ? (dto.sourceType as DataSourceType) : undefined,
        sourceRecordId: dto.sourceRecordId ?? undefined,
        collectedAt: dto.collectedAt ? new Date(dto.collectedAt) : undefined,
      },
    });
  }

  async deleteLogisticsRouteSnapshot(id: string) {
    await this.getLogisticsRouteSnapshot(id);
    return this.prisma.logisticsRouteSnapshot.delete({ where: { id } });
  }

  async createMetricCatalog(dto: CreateMetricCatalogDto, ownerUserId?: string) {
    return this.prisma.metricCatalog.create({
      data: {
        metricCode: dto.metricCode,
        metricName: dto.metricName,
        description: dto.description ?? null,
        version: dto.version,
        expression: dto.expression,
        unit: dto.unit ?? null,
        granularity: dto.granularity ?? null,
        dimensions: dto.dimensions ? (dto.dimensions as Prisma.InputJsonValue) : undefined,
        status: dto.status as MetricStatus,
        ownerUserId: ownerUserId ?? null,
      },
    });
  }

  async listMetricCatalogs(query: MetricCatalogQueryDto) {
    const { page, pageSize, metricCode, status } = query;
    const where: Prisma.MetricCatalogWhereInput = {
      metricCode: metricCode ?? undefined,
      status: status ? (status as MetricStatus) : undefined,
    };
    const [data, total] = await Promise.all([
      this.prisma.metricCatalog.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.metricCatalog.count({ where }),
    ]);

    return this.wrapPage(data, total, page, pageSize);
  }

  async getMetricCatalog(id: string) {
    const record = await this.prisma.metricCatalog.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`MetricCatalog not found: ${id}`);
    return record;
  }

  async updateMetricCatalog(id: string, dto: UpdateMetricCatalogDto, ownerUserId?: string) {
    await this.getMetricCatalog(id);
    return this.prisma.metricCatalog.update({
      where: { id },
      data: {
        metricCode: dto.metricCode ?? undefined,
        metricName: dto.metricName ?? undefined,
        description: dto.description ?? undefined,
        version: dto.version ?? undefined,
        expression: dto.expression ?? undefined,
        unit: dto.unit ?? undefined,
        granularity: dto.granularity ?? undefined,
        dimensions: dto.dimensions ? (dto.dimensions as Prisma.InputJsonValue) : undefined,
        status: dto.status ? (dto.status as MetricStatus) : undefined,
        ownerUserId: ownerUserId ?? undefined,
      },
    });
  }

  async deleteMetricCatalog(id: string) {
    await this.getMetricCatalog(id);
    return this.prisma.metricCatalog.delete({ where: { id } });
  }

  async createMetricValueSnapshot(dto: CreateMetricValueSnapshotDto) {
    return this.prisma.metricValueSnapshot.create({
      data: {
        metricCatalogId: dto.metricCatalogId,
        metricCode: dto.metricCode,
        metricVersion: dto.metricVersion,
        value: new Prisma.Decimal(dto.value),
        valueText: dto.valueText ?? null,
        dimensions: dto.dimensions ? (dto.dimensions as Prisma.InputJsonValue) : undefined,
        dataTime: new Date(dto.dataTime),
        freshnessStatus: dto.freshnessStatus as DataFreshnessStatus,
        qualityScore: new Prisma.Decimal(dto.qualityScore),
        confidenceScore: dto.confidenceScore ? new Prisma.Decimal(dto.confidenceScore) : null,
        sourceSummary: dto.sourceSummary ? (dto.sourceSummary as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async listMetricValueSnapshots(query: MetricValueSnapshotQueryDto) {
    const { page, pageSize, metricCatalogId, metricCode, from, to } = query;
    const where: Prisma.MetricValueSnapshotWhereInput = {
      metricCatalogId: metricCatalogId ?? undefined,
      metricCode: metricCode ?? undefined,
    };
    if (from || to) {
      where.dataTime = {
        gte: from ? new Date(from) : undefined,
        lte: to ? new Date(to) : undefined,
      };
    }
    const [data, total] = await Promise.all([
      this.prisma.metricValueSnapshot.findMany({
        where,
        orderBy: { dataTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.metricValueSnapshot.count({ where }),
    ]);

    return this.wrapPage(data, total, page, pageSize);
  }

  async getMetricValueSnapshot(id: string) {
    const record = await this.prisma.metricValueSnapshot.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`MetricValueSnapshot not found: ${id}`);
    return record;
  }

  async updateMetricValueSnapshot(id: string, dto: UpdateMetricValueSnapshotDto) {
    await this.getMetricValueSnapshot(id);
    return this.prisma.metricValueSnapshot.update({
      where: { id },
      data: {
        metricCatalogId: dto.metricCatalogId ?? undefined,
        metricCode: dto.metricCode ?? undefined,
        metricVersion: dto.metricVersion ?? undefined,
        value: dto.value !== undefined ? new Prisma.Decimal(dto.value) : undefined,
        valueText: dto.valueText ?? undefined,
        dimensions: dto.dimensions ? (dto.dimensions as Prisma.InputJsonValue) : undefined,
        dataTime: dto.dataTime ? new Date(dto.dataTime) : undefined,
        freshnessStatus: dto.freshnessStatus
          ? (dto.freshnessStatus as DataFreshnessStatus)
          : undefined,
        qualityScore: dto.qualityScore !== undefined
          ? new Prisma.Decimal(dto.qualityScore)
          : undefined,
        confidenceScore: dto.confidenceScore !== undefined
          ? new Prisma.Decimal(dto.confidenceScore)
          : undefined,
        sourceSummary: dto.sourceSummary ? (dto.sourceSummary as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async deleteMetricValueSnapshot(id: string) {
    await this.getMetricValueSnapshot(id);
    return this.prisma.metricValueSnapshot.delete({ where: { id } });
  }

  async createEvidenceBundle(dto: CreateEvidenceBundleDto, userId?: string) {
    const { claims, conflicts, ...bundle } = dto;
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.evidenceBundle.create({
        data: {
          conversationSessionId: bundle.conversationSessionId ?? null,
          workflowExecutionId: bundle.workflowExecutionId ?? null,
          title: bundle.title ?? null,
          confidenceScore: bundle.confidenceScore ? new Prisma.Decimal(bundle.confidenceScore) : null,
          consistencyScore: bundle.consistencyScore ? new Prisma.Decimal(bundle.consistencyScore) : null,
          summary: bundle.summary ? (bundle.summary as Prisma.InputJsonValue) : undefined,
          createdByUserId: userId ?? null,
        },
      });

      if (claims && claims.length > 0) {
        await tx.evidenceClaim.createMany({
          data: claims.map((claim) => ({
            bundleId: created.id,
            claimText: claim.claimText,
            claimType: claim.claimType ?? null,
            confidenceScore: claim.confidenceScore ? new Prisma.Decimal(claim.confidenceScore) : null,
            evidenceItems: claim.evidenceItems as Prisma.InputJsonValue,
            sourceCount: claim.sourceCount ?? 0,
            dataTimestamp: claim.dataTimestamp ? new Date(claim.dataTimestamp) : null,
          })),
        });
      }

      if (conflicts && conflicts.length > 0) {
        await tx.evidenceConflict.createMany({
          data: conflicts.map((conflict) => ({
            bundleId: created.id,
            topic: conflict.topic,
            sourceA: conflict.sourceA,
            sourceB: conflict.sourceB,
            valueA: conflict.valueA ? (conflict.valueA as Prisma.InputJsonValue) : undefined,
            valueB: conflict.valueB ? (conflict.valueB as Prisma.InputJsonValue) : undefined,
            resolution: conflict.resolution as EvidenceConflictResolution,
            reason: conflict.reason ?? null,
            impactLevel: conflict.impactLevel ?? null,
          })),
        });
      }

      return created;
    });
  }

  async listEvidenceBundles(query: EvidenceBundleQueryDto) {
    const { page, pageSize, conversationSessionId, workflowExecutionId } = query;
    const where: Prisma.EvidenceBundleWhereInput = {
      conversationSessionId: conversationSessionId ?? undefined,
      workflowExecutionId: workflowExecutionId ?? undefined,
    };
    const [data, total] = await Promise.all([
      this.prisma.evidenceBundle.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          claims: true,
          conflicts: true,
        },
      }),
      this.prisma.evidenceBundle.count({ where }),
    ]);

    return this.wrapPage(data, total, page, pageSize);
  }

  async getEvidenceBundle(id: string) {
    const record = await this.prisma.evidenceBundle.findUnique({
      where: { id },
      include: { claims: true, conflicts: true },
    });
    if (!record) throw new NotFoundException(`EvidenceBundle not found: ${id}`);
    return record;
  }

  async updateEvidenceBundle(id: string, dto: UpdateEvidenceBundleDto, userId?: string) {
    await this.getEvidenceBundle(id);
    return this.prisma.evidenceBundle.update({
      where: { id },
      data: {
        conversationSessionId: dto.conversationSessionId ?? undefined,
        workflowExecutionId: dto.workflowExecutionId ?? undefined,
        title: dto.title ?? undefined,
        confidenceScore: dto.confidenceScore !== undefined
          ? new Prisma.Decimal(dto.confidenceScore)
          : undefined,
        consistencyScore: dto.consistencyScore !== undefined
          ? new Prisma.Decimal(dto.consistencyScore)
          : undefined,
        summary: dto.summary ? (dto.summary as Prisma.InputJsonValue) : undefined,
        createdByUserId: userId ?? undefined,
      },
    });
  }

  async deleteEvidenceBundle(id: string) {
    await this.getEvidenceBundle(id);
    return this.prisma.evidenceBundle.delete({ where: { id } });
  }

  async listEvidenceClaims(query: EvidenceClaimQueryDto) {
    const { page, pageSize, bundleId } = query;
    const where: Prisma.EvidenceClaimWhereInput = { bundleId };
    const [data, total] = await Promise.all([
      this.prisma.evidenceClaim.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.evidenceClaim.count({ where }),
    ]);
    return this.wrapPage(data, total, page, pageSize);
  }

  async listEvidenceConflicts(query: EvidenceConflictQueryDto) {
    const { page, pageSize, bundleId } = query;
    const where: Prisma.EvidenceConflictWhereInput = { bundleId };
    const [data, total] = await Promise.all([
      this.prisma.evidenceConflict.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.evidenceConflict.count({ where }),
    ]);
    return this.wrapPage(data, total, page, pageSize);
  }

  async createDataQualityIssue(dto: CreateDataQualityIssueDto) {
    return this.prisma.dataQualityIssue.create({
      data: {
        datasetName: dto.datasetName,
        sourceType: dto.sourceType as DataSourceType,
        connectorId: dto.connectorId ?? null,
        issueType: dto.issueType,
        severity: dto.severity as QualityIssueSeverity,
        message: dto.message,
        payload: dto.payload ? (dto.payload as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async listDataQualityIssues(query: DataQualityIssueQueryDto) {
    const { page, pageSize, datasetName, severity, connectorId } = query;
    const where: Prisma.DataQualityIssueWhereInput = {
      datasetName: datasetName ?? undefined,
      severity: severity ? (severity as QualityIssueSeverity) : undefined,
      connectorId: connectorId ?? undefined,
    };
    const [data, total] = await Promise.all([
      this.prisma.dataQualityIssue.findMany({
        where,
        orderBy: { detectedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.dataQualityIssue.count({ where }),
    ]);
    return this.wrapPage(data, total, page, pageSize);
  }

  async getDataQualityIssue(id: string) {
    const record = await this.prisma.dataQualityIssue.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`DataQualityIssue not found: ${id}`);
    return record;
  }

  async updateDataQualityIssue(id: string, dto: UpdateDataQualityIssueDto) {
    await this.getDataQualityIssue(id);
    return this.prisma.dataQualityIssue.update({
      where: { id },
      data: {
        datasetName: dto.datasetName ?? undefined,
        sourceType: dto.sourceType ? (dto.sourceType as DataSourceType) : undefined,
        connectorId: dto.connectorId ?? undefined,
        issueType: dto.issueType ?? undefined,
        severity: dto.severity ? (dto.severity as QualityIssueSeverity) : undefined,
        message: dto.message ?? undefined,
        payload: dto.payload ? (dto.payload as Prisma.InputJsonValue) : undefined,
        resolvedAt: dto.resolvedAt ? new Date(dto.resolvedAt) : undefined,
        resolverUserId: dto.resolverUserId ?? undefined,
        resolutionNote: dto.resolutionNote ?? undefined,
      },
    });
  }

  async deleteDataQualityIssue(id: string) {
    await this.getDataQualityIssue(id);
    return this.prisma.dataQualityIssue.delete({ where: { id } });
  }

  async createDataSourceHealthSnapshot(dto: CreateDataSourceHealthSnapshotDto) {
    return this.prisma.dataSourceHealthSnapshot.create({
      data: {
        connectorId: dto.connectorId,
        sourceType: dto.sourceType as DataSourceType,
        windowStartAt: new Date(dto.windowStartAt),
        windowEndAt: new Date(dto.windowEndAt),
        requestCount: dto.requestCount ?? 0,
        successCount: dto.successCount ?? 0,
        errorCount: dto.errorCount ?? 0,
        p95LatencyMs: dto.p95LatencyMs ?? null,
        avgLatencyMs: dto.avgLatencyMs ?? null,
        availabilityRatio: dto.availabilityRatio
          ? new Prisma.Decimal(dto.availabilityRatio)
          : null,
      },
    });
  }

  async listDataSourceHealthSnapshots(query: DataSourceHealthSnapshotQueryDto) {
    const { page, pageSize, connectorId, sourceType, from, to } = query;
    const where: Prisma.DataSourceHealthSnapshotWhereInput = {
      connectorId: connectorId ?? undefined,
      sourceType: sourceType ? (sourceType as DataSourceType) : undefined,
    };
    if (from || to) {
      where.windowEndAt = {
        gte: from ? new Date(from) : undefined,
        lte: to ? new Date(to) : undefined,
      };
    }
    const [data, total] = await Promise.all([
      this.prisma.dataSourceHealthSnapshot.findMany({
        where,
        orderBy: { windowEndAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.dataSourceHealthSnapshot.count({ where }),
    ]);
    return this.wrapPage(data, total, page, pageSize);
  }

  async getDataSourceHealthSnapshot(id: string) {
    const record = await this.prisma.dataSourceHealthSnapshot.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`DataSourceHealthSnapshot not found: ${id}`);
    return record;
  }

  async updateDataSourceHealthSnapshot(id: string, dto: UpdateDataSourceHealthSnapshotDto) {
    await this.getDataSourceHealthSnapshot(id);
    return this.prisma.dataSourceHealthSnapshot.update({
      where: { id },
      data: {
        connectorId: dto.connectorId ?? undefined,
        sourceType: dto.sourceType ? (dto.sourceType as DataSourceType) : undefined,
        windowStartAt: dto.windowStartAt ? new Date(dto.windowStartAt) : undefined,
        windowEndAt: dto.windowEndAt ? new Date(dto.windowEndAt) : undefined,
        requestCount: dto.requestCount ?? undefined,
        successCount: dto.successCount ?? undefined,
        errorCount: dto.errorCount ?? undefined,
        p95LatencyMs: dto.p95LatencyMs ?? undefined,
        avgLatencyMs: dto.avgLatencyMs ?? undefined,
        availabilityRatio: dto.availabilityRatio !== undefined
          ? new Prisma.Decimal(dto.availabilityRatio)
          : undefined,
      },
    });
  }

  async deleteDataSourceHealthSnapshot(id: string) {
    await this.getDataSourceHealthSnapshot(id);
    return this.prisma.dataSourceHealthSnapshot.delete({ where: { id } });
  }

  async createStandardizationMappingRule(dto: CreateStandardizationMappingRuleDto, userId?: string) {
    return this.prisma.standardizationMappingRule.create({
      data: {
        datasetName: dto.datasetName,
        mappingVersion: dto.mappingVersion,
        sourceField: dto.sourceField,
        targetField: dto.targetField,
        transformExpr: dto.transformExpr ?? null,
        isRequired: dto.isRequired ?? false,
        nullPolicy: dto.nullPolicy ?? 'FAIL',
        defaultValue: dto.defaultValue ? (dto.defaultValue as Prisma.InputJsonValue) : undefined,
        rulePriority: dto.rulePriority ?? 0,
        isActive: dto.isActive ?? true,
        createdByUserId: userId ?? null,
      },
    });
  }

  async listStandardizationMappingRules(query: StandardizationMappingRuleQueryDto) {
    const { page, pageSize, datasetName, mappingVersion, isActive } = query;
    const where: Prisma.StandardizationMappingRuleWhereInput = {
      datasetName: datasetName ?? undefined,
      mappingVersion: mappingVersion ?? undefined,
      isActive: isActive ?? undefined,
    };
    const [data, total] = await Promise.all([
      this.prisma.standardizationMappingRule.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.standardizationMappingRule.count({ where }),
    ]);
    return this.wrapPage(data, total, page, pageSize);
  }

  async getStandardizationMappingRule(id: string) {
    const record = await this.prisma.standardizationMappingRule.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`StandardizationMappingRule not found: ${id}`);
    return record;
  }

  async updateStandardizationMappingRule(
    id: string,
    dto: UpdateStandardizationMappingRuleDto,
    userId?: string,
  ) {
    await this.getStandardizationMappingRule(id);
    return this.prisma.standardizationMappingRule.update({
      where: { id },
      data: {
        datasetName: dto.datasetName ?? undefined,
        mappingVersion: dto.mappingVersion ?? undefined,
        sourceField: dto.sourceField ?? undefined,
        targetField: dto.targetField ?? undefined,
        transformExpr: dto.transformExpr ?? undefined,
        isRequired: dto.isRequired ?? undefined,
        nullPolicy: dto.nullPolicy ?? undefined,
        defaultValue: dto.defaultValue ? (dto.defaultValue as Prisma.InputJsonValue) : undefined,
        rulePriority: dto.rulePriority ?? undefined,
        isActive: dto.isActive ?? undefined,
        createdByUserId: userId ?? undefined,
      },
    });
  }

  async deleteStandardizationMappingRule(id: string) {
    await this.getStandardizationMappingRule(id);
    return this.prisma.standardizationMappingRule.delete({ where: { id } });
  }

  private wrapPage<T>(data: T[], total: number, page: number, pageSize: number) {
    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
