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
    CreateMetricCatalogRequest,
    UpdateMetricCatalogRequest,
    MetricCatalogQueryRequest,
    CreateMetricValueSnapshotRequest,
    UpdateMetricValueSnapshotRequest,
    MetricValueSnapshotQueryRequest,
} from '../dto';
import { DataGovernanceService } from '../data-governance.service';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('data-governance')
export class MetricGovernanceController {
    constructor(private readonly service: DataGovernanceService) { }

    // ── Metric Catalogs ──

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

    // ── Metric Value Snapshots ──

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

    private getUserId(req: AuthRequest) {
        const userId = req.user?.id;
        if (!userId) {
            throw new UnauthorizedException('Unauthorized');
        }
        return userId;
    }
}
