import { Controller, Get, Post, Patch, Delete, Param, Query, Body } from '@nestjs/common';
import { SemanticLayerService } from './semantic-layer.service';
import {
    CreateCommodityDto,
    UpdateCommodityDto,
    CommodityQueryDto,
    CreateRegionDto,
    UpdateRegionDto,
    MasterRegionQueryDto,
    CreateMetricDefinitionDto,
    UpdateMetricDefinitionDto,
    MetricDefinitionQueryDto,
} from './dto';

@Controller('semantic-layer')
export class SemanticLayerController {
    constructor(private readonly service: SemanticLayerService) { }

    // ── Commodity ──

    @Post('commodities')
    createCommodity(@Body() dto: CreateCommodityDto) {
        return this.service.createCommodity(dto);
    }

    @Get('commodities')
    listCommodities(@Query() query: CommodityQueryDto) {
        return this.service.listCommodities(query);
    }

    @Get('commodities/:code')
    findCommodity(@Param('code') code: string) {
        return this.service.findCommodity(code);
    }

    @Patch('commodities/:code')
    updateCommodity(@Param('code') code: string, @Body() dto: UpdateCommodityDto) {
        return this.service.updateCommodity(code, dto);
    }

    @Delete('commodities/:code')
    deleteCommodity(@Param('code') code: string) {
        return this.service.deleteCommodity(code);
    }

    // ── Region ──

    @Post('regions')
    createRegion(@Body() dto: CreateRegionDto) {
        return this.service.createRegion(dto);
    }

    @Get('regions')
    listRegions(@Query() query: MasterRegionQueryDto) {
        return this.service.listRegions(query);
    }

    @Get('regions/:code')
    findRegion(@Param('code') code: string) {
        return this.service.findRegion(code);
    }

    @Patch('regions/:code')
    updateRegion(@Param('code') code: string, @Body() dto: UpdateRegionDto) {
        return this.service.updateRegion(code, dto);
    }

    @Delete('regions/:code')
    deleteRegion(@Param('code') code: string) {
        return this.service.deleteRegion(code);
    }

    // ── MetricDefinition ──

    @Post('metrics')
    createMetricDefinition(@Body() dto: CreateMetricDefinitionDto) {
        return this.service.createMetricDefinition(dto);
    }

    @Get('metrics')
    listMetricDefinitions(@Query() query: MetricDefinitionQueryDto) {
        return this.service.listMetricDefinitions(query);
    }

    @Get('metrics/:metricCode')
    findMetricDefinition(@Param('metricCode') metricCode: string) {
        return this.service.findMetricDefinition(metricCode);
    }

    @Patch('metrics/:metricCode')
    updateMetricDefinition(
        @Param('metricCode') metricCode: string,
        @Body() dto: UpdateMetricDefinitionDto,
    ) {
        return this.service.updateMetricDefinition(metricCode, dto);
    }

    @Delete('metrics/:metricCode')
    deleteMetricDefinition(@Param('metricCode') metricCode: string) {
        return this.service.deleteMetricDefinition(metricCode);
    }
}
