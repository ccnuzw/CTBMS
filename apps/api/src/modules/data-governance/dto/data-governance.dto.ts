import {
  CreateWeatherObservationSchema,
  UpdateWeatherObservationSchema,
  WeatherObservationQuerySchema,
  CreateLogisticsRouteSnapshotSchema,
  UpdateLogisticsRouteSnapshotSchema,
  LogisticsRouteSnapshotQuerySchema,
  CreateMetricCatalogSchema,
  UpdateMetricCatalogSchema,
  MetricCatalogQuerySchema,
  CreateMetricValueSnapshotSchema,
  UpdateMetricValueSnapshotSchema,
  MetricValueSnapshotQuerySchema,
  CreateEvidenceBundleSchema,
  UpdateEvidenceBundleSchema,
  EvidenceBundleQuerySchema,
  EvidenceClaimQuerySchema,
  EvidenceConflictQuerySchema,
  CreateDataQualityIssueSchema,
  UpdateDataQualityIssueSchema,
  DataQualityIssueQuerySchema,
  CreateDataSourceHealthSnapshotSchema,
  UpdateDataSourceHealthSnapshotSchema,
  DataSourceHealthSnapshotQuerySchema,
  CreateStandardizationMappingRuleSchema,
  UpdateStandardizationMappingRuleSchema,
  StandardizationMappingRuleQuerySchema,
} from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateWeatherObservationRequest extends createZodDto(CreateWeatherObservationSchema) {}
export class UpdateWeatherObservationRequest extends createZodDto(UpdateWeatherObservationSchema) {}
export class WeatherObservationQueryRequest extends createZodDto(WeatherObservationQuerySchema) {}

export class CreateLogisticsRouteSnapshotRequest extends createZodDto(
  CreateLogisticsRouteSnapshotSchema,
) {}
export class UpdateLogisticsRouteSnapshotRequest extends createZodDto(
  UpdateLogisticsRouteSnapshotSchema,
) {}
export class LogisticsRouteSnapshotQueryRequest extends createZodDto(
  LogisticsRouteSnapshotQuerySchema,
) {}

export class CreateMetricCatalogRequest extends createZodDto(CreateMetricCatalogSchema) {}
export class UpdateMetricCatalogRequest extends createZodDto(UpdateMetricCatalogSchema) {}
export class MetricCatalogQueryRequest extends createZodDto(MetricCatalogQuerySchema) {}

export class CreateMetricValueSnapshotRequest extends createZodDto(CreateMetricValueSnapshotSchema) {}
export class UpdateMetricValueSnapshotRequest extends createZodDto(
  UpdateMetricValueSnapshotSchema,
) {}
export class MetricValueSnapshotQueryRequest extends createZodDto(MetricValueSnapshotQuerySchema) {}

export class CreateEvidenceBundleRequest extends createZodDto(CreateEvidenceBundleSchema) {}
export class UpdateEvidenceBundleRequest extends createZodDto(UpdateEvidenceBundleSchema) {}
export class EvidenceBundleQueryRequest extends createZodDto(EvidenceBundleQuerySchema) {}
export class EvidenceClaimQueryRequest extends createZodDto(EvidenceClaimQuerySchema) {}
export class EvidenceConflictQueryRequest extends createZodDto(EvidenceConflictQuerySchema) {}

export class CreateDataQualityIssueRequest extends createZodDto(CreateDataQualityIssueSchema) {}
export class UpdateDataQualityIssueRequest extends createZodDto(UpdateDataQualityIssueSchema) {}
export class DataQualityIssueQueryRequest extends createZodDto(DataQualityIssueQuerySchema) {}

export class CreateDataSourceHealthSnapshotRequest extends createZodDto(
  CreateDataSourceHealthSnapshotSchema,
) {}
export class UpdateDataSourceHealthSnapshotRequest extends createZodDto(
  UpdateDataSourceHealthSnapshotSchema,
) {}
export class DataSourceHealthSnapshotQueryRequest extends createZodDto(
  DataSourceHealthSnapshotQuerySchema,
) {}

export class CreateStandardizationMappingRuleRequest extends createZodDto(
  CreateStandardizationMappingRuleSchema,
) {}
export class UpdateStandardizationMappingRuleRequest extends createZodDto(
  UpdateStandardizationMappingRuleSchema,
) {}
export class StandardizationMappingRuleQueryRequest extends createZodDto(
  StandardizationMappingRuleQuerySchema,
) {}
