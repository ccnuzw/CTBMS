import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExtractionConfigService } from './extraction-config.service';
import { RuleCondition } from '../ai/rule-engine.service';

@Controller('extraction-config')
export class ExtractionConfigController {
    constructor(private readonly configService: ExtractionConfigService) { }

    // ===== 事件类型 =====

    @Get('event-types')
    findAllEventTypes() {
        return this.configService.findAllEventTypes();
    }

    @Get('event-types/:id')
    findEventTypeById(@Param('id') id: string) {
        return this.configService.findEventTypeById(id);
    }

    @Post('event-types')
    createEventType(
        @Body() data: {
            code: string;
            name: string;
            description?: string;
            category: string;
            icon?: string;
            color?: string;
            sortOrder?: number;
        },
    ) {
        return this.configService.createEventType(data);
    }

    @Put('event-types/:id')
    updateEventType(
        @Param('id') id: string,
        @Body() data: Partial<{
            name: string;
            description: string;
            category: string;
            icon: string;
            color: string;
            isActive: boolean;
            sortOrder: number;
        }>,
    ) {
        return this.configService.updateEventType(id, data);
    }

    @Delete('event-types/:id')
    deleteEventType(@Param('id') id: string) {
        return this.configService.deleteEventType(id);
    }

    // ===== 洞察类型 =====

    @Get('insight-types')
    findAllInsightTypes() {
        return this.configService.findAllInsightTypes();
    }

    @Get('insight-types/:id')
    findInsightTypeById(@Param('id') id: string) {
        return this.configService.findInsightTypeById(id);
    }

    @Post('insight-types')
    createInsightType(
        @Body() data: {
            code: string;
            name: string;
            description?: string;
            category: string;
            icon?: string;
            color?: string;
            sortOrder?: number;
        },
    ) {
        return this.configService.createInsightType(data);
    }

    @Put('insight-types/:id')
    updateInsightType(
        @Param('id') id: string,
        @Body() data: Partial<{
            name: string;
            description: string;
            category: string;
            icon: string;
            color: string;
            isActive: boolean;
            sortOrder: number;
        }>,
    ) {
        return this.configService.updateInsightType(id, data);
    }

    @Delete('insight-types/:id')
    deleteInsightType(@Param('id') id: string) {
        return this.configService.deleteInsightType(id);
    }

    // ===== 提取规则 =====

    @Get('rules')
    findAllRules(
        @Query('targetType') targetType?: string,
        @Query('isActive') isActive?: string,
    ) {
        return this.configService.findAllRules({
            targetType,
            isActive: isActive ? isActive === 'true' : undefined,
        });
    }

    @Get('rules/:id')
    findRuleById(@Param('id') id: string) {
        return this.configService.findRuleById(id);
    }

    @Post('rules')
    createRule(
        @Body() data: {
            name: string;
            description?: string;
            targetType: string;
            eventTypeId?: string;
            insightTypeId?: string;
            conditions: Prisma.InputJsonValue;
            outputConfig?: Prisma.InputJsonValue;
            commodities?: string[];
            regions?: string[];
            priority?: number;
        },
    ) {
        return this.configService.createRule(data);
    }

    @Put('rules/:id')
    updateRule(
        @Param('id') id: string,
        @Body() data: Partial<{
            name: string;
            description: string;
            isActive: boolean;
            priority: number;
            eventTypeId: string;
            insightTypeId: string;
            conditions: Prisma.InputJsonValue;
            outputConfig: Prisma.InputJsonValue;
            commodities: string[];
            regions: string[];
        }>,
    ) {
        return this.configService.updateRule(id, data);
    }

    @Delete('rules/:id')
    deleteRule(@Param('id') id: string) {
        return this.configService.deleteRule(id);
    }

    // ===== 规则测试 =====

    @Post('rules/:id/test')
    testRule(@Param('id') id: string, @Body('text') text: string) {
        return this.configService.testRule(id, text);
    }

    @Post('rules/test-conditions')
    testConditions(@Body() data: { conditions: RuleCondition[]; text: string }) {
        return this.configService.testConditions(data.conditions, data.text);
    }
}
