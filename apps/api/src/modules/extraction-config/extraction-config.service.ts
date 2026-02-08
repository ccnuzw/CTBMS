import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RuleEngineService, RuleCondition } from '../ai/rule-engine.service';

@Injectable()
export class ExtractionConfigService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly ruleEngine: RuleEngineService,
    ) { }

    // ===== 事件类型配置 =====

    async findAllEventTypes() {
        return this.prisma.eventTypeConfig.findMany({
            orderBy: { sortOrder: 'asc' },
            include: {
                _count: { select: { events: true, extractionRules: true } },
            },
        });
    }

    async findEventTypeById(id: string) {
        return this.prisma.eventTypeConfig.findUnique({
            where: { id },
            include: {
                extractionRules: true,
                _count: { select: { events: true } },
            },
        });
    }

    async createEventType(data: {
        code: string;
        name: string;
        description?: string;
        category: string;
        icon?: string;
        color?: string;
        sortOrder?: number;
    }) {
        return this.prisma.eventTypeConfig.create({ data });
    }

    async updateEventType(id: string, data: Partial<{
        name: string;
        description: string;
        category: string;
        icon: string;
        color: string;
        isActive: boolean;
        sortOrder: number;
    }>) {
        return this.prisma.eventTypeConfig.update({ where: { id }, data });
    }

    async deleteEventType(id: string) {
        return this.prisma.eventTypeConfig.delete({ where: { id } });
    }

    // ===== 洞察类型配置 =====

    async findAllInsightTypes() {
        return this.prisma.insightTypeConfig.findMany({
            orderBy: { sortOrder: 'asc' },
            include: {
                _count: { select: { insights: true, extractionRules: true } },
            },
        });
    }

    async findInsightTypeById(id: string) {
        return this.prisma.insightTypeConfig.findUnique({
            where: { id },
            include: {
                extractionRules: true,
                _count: { select: { insights: true } },
            },
        });
    }

    async createInsightType(data: {
        code: string;
        name: string;
        description?: string;
        category: string;
        icon?: string;
        color?: string;
        sortOrder?: number;
    }) {
        return this.prisma.insightTypeConfig.create({ data });
    }

    async updateInsightType(id: string, data: Partial<{
        name: string;
        description: string;
        category: string;
        icon: string;
        color: string;
        isActive: boolean;
        sortOrder: number;
    }>) {
        return this.prisma.insightTypeConfig.update({ where: { id }, data });
    }

    async deleteInsightType(id: string) {
        return this.prisma.insightTypeConfig.delete({ where: { id } });
    }

    // ===== 提取规则配置 =====

    async findAllRules(params?: { targetType?: string; isActive?: boolean }) {
        return this.prisma.extractionRule.findMany({
            where: {
                targetType: params?.targetType,
                isActive: params?.isActive,
            },
            orderBy: { priority: 'desc' },
            include: {
                eventType: true,
                insightType: true,
            },
        });
    }

    async findRuleById(id: string) {
        return this.prisma.extractionRule.findUnique({
            where: { id },
            include: {
                eventType: true,
                insightType: true,
            },
        });
    }

    async createRule(data: {
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
    }) {
        return this.prisma.extractionRule.create({ data });
    }

    async updateRule(id: string, data: Partial<{
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
    }>) {
        return this.prisma.extractionRule.update({ where: { id }, data });
    }

    async deleteRule(id: string) {
        return this.prisma.extractionRule.delete({ where: { id } });
    }

    // ===== 规则测试 =====

    async testRule(ruleId: string, testText: string) {
        const rule = await this.findRuleById(ruleId);
        if (!rule) {
            throw new Error('规则不存在');
        }

        // 使用规则引擎测试
        const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
        const results = await this.ruleEngine.testConditions(
            conditions as unknown as RuleCondition[],
            testText,
        );
        return results;
    }

    async testConditions(conditions: RuleCondition[], testText: string) {
        // 使用规则引擎测试条件
        return this.ruleEngine.testConditions(conditions, testText);
    }
}
