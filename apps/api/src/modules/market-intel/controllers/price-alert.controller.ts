import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
} from '@nestjs/common';
import { PriceAlertService } from '../price-alert.service';
import { PriceDataQuery } from '@packages/types';

@Controller('market-intel')
export class PriceAlertController {
    constructor(private readonly priceAlertService: PriceAlertService) { }

    @Get('alerts/rules')
    async getAlertRules() {
        return this.priceAlertService.listAlertRules();
    }

    @Post('alerts/rules')
    async createAlertRule(
        @Body()
        body: {
            name: string;
            type: 'DAY_CHANGE_ABS' | 'DAY_CHANGE_PCT' | 'DEVIATION_FROM_MEAN_PCT' | 'CONTINUOUS_DAYS';
            threshold?: number;
            days?: number;
            direction?: 'UP' | 'DOWN' | 'BOTH';
            severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
            priority?: number;
            isActive?: boolean;
        },
    ) {
        return this.priceAlertService.createAlertRule(body);
    }

    @Patch('alerts/rules/:id')
    async updateAlertRule(
        @Param('id') id: string,
        @Body()
        body: {
            name?: string;
            type?: 'DAY_CHANGE_ABS' | 'DAY_CHANGE_PCT' | 'DEVIATION_FROM_MEAN_PCT' | 'CONTINUOUS_DAYS';
            threshold?: number;
            days?: number;
            direction?: 'UP' | 'DOWN' | 'BOTH';
            severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
            priority?: number;
            isActive?: boolean;
        },
    ) {
        return this.priceAlertService.updateAlertRule(id, body);
    }

    @Delete('alerts/rules/:id')
    async deleteAlertRule(@Param('id') id: string) {
        return this.priceAlertService.removeAlertRule(id);
    }

    @Post('alerts/actions/evaluate')
    async evaluateAlerts(
        @Query()
        query: PriceDataQuery & {
            days?: string;
            limit?: string;
        },
    ) {
        return this.priceAlertService.evaluateAlerts(query);
    }

    @Get('alerts')
    async getAlerts(
        @Query()
        query: PriceDataQuery & {
            days?: string;
            severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
            status?: 'OPEN' | 'ACKNOWLEDGED' | 'CLOSED';
            limit?: string;
            refresh?: string;
        },
    ) {
        return this.priceAlertService.getAlerts(query);
    }

    @Get('alerts/:id/logs')
    async getAlertLogs(@Param('id') id: string) {
        return this.priceAlertService.listAlertLogs(id);
    }

    @Patch('alerts/:id/status')
    async updateAlertStatus(
        @Param('id') id: string,
        @Body()
        body: {
            status: 'OPEN' | 'ACKNOWLEDGED' | 'CLOSED';
            note?: string;
            reason?: string;
            operator?: string;
        },
    ) {
        return this.priceAlertService.updateAlertStatus(
            id,
            body.status,
            body.note,
            body.reason,
            body.operator,
        );
    }
}
