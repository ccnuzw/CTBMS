import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import {
  CreateWeatherObservationRequest,
  UpdateWeatherObservationRequest,
  WeatherObservationQueryRequest,
  CreateLogisticsRouteSnapshotRequest,
  UpdateLogisticsRouteSnapshotRequest,
  LogisticsRouteSnapshotQueryRequest,
  CreateMetricCatalogRequest,
  UpdateMetricCatalogRequest,
  MetricCatalogQueryRequest,
  CreateMetricValueSnapshotRequest,
  UpdateMetricValueSnapshotRequest,
  MetricValueSnapshotQueryRequest,
  CreateEvidenceBundleRequest,
  UpdateEvidenceBundleRequest,
  EvidenceBundleQueryRequest,
  EvidenceClaimQueryRequest,
  EvidenceConflictQueryRequest,
  CreateDataQualityIssueRequest,
  UpdateDataQualityIssueRequest,
  DataQualityIssueQueryRequest,
  CreateDataSourceHealthSnapshotRequest,
  UpdateDataSourceHealthSnapshotRequest,
  DataSourceHealthSnapshotQueryRequest,
  CreateStandardizationMappingRuleRequest,
  UpdateStandardizationMappingRuleRequest,
  StandardizationMappingRuleQueryRequest,
} from './dto';
import { DataGovernanceService } from './data-governance.service';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('data-governance')
export class DataGovernanceController {
  constructor(private readonly service: DataGovernanceService) {}

  @Post('weather-observations')
  createWeatherObservation(@Body() dto: CreateWeatherObservationRequest) {
    return this.service.createWeatherObservation(dto);
  }

  @Get('weather-observations')
  listWeatherObservations(@Query() query: WeatherObservationQueryRequest) {
    return this.service.listWeatherObservations(query);
  }

  @Get('weather-observations/:id')
  getWeatherObservation(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getWeatherObservation(id);
  }

  @Patch('weather-observations/:id')
  updateWeatherObservation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWeatherObservationRequest,
  ) {
    return this.service.updateWeatherObservation(id, dto);
  }

  @Delete('weather-observations/:id')
  deleteWeatherObservation(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteWeatherObservation(id);
  }

  @Post('logistics-route-snapshots')
  createLogisticsRouteSnapshot(@Body() dto: CreateLogisticsRouteSnapshotRequest) {
    return this.service.createLogisticsRouteSnapshot(dto);
  }

  @Get('logistics-route-snapshots')
  listLogisticsRouteSnapshots(@Query() query: LogisticsRouteSnapshotQueryRequest) {
    return this.service.listLogisticsRouteSnapshots(query);
  }

  @Get('logistics-route-snapshots/:id')
  getLogisticsRouteSnapshot(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getLogisticsRouteSnapshot(id);
  }

  @Patch('logistics-route-snapshots/:id')
  updateLogisticsRouteSnapshot(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLogisticsRouteSnapshotRequest,
  ) {
    return this.service.updateLogisticsRouteSnapshot(id, dto);
  }

  @Delete('logistics-route-snapshots/:id')
  deleteLogisticsRouteSnapshot(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteLogisticsRouteSnapshot(id);
  }

  @Post('metric-catalogs')
  createMetricCatalog(@Body() dto: CreateMetricCatalogRequest, @Request() req: AuthRequest) {
    return this.service.createMetricCatalog(dto, this.getUserId(req));
  }

  @Get('metric-catalogs')
  listMetricCatalogs(@Query() query: MetricCatalogQueryRequest) {
    return this.service.listMetricCatalogs(query);
  }

  @Get('metric-catalogs/:id')
  getMetricCatalog(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getMetricCatalog(id);
  }

  @Patch('metric-catalogs/:id')
  updateMetricCatalog(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMetricCatalogRequest,
    @Request() req: AuthRequest,
  ) {
    return this.service.updateMetricCatalog(id, dto, this.getUserId(req));
  }

  @Delete('metric-catalogs/:id')
  deleteMetricCatalog(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteMetricCatalog(id);
  }

  @Post('metric-snapshots')
  createMetricValueSnapshot(@Body() dto: CreateMetricValueSnapshotRequest) {
    return this.service.createMetricValueSnapshot(dto);
  }

  @Get('metric-snapshots')
  listMetricValueSnapshots(@Query() query: MetricValueSnapshotQueryRequest) {
    return this.service.listMetricValueSnapshots(query);
  }

  @Get('metric-snapshots/:id')
  getMetricValueSnapshot(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getMetricValueSnapshot(id);
  }

  @Patch('metric-snapshots/:id')
  updateMetricValueSnapshot(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMetricValueSnapshotRequest,
  ) {
    return this.service.updateMetricValueSnapshot(id, dto);
  }

  @Delete('metric-snapshots/:id')
  deleteMetricValueSnapshot(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteMetricValueSnapshot(id);
  }

  @Post('evidence-bundles')
  createEvidenceBundle(@Body() dto: CreateEvidenceBundleRequest, @Request() req: AuthRequest) {
    return this.service.createEvidenceBundle(dto, this.getUserId(req));
  }

  @Get('evidence-bundles')
  listEvidenceBundles(@Query() query: EvidenceBundleQueryRequest) {
    return this.service.listEvidenceBundles(query);
  }

  @Get('evidence-bundles/:id')
  getEvidenceBundle(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getEvidenceBundle(id);
  }

  @Patch('evidence-bundles/:id')
  updateEvidenceBundle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEvidenceBundleRequest,
    @Request() req: AuthRequest,
  ) {
    return this.service.updateEvidenceBundle(id, dto, this.getUserId(req));
  }

  @Delete('evidence-bundles/:id')
  deleteEvidenceBundle(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteEvidenceBundle(id);
  }

  @Get('evidence-claims')
  listEvidenceClaims(@Query() query: EvidenceClaimQueryRequest) {
    return this.service.listEvidenceClaims(query);
  }

  @Get('evidence-conflicts')
  listEvidenceConflicts(@Query() query: EvidenceConflictQueryRequest) {
    return this.service.listEvidenceConflicts(query);
  }

  @Post('data-quality-issues')
  createDataQualityIssue(@Body() dto: CreateDataQualityIssueRequest) {
    return this.service.createDataQualityIssue(dto);
  }

  @Get('data-quality-issues')
  listDataQualityIssues(@Query() query: DataQualityIssueQueryRequest) {
    return this.service.listDataQualityIssues(query);
  }

  @Get('data-quality-issues/:id')
  getDataQualityIssue(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getDataQualityIssue(id);
  }

  @Patch('data-quality-issues/:id')
  updateDataQualityIssue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDataQualityIssueRequest,
  ) {
    return this.service.updateDataQualityIssue(id, dto);
  }

  @Delete('data-quality-issues/:id')
  deleteDataQualityIssue(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteDataQualityIssue(id);
  }

  @Post('data-source-health-snapshots')
  createDataSourceHealthSnapshot(@Body() dto: CreateDataSourceHealthSnapshotRequest) {
    return this.service.createDataSourceHealthSnapshot(dto);
  }

  @Get('data-source-health-snapshots')
  listDataSourceHealthSnapshots(@Query() query: DataSourceHealthSnapshotQueryRequest) {
    return this.service.listDataSourceHealthSnapshots(query);
  }

  @Get('data-source-health-snapshots/:id')
  getDataSourceHealthSnapshot(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getDataSourceHealthSnapshot(id);
  }

  @Patch('data-source-health-snapshots/:id')
  updateDataSourceHealthSnapshot(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDataSourceHealthSnapshotRequest,
  ) {
    return this.service.updateDataSourceHealthSnapshot(id, dto);
  }

  @Delete('data-source-health-snapshots/:id')
  deleteDataSourceHealthSnapshot(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteDataSourceHealthSnapshot(id);
  }

  @Post('standardization-mapping-rules')
  createStandardizationMappingRule(
    @Body() dto: CreateStandardizationMappingRuleRequest,
    @Request() req: AuthRequest,
  ) {
    return this.service.createStandardizationMappingRule(dto, this.getUserId(req));
  }

  @Get('standardization-mapping-rules')
  listStandardizationMappingRules(@Query() query: StandardizationMappingRuleQueryRequest) {
    return this.service.listStandardizationMappingRules(query);
  }

  @Get('standardization-mapping-rules/:id')
  getStandardizationMappingRule(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getStandardizationMappingRule(id);
  }

  @Patch('standardization-mapping-rules/:id')
  updateStandardizationMappingRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStandardizationMappingRuleRequest,
    @Request() req: AuthRequest,
  ) {
    return this.service.updateStandardizationMappingRule(id, dto, this.getUserId(req));
  }

  @Delete('standardization-mapping-rules/:id')
  deleteStandardizationMappingRule(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteStandardizationMappingRule(id);
  }

  private getUserId(req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    return userId;
  }
}
