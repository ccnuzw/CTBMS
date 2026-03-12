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
} from '@nestjs/common';
import {
    CreateWeatherObservationRequest,
    UpdateWeatherObservationRequest,
    WeatherObservationQueryRequest,
    CreateLogisticsRouteSnapshotRequest,
    UpdateLogisticsRouteSnapshotRequest,
    LogisticsRouteSnapshotQueryRequest,
} from '../dto';
import { DataGovernanceService } from '../data-governance.service';

@Controller('data-governance')
export class WeatherLogisticsController {
    constructor(private readonly service: DataGovernanceService) { }

    // ── Weather Observations ──

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

    // ── Logistics Route Snapshots ──

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
}
