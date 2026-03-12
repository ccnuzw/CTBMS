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
    CreateDataQualityIssueRequest,
    UpdateDataQualityIssueRequest,
    DataQualityIssueQueryRequest,
    CreateDataSourceHealthSnapshotRequest,
    UpdateDataSourceHealthSnapshotRequest,
    DataSourceHealthSnapshotQueryRequest,
    CreateStandardizationMappingRuleRequest,
    UpdateStandardizationMappingRuleRequest,
    StandardizationMappingRuleQueryRequest,
} from '../dto';
import { DataGovernanceService } from '../data-governance.service';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('data-governance')
export class DataQualityController {
    constructor(private readonly service: DataGovernanceService) { }

    // ── Data Quality Issues ──

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

    // ── Data Source Health Snapshots ──

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

    // ── Standardization Mapping Rules ──

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
