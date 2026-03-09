import { z } from 'zod';

export const DataFreshnessStatusEnum = z.enum(['WITHIN_TTL', 'NEAR_EXPIRE', 'EXPIRED']);

export const DataSourceTypeEnum = z.enum([
  'INTERNAL',
  'PUBLIC',
  'FUTURES_API',
  'WEATHER_API',
  'LOGISTICS_API',
  'MANUAL',
]);

export const MetricStatusEnum = z.enum(['DRAFT', 'ACTIVE', 'DEPRECATED']);

export const EvidenceConflictResolutionEnum = z.enum([
  'PREFER_SOURCE_A',
  'PREFER_SOURCE_B',
  'MANUAL_REVIEW',
  'KEEP_BOTH',
]);

export const QualityIssueSeverityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const CreateWeatherObservationSchema = z.object({
  connectorId: z.string().uuid().optional(),
  regionCode: z.string().min(1).max(64),
  stationCode: z.string().min(1).max(64).optional(),
  dataTime: z.string().datetime(),
  tempC: z.coerce.number().optional(),
  rainfallMm: z.coerce.number().optional(),
  windSpeed: z.coerce.number().optional(),
  anomalyScore: z.coerce.number().optional(),
  eventLevel: z.string().min(1).max(40).optional(),
  freshnessStatus: DataFreshnessStatusEnum.default('WITHIN_TTL'),
  qualityScore: z.coerce.number().min(0).max(1),
  sourceType: DataSourceTypeEnum,
  sourceRecordId: z.string().min(1).max(120).optional(),
  collectedAt: z.string().datetime().optional(),
});

export const UpdateWeatherObservationSchema = z.object({
  connectorId: z.string().uuid().optional(),
  regionCode: z.string().min(1).max(64).optional(),
  stationCode: z.string().min(1).max(64).optional(),
  dataTime: z.string().datetime().optional(),
  tempC: z.coerce.number().optional(),
  rainfallMm: z.coerce.number().optional(),
  windSpeed: z.coerce.number().optional(),
  anomalyScore: z.coerce.number().optional(),
  eventLevel: z.string().min(1).max(40).optional(),
  freshnessStatus: DataFreshnessStatusEnum.optional(),
  qualityScore: z.coerce.number().min(0).max(1).optional(),
  sourceType: DataSourceTypeEnum.optional(),
  sourceRecordId: z.string().min(1).max(120).optional(),
  collectedAt: z.string().datetime().optional(),
});

export const WeatherObservationQuerySchema = PaginationSchema.extend({
  regionCode: z.string().min(1).max(64).optional(),
  connectorId: z.string().uuid().optional(),
  sourceType: DataSourceTypeEnum.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const CreateLogisticsRouteSnapshotSchema = z.object({
  connectorId: z.string().uuid().optional(),
  routeCode: z.string().min(1).max(64),
  originRegionCode: z.string().min(1).max(64),
  destinationRegionCode: z.string().min(1).max(64),
  transportMode: z.string().min(1).max(40),
  dataTime: z.string().datetime(),
  freightCost: z.coerce.number().min(0),
  transitHours: z.coerce.number().optional(),
  delayIndex: z.coerce.number().optional(),
  capacityUtilization: z.coerce.number().optional(),
  eventFlag: z.string().min(1).max(40).optional(),
  freshnessStatus: DataFreshnessStatusEnum.default('WITHIN_TTL'),
  qualityScore: z.coerce.number().min(0).max(1),
  sourceType: DataSourceTypeEnum,
  sourceRecordId: z.string().min(1).max(120).optional(),
  collectedAt: z.string().datetime().optional(),
});

export const UpdateLogisticsRouteSnapshotSchema = z.object({
  connectorId: z.string().uuid().optional(),
  routeCode: z.string().min(1).max(64).optional(),
  originRegionCode: z.string().min(1).max(64).optional(),
  destinationRegionCode: z.string().min(1).max(64).optional(),
  transportMode: z.string().min(1).max(40).optional(),
  dataTime: z.string().datetime().optional(),
  freightCost: z.coerce.number().min(0).optional(),
  transitHours: z.coerce.number().optional(),
  delayIndex: z.coerce.number().optional(),
  capacityUtilization: z.coerce.number().optional(),
  eventFlag: z.string().min(1).max(40).optional(),
  freshnessStatus: DataFreshnessStatusEnum.optional(),
  qualityScore: z.coerce.number().min(0).max(1).optional(),
  sourceType: DataSourceTypeEnum.optional(),
  sourceRecordId: z.string().min(1).max(120).optional(),
  collectedAt: z.string().datetime().optional(),
});

export const LogisticsRouteSnapshotQuerySchema = PaginationSchema.extend({
  routeCode: z.string().min(1).max(64).optional(),
  originRegionCode: z.string().min(1).max(64).optional(),
  destinationRegionCode: z.string().min(1).max(64).optional(),
  connectorId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const CreateMetricCatalogSchema = z.object({
  metricCode: z.string().min(1).max(80),
  metricName: z.string().min(1).max(120),
  description: z.string().max(400).optional(),
  version: z.string().min(1).max(40),
  expression: z.string().min(1),
  unit: z.string().max(40).optional(),
  granularity: z.string().max(40).optional(),
  dimensions: z.record(z.unknown()).optional(),
  status: MetricStatusEnum.default('DRAFT'),
});

export const UpdateMetricCatalogSchema = z.object({
  metricCode: z.string().min(1).max(80).optional(),
  metricName: z.string().min(1).max(120).optional(),
  description: z.string().max(400).optional(),
  version: z.string().min(1).max(40).optional(),
  expression: z.string().min(1).optional(),
  unit: z.string().max(40).optional(),
  granularity: z.string().max(40).optional(),
  dimensions: z.record(z.unknown()).optional(),
  status: MetricStatusEnum.optional(),
});

export const MetricCatalogQuerySchema = PaginationSchema.extend({
  metricCode: z.string().min(1).max(80).optional(),
  status: MetricStatusEnum.optional(),
});

export const CreateMetricValueSnapshotSchema = z.object({
  metricCatalogId: z.string().uuid(),
  metricCode: z.string().min(1).max(80),
  metricVersion: z.string().min(1).max(40),
  value: z.coerce.number(),
  valueText: z.string().max(200).optional(),
  dimensions: z.record(z.unknown()).optional(),
  dataTime: z.string().datetime(),
  freshnessStatus: DataFreshnessStatusEnum.default('WITHIN_TTL'),
  qualityScore: z.coerce.number().min(0).max(1),
  confidenceScore: z.coerce.number().min(0).max(1).optional(),
  sourceSummary: z.record(z.unknown()).optional(),
});

export const UpdateMetricValueSnapshotSchema = z.object({
  metricCatalogId: z.string().uuid().optional(),
  metricCode: z.string().min(1).max(80).optional(),
  metricVersion: z.string().min(1).max(40).optional(),
  value: z.coerce.number().optional(),
  valueText: z.string().max(200).optional(),
  dimensions: z.record(z.unknown()).optional(),
  dataTime: z.string().datetime().optional(),
  freshnessStatus: DataFreshnessStatusEnum.optional(),
  qualityScore: z.coerce.number().min(0).max(1).optional(),
  confidenceScore: z.coerce.number().min(0).max(1).optional(),
  sourceSummary: z.record(z.unknown()).optional(),
});

export const MetricValueSnapshotQuerySchema = PaginationSchema.extend({
  metricCatalogId: z.string().uuid().optional(),
  metricCode: z.string().min(1).max(80).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const CreateEvidenceBundleSchema = z.object({
  conversationSessionId: z.string().uuid().optional(),
  workflowExecutionId: z.string().uuid().optional(),
  title: z.string().max(120).optional(),
  confidenceScore: z.coerce.number().min(0).max(1).optional(),
  consistencyScore: z.coerce.number().min(0).max(1).optional(),
  summary: z.record(z.unknown()).optional(),
  claims: z
    .array(
      z.object({
        claimText: z.string().min(1),
        claimType: z.string().max(40).optional(),
        confidenceScore: z.coerce.number().min(0).max(1).optional(),
        evidenceItems: z.array(z.record(z.unknown())),
        sourceCount: z.coerce.number().int().min(0).optional(),
        dataTimestamp: z.string().datetime().optional(),
      }),
    )
    .optional(),
  conflicts: z
    .array(
      z.object({
        topic: z.string().min(1).max(120),
        sourceA: z.string().min(1).max(120),
        sourceB: z.string().min(1).max(120),
        valueA: z.record(z.unknown()).optional(),
        valueB: z.record(z.unknown()).optional(),
        resolution: EvidenceConflictResolutionEnum,
        reason: z.string().max(200).optional(),
        impactLevel: z.string().max(40).optional(),
      }),
    )
    .optional(),
});

export const UpdateEvidenceBundleSchema = z.object({
  conversationSessionId: z.string().uuid().optional(),
  workflowExecutionId: z.string().uuid().optional(),
  title: z.string().max(120).optional(),
  confidenceScore: z.coerce.number().min(0).max(1).optional(),
  consistencyScore: z.coerce.number().min(0).max(1).optional(),
  summary: z.record(z.unknown()).optional(),
});

export const EvidenceBundleQuerySchema = PaginationSchema.extend({
  conversationSessionId: z.string().uuid().optional(),
  workflowExecutionId: z.string().uuid().optional(),
});

export const EvidenceClaimQuerySchema = PaginationSchema.extend({
  bundleId: z.string().uuid(),
});

export const EvidenceConflictQuerySchema = PaginationSchema.extend({
  bundleId: z.string().uuid(),
});

export const CreateDataQualityIssueSchema = z.object({
  datasetName: z.string().min(1).max(80),
  sourceType: DataSourceTypeEnum,
  connectorId: z.string().uuid().optional(),
  issueType: z.string().min(1).max(80),
  severity: QualityIssueSeverityEnum,
  message: z.string().min(1).max(500),
  payload: z.record(z.unknown()).optional(),
});

export const UpdateDataQualityIssueSchema = z.object({
  datasetName: z.string().min(1).max(80).optional(),
  sourceType: DataSourceTypeEnum.optional(),
  connectorId: z.string().uuid().optional(),
  issueType: z.string().min(1).max(80).optional(),
  severity: QualityIssueSeverityEnum.optional(),
  message: z.string().min(1).max(500).optional(),
  payload: z.record(z.unknown()).optional(),
  resolvedAt: z.string().datetime().optional(),
  resolverUserId: z.string().uuid().optional(),
  resolutionNote: z.string().max(400).optional(),
});

export const DataQualityIssueQuerySchema = PaginationSchema.extend({
  datasetName: z.string().min(1).max(80).optional(),
  severity: QualityIssueSeverityEnum.optional(),
  connectorId: z.string().uuid().optional(),
});

export const CreateDataSourceHealthSnapshotSchema = z.object({
  connectorId: z.string().uuid(),
  sourceType: DataSourceTypeEnum,
  windowStartAt: z.string().datetime(),
  windowEndAt: z.string().datetime(),
  requestCount: z.coerce.number().int().min(0).optional(),
  successCount: z.coerce.number().int().min(0).optional(),
  errorCount: z.coerce.number().int().min(0).optional(),
  p95LatencyMs: z.coerce.number().int().min(0).optional(),
  avgLatencyMs: z.coerce.number().int().min(0).optional(),
  availabilityRatio: z.coerce.number().min(0).max(1).optional(),
});

export const UpdateDataSourceHealthSnapshotSchema = z.object({
  connectorId: z.string().uuid().optional(),
  sourceType: DataSourceTypeEnum.optional(),
  windowStartAt: z.string().datetime().optional(),
  windowEndAt: z.string().datetime().optional(),
  requestCount: z.coerce.number().int().min(0).optional(),
  successCount: z.coerce.number().int().min(0).optional(),
  errorCount: z.coerce.number().int().min(0).optional(),
  p95LatencyMs: z.coerce.number().int().min(0).optional(),
  avgLatencyMs: z.coerce.number().int().min(0).optional(),
  availabilityRatio: z.coerce.number().min(0).max(1).optional(),
});

export const DataSourceHealthSnapshotQuerySchema = PaginationSchema.extend({
  connectorId: z.string().uuid().optional(),
  sourceType: DataSourceTypeEnum.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const CreateStandardizationMappingRuleSchema = z.object({
  datasetName: z.string().min(1).max(80),
  mappingVersion: z.string().min(1).max(40),
  sourceField: z.string().min(1).max(120),
  targetField: z.string().min(1).max(120),
  transformExpr: z.string().optional(),
  isRequired: z.boolean().optional(),
  nullPolicy: z.string().min(1).max(20).default('FAIL'),
  defaultValue: z.record(z.unknown()).optional(),
  rulePriority: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const UpdateStandardizationMappingRuleSchema = z.object({
  datasetName: z.string().min(1).max(80).optional(),
  mappingVersion: z.string().min(1).max(40).optional(),
  sourceField: z.string().min(1).max(120).optional(),
  targetField: z.string().min(1).max(120).optional(),
  transformExpr: z.string().optional(),
  isRequired: z.boolean().optional(),
  nullPolicy: z.string().min(1).max(20).optional(),
  defaultValue: z.record(z.unknown()).optional(),
  rulePriority: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const StandardizationMappingRuleQuerySchema = PaginationSchema.extend({
  datasetName: z.string().min(1).max(80).optional(),
  mappingVersion: z.string().min(1).max(40).optional(),
  isActive: z.boolean().optional(),
});

export type CreateWeatherObservationDto = z.infer<typeof CreateWeatherObservationSchema>;
export type UpdateWeatherObservationDto = z.infer<typeof UpdateWeatherObservationSchema>;
export type WeatherObservationQueryDto = z.infer<typeof WeatherObservationQuerySchema>;
export type CreateLogisticsRouteSnapshotDto = z.infer<typeof CreateLogisticsRouteSnapshotSchema>;
export type UpdateLogisticsRouteSnapshotDto = z.infer<typeof UpdateLogisticsRouteSnapshotSchema>;
export type LogisticsRouteSnapshotQueryDto = z.infer<typeof LogisticsRouteSnapshotQuerySchema>;
export type CreateMetricCatalogDto = z.infer<typeof CreateMetricCatalogSchema>;
export type UpdateMetricCatalogDto = z.infer<typeof UpdateMetricCatalogSchema>;
export type MetricCatalogQueryDto = z.infer<typeof MetricCatalogQuerySchema>;
export type CreateMetricValueSnapshotDto = z.infer<typeof CreateMetricValueSnapshotSchema>;
export type UpdateMetricValueSnapshotDto = z.infer<typeof UpdateMetricValueSnapshotSchema>;
export type MetricValueSnapshotQueryDto = z.infer<typeof MetricValueSnapshotQuerySchema>;
export type CreateEvidenceBundleDto = z.infer<typeof CreateEvidenceBundleSchema>;
export type UpdateEvidenceBundleDto = z.infer<typeof UpdateEvidenceBundleSchema>;
export type EvidenceBundleQueryDto = z.infer<typeof EvidenceBundleQuerySchema>;
export type EvidenceClaimQueryDto = z.infer<typeof EvidenceClaimQuerySchema>;
export type EvidenceConflictQueryDto = z.infer<typeof EvidenceConflictQuerySchema>;
export type CreateDataQualityIssueDto = z.infer<typeof CreateDataQualityIssueSchema>;
export type UpdateDataQualityIssueDto = z.infer<typeof UpdateDataQualityIssueSchema>;
export type DataQualityIssueQueryDto = z.infer<typeof DataQualityIssueQuerySchema>;
export type CreateDataSourceHealthSnapshotDto = z.infer<typeof CreateDataSourceHealthSnapshotSchema>;
export type UpdateDataSourceHealthSnapshotDto = z.infer<typeof UpdateDataSourceHealthSnapshotSchema>;
export type DataSourceHealthSnapshotQueryDto = z.infer<typeof DataSourceHealthSnapshotQuerySchema>;
export type CreateStandardizationMappingRuleDto = z.infer<typeof CreateStandardizationMappingRuleSchema>;
export type UpdateStandardizationMappingRuleDto = z.infer<typeof UpdateStandardizationMappingRuleSchema>;
export type StandardizationMappingRuleQueryDto = z.infer<typeof StandardizationMappingRuleQuerySchema>;
