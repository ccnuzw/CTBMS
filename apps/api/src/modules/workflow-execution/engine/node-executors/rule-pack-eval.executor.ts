import { Injectable } from '@nestjs/common';
import { WorkflowNode } from '@packages/types';
import { Prisma } from '@prisma/client';
import {
    NodeExecutionContext,
    NodeExecutionResult,
    WorkflowNodeExecutor,
} from '../node-executor.interface';
import { PrismaService } from '../../../../prisma';

type DecisionRuleRecord = {
    ruleCode: string;
    name: string;
    fieldPath: string;
    operator: string;
    expectedValue: Prisma.JsonValue | null;
    weight: number;
};

type RuleSource =
    | 'DECISION_RULE_PACK'
    | 'MARKET_ALERT_RULE'
    | 'BUSINESS_MAPPING_RULE'
    | 'EXTRACTION_RULE'
    | 'INLINE';

type RuleHitRecord = {
    ruleCode: string;
    ruleName: string;
    fieldPath: string;
    operator: string;
    expectedValue: Prisma.JsonValue | null;
    actualValue: unknown;
    matched: boolean;
    weight: number;
    source: RuleSource;
    sourcePackCode?: string;
    sourceLayer?: string;
};

const RULE_LAYER_ORDER = ['DEFAULT', 'INDUSTRY', 'EXPERIENCE', 'RUNTIME_OVERRIDE'];

@Injectable()
export class RulePackEvalNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'RulePackEvalNodeExecutor';
    private readonly ruleNodeTypes = new Set(['rule-pack-eval', 'rule-eval', 'alert-check']);

    constructor(private readonly prisma: PrismaService) { }

    supports(node: WorkflowNode): boolean {
        return this.ruleNodeTypes.has(node.type);
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        const config = this.readObject(context.node.config) ?? {};
        const source = this.resolveRuleSource(context.node.type, config);

        switch (source) {
            case 'MARKET_ALERT_RULE':
                return this.executeMarketAlertRule(context, config);
            case 'BUSINESS_MAPPING_RULE':
                return this.executeBusinessMappingRule(context, config);
            case 'EXTRACTION_RULE':
                return this.executeExtractionRule(context, config);
            case 'INLINE':
                return this.executeInlineRule(context, config);
            case 'DECISION_RULE_PACK':
            default:
                return this.executeDecisionRulePack(context, config);
        }
    }

    private resolveRuleSource(nodeType: string, config: Record<string, unknown>): RuleSource {
        const explicit = this.readString(config.ruleSource)?.toUpperCase();
        if (
            explicit === 'DECISION_RULE_PACK' ||
            explicit === 'MARKET_ALERT_RULE' ||
            explicit === 'BUSINESS_MAPPING_RULE' ||
            explicit === 'EXTRACTION_RULE' ||
            explicit === 'INLINE'
        ) {
            return explicit;
        }

        if (nodeType === 'rule-pack-eval') {
            return 'DECISION_RULE_PACK';
        }
        if (nodeType === 'alert-check') {
            const hasAlertRef = Boolean(
                this.readString(config.alertRuleId) || this.readString(config.alertType),
            );
            return hasAlertRef ? 'MARKET_ALERT_RULE' : 'INLINE';
        }
        return 'INLINE';
    }

    private async executeDecisionRulePack(
        context: NodeExecutionContext,
        config: Record<string, unknown>,
    ): Promise<NodeExecutionResult> {
        const minHitScore = this.toClampedScore(config.minHitScore, 60);
        const selectedPackCodes = this.readRulePackCodes(config);
        const includeLayeredPacks = config.includeLayeredPacks === true;

        let packs = await this.loadDecisionRulePacksByCodes(context, selectedPackCodes);
        if (packs.length === 0 && includeLayeredPacks) {
            packs = await this.loadLayeredDecisionRulePacks(context, config);
        }
        if (packs.length === 0) {
            throw new Error('规则节点缺少可执行规则包（rulePackCode/rulePackCodes/includeLayeredPacks）');
        }

        const missingCodes = selectedPackCodes.filter(
            (code) => !packs.some((pack) => pack.rulePackCode === code),
        );
        if (missingCodes.length > 0) {
            throw new Error(`规则包不存在或无权限访问: ${missingCodes.join(', ')}`);
        }

        const flattenedRules = packs.flatMap((pack) =>
            pack.rules.map((rule) => ({
                packCode: pack.rulePackCode,
                ruleLayer: pack.ruleLayer,
                rule,
            })),
        );
        if (flattenedRules.length === 0) {
            throw new Error('规则包未配置可用规则');
        }

        const ruleHits: RuleHitRecord[] = flattenedRules.map((item) => {
            const base = this.evaluateRule(context.input, item.rule);
            return {
                ...base,
                source: 'DECISION_RULE_PACK',
                sourcePackCode: item.packCode,
                sourceLayer: item.ruleLayer,
            };
        });

        const summary = this.buildSummary(ruleHits, minHitScore, context.input);

        return {
            status: 'SUCCESS',
            output: {
                ...context.input,
                ruleSource: 'DECISION_RULE_PACK',
                rulePackCode: selectedPackCodes[0] ?? packs[0]?.rulePackCode,
                evaluatedRulePacks: packs.map((pack) => ({
                    id: pack.id,
                    rulePackCode: pack.rulePackCode,
                    name: pack.name,
                    version: pack.version,
                    ruleLayer: pack.ruleLayer,
                    applicableScopes: pack.applicableScopes,
                })),
                ...summary,
                evaluatedAt: new Date().toISOString(),
            },
        };
    }

    private async executeMarketAlertRule(
        context: NodeExecutionContext,
        config: Record<string, unknown>,
    ): Promise<NodeExecutionResult> {
        const minHitScore = this.toClampedScore(config.minHitScore, 50);
        const alertRule = await this.findMarketAlertRule(config);
        if (!alertRule) {
            throw new Error('未找到可执行的市场预警规则');
        }

        const fieldPath =
            this.readString(config.fieldPath) ?? this.resolveAlertFieldPath(alertRule.type) ?? 'value';
        const actualValue = this.readValueByPath(context.input, fieldPath);
        const expectedValue = this.resolveAlertExpectedValue(alertRule, config);
        const matched = this.matchAlertRule(alertRule.type, actualValue, expectedValue, alertRule.direction);

        const hit: RuleHitRecord = {
            ruleCode: alertRule.id,
            ruleName: alertRule.name,
            fieldPath,
            operator: this.resolveAlertOperator(alertRule.type),
            expectedValue,
            actualValue,
            matched,
            weight: this.normalizeWeight(alertRule.priority || 1),
            source: 'MARKET_ALERT_RULE',
        };

        const summary = this.buildSummary([hit], minHitScore, context.input);

        return {
            status: 'SUCCESS',
            output: {
                ...context.input,
                ruleSource: 'MARKET_ALERT_RULE',
                alertRule: {
                    id: alertRule.id,
                    name: alertRule.name,
                    type: alertRule.type,
                    threshold: alertRule.threshold,
                    days: alertRule.days,
                    direction: alertRule.direction,
                    severity: alertRule.severity,
                },
                ...summary,
                evaluatedAt: new Date().toISOString(),
            },
        };
    }

    private async executeBusinessMappingRule(
        context: NodeExecutionContext,
        config: Record<string, unknown>,
    ): Promise<NodeExecutionResult> {
        const minHitScore = this.toClampedScore(config.minHitScore, 80);
        const domain = this.readString(config.domain);
        const ruleCode = this.readString(config.ruleCode);
        const fieldPath = this.readString(config.fieldPath) ?? 'value';

        const where: Prisma.BusinessMappingRuleWhereInput = {
            isActive: true,
            ...(domain ? { domain } : {}),
            ...(ruleCode
                ? {
                    OR: [
                        { id: ruleCode },
                        { pattern: { contains: ruleCode, mode: 'insensitive' } },
                        { targetValue: { contains: ruleCode, mode: 'insensitive' } },
                    ],
                }
                : {}),
        };

        const rule = await this.prisma.businessMappingRule.findFirst({
            where,
            orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        });
        if (!rule) {
            throw new Error('未找到可执行的业务映射规则');
        }

        const actualValue = this.readValueByPath(context.input, fieldPath);
        const actualText = this.readString(actualValue) ?? String(actualValue ?? '');
        const matched = this.matchMappingRule(rule.matchMode, rule.pattern, actualText);

        const hit: RuleHitRecord = {
            ruleCode: rule.id,
            ruleName: rule.description || `${rule.domain}:${rule.pattern}`,
            fieldPath,
            operator: rule.matchMode,
            expectedValue: rule.targetValue,
            actualValue,
            matched,
            weight: this.normalizeWeight(rule.priority || 1),
            source: 'BUSINESS_MAPPING_RULE',
        };

        const summary = this.buildSummary([hit], minHitScore, context.input);

        return {
            status: 'SUCCESS',
            output: {
                ...context.input,
                ruleSource: 'BUSINESS_MAPPING_RULE',
                businessMappingRule: {
                    id: rule.id,
                    domain: rule.domain,
                    pattern: rule.pattern,
                    targetValue: rule.targetValue,
                    matchMode: rule.matchMode,
                },
                ...summary,
                evaluatedAt: new Date().toISOString(),
            },
        };
    }

    private async executeExtractionRule(
        context: NodeExecutionContext,
        config: Record<string, unknown>,
    ): Promise<NodeExecutionResult> {
        const minHitScore = this.toClampedScore(config.minHitScore, 80);
        const ruleCode = this.readString(config.ruleCode);

        const rule = await this.prisma.extractionRule.findFirst({
            where: {
                isActive: true,
                ...(ruleCode
                    ? {
                        OR: [
                            { id: ruleCode },
                            { name: { contains: ruleCode, mode: 'insensitive' } },
                        ],
                    }
                    : {}),
            },
            orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        });
        if (!rule) {
            throw new Error('未找到可执行的提取规则');
        }

        const conditionHits = this.evaluateExtractionConditions(context.input, rule.conditions);
        if (conditionHits.length === 0) {
            throw new Error('提取规则缺少可评估条件');
        }

        const totalWeight = conditionHits.reduce((sum, item) => sum + item.weight, 0);
        const matchedWeight = conditionHits.filter((item) => item.matched).reduce((sum, item) => sum + item.weight, 0);
        const hitScore = totalWeight > 0 ? this.toClampedScore((matchedWeight / totalWeight) * 100, 0) : 0;
        const passed = hitScore >= minHitScore;

        return {
            status: 'SUCCESS',
            output: {
                ...context.input,
                ruleSource: 'EXTRACTION_RULE',
                extractionRule: {
                    id: rule.id,
                    name: rule.name,
                    targetType: rule.targetType,
                },
                hitScore,
                minHitScore,
                passed,
                matchedRuleCount: conditionHits.filter((item) => item.matched).length,
                totalRuleCount: conditionHits.length,
                ruleHits: conditionHits,
                evaluatedAt: new Date().toISOString(),
            },
        };
    }

    private async executeInlineRule(
        context: NodeExecutionContext,
        config: Record<string, unknown>,
    ): Promise<NodeExecutionResult> {
        const minHitScore = this.toClampedScore(config.minHitScore, 80);
        const fieldPath =
            this.readString(config.fieldPath) ?? this.readString(config.ruleCode) ?? 'value';
        const operator = this.readString(config.operator)?.toUpperCase() ?? 'EQ';
        const expectedValue =
            config.expectedValue !== undefined
                ? (config.expectedValue as Prisma.JsonValue)
                : (config.value as Prisma.JsonValue);
        const actualValue = this.readValueByPath(context.input, fieldPath);
        const matched = this.matchRule(actualValue, operator, expectedValue ?? null);

        const hit: RuleHitRecord = {
            ruleCode: this.readString(config.ruleCode) ?? 'INLINE_RULE',
            ruleName: this.readString(config.ruleName) ?? 'Inline Rule',
            fieldPath,
            operator,
            expectedValue: (expectedValue ?? null) as Prisma.JsonValue | null,
            actualValue,
            matched,
            weight: this.normalizeWeight(this.readNumber(config.weight) ?? 1),
            source: 'INLINE',
        };

        const summary = this.buildSummary([hit], minHitScore, context.input);

        return {
            status: 'SUCCESS',
            output: {
                ...context.input,
                ruleSource: 'INLINE',
                ...summary,
                evaluatedAt: new Date().toISOString(),
            },
        };
    }

    private evaluateRule(input: Record<string, unknown>, rule: DecisionRuleRecord): RuleHitRecord {
        const actualValue = this.readValueByPath(input, rule.fieldPath);
        const matched = this.matchRule(actualValue, rule.operator, rule.expectedValue);
        return {
            ruleCode: rule.ruleCode,
            ruleName: rule.name,
            fieldPath: rule.fieldPath,
            operator: rule.operator,
            expectedValue: rule.expectedValue,
            actualValue: actualValue ?? null,
            matched,
            weight: this.normalizeWeight(rule.weight),
            source: 'DECISION_RULE_PACK',
        };
    }

    private buildSummary(
        ruleHits: RuleHitRecord[],
        minHitScore: number,
        input: Record<string, unknown>,
    ) {
        const totalWeight = ruleHits.reduce((acc, hit) => acc + hit.weight, 0);
        const matchedWeight = ruleHits
            .filter((hit) => hit.matched)
            .reduce((acc, hit) => acc + hit.weight, 0);
        const hitScore =
            totalWeight > 0
                ? this.toClampedScore((matchedWeight / totalWeight) * 100, 0)
                : this.estimateHitScore(input);
        const passed = hitScore >= minHitScore;

        return {
            hitScore,
            minHitScore,
            passed,
            matchedRuleCount: ruleHits.filter((hit) => hit.matched).length,
            totalRuleCount: ruleHits.length,
            ruleHits,
        };
    }

    private async loadDecisionRulePacksByCodes(
        context: NodeExecutionContext,
        codes: string[],
    ) {
        if (codes.length === 0) {
            return [];
        }
        const packs = await this.prisma.decisionRulePack.findMany({
            where: {
                isActive: true,
                OR: [{ ownerUserId: context.triggerUserId }, { templateSource: 'PUBLIC' }],
                rulePackCode: { in: codes },
            },
            include: {
                rules: {
                    where: { isActive: true },
                    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
                },
            },
        });

        const index = new Map<string, number>(codes.map((code, idx) => [code, idx]));
        return packs.sort((left, right) => {
            const leftIndex = index.get(left.rulePackCode) ?? Number.MAX_SAFE_INTEGER;
            const rightIndex = index.get(right.rulePackCode) ?? Number.MAX_SAFE_INTEGER;
            return leftIndex - rightIndex;
        });
    }

    private async loadLayeredDecisionRulePacks(
        context: NodeExecutionContext,
        config: Record<string, unknown>,
    ) {
        const requestedLayers = this.readRuleLayers(config);
        const requestedScopes = this.readScopeFilters(config);
        const where: Prisma.DecisionRulePackWhereInput = {
            isActive: true,
            OR: [{ ownerUserId: context.triggerUserId }, { templateSource: 'PUBLIC' }],
            ...(requestedLayers.length > 0 ? { ruleLayer: { in: requestedLayers } } : {}),
        };
        const packs = await this.prisma.decisionRulePack.findMany({
            where,
            include: {
                rules: {
                    where: { isActive: true },
                    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
                },
            },
            orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        });

        const filtered = requestedScopes.length === 0
            ? packs
            : packs.filter((pack) => {
                if (!pack.applicableScopes || pack.applicableScopes.length === 0) {
                    return true;
                }
                return pack.applicableScopes.some((scope) => requestedScopes.includes(scope));
            });

        return filtered.sort((left, right) => {
            const leftLayer = RULE_LAYER_ORDER.indexOf(left.ruleLayer.toUpperCase());
            const rightLayer = RULE_LAYER_ORDER.indexOf(right.ruleLayer.toUpperCase());
            const leftIndex = leftLayer >= 0 ? leftLayer : Number.MAX_SAFE_INTEGER;
            const rightIndex = rightLayer >= 0 ? rightLayer : Number.MAX_SAFE_INTEGER;
            if (leftIndex !== rightIndex) {
                return leftIndex - rightIndex;
            }
            if (left.priority !== right.priority) {
                return right.priority - left.priority;
            }
            return left.updatedAt.getTime() - right.updatedAt.getTime();
        });
    }

    private readRulePackCodes(config: Record<string, unknown>): string[] {
        const direct = this.readString(config.rulePackCode);
        const list = this.readStringArray(config.rulePackCodes);
        return [...new Set([direct, ...list].filter(Boolean) as string[])];
    }

    private readRuleLayers(config: Record<string, unknown>): string[] {
        const direct = this.readString(config.ruleLayer);
        const list = this.readStringArray(config.ruleLayers);
        const layers = [direct, ...list]
            .filter((item): item is string => Boolean(item))
            .map((item) => item.toUpperCase());
        return [...new Set(layers)];
    }

    private readScopeFilters(config: Record<string, unknown>): string[] {
        const direct = this.readString(config.applicableScope);
        const list = this.readStringArray(config.applicableScopes);
        const scopes = [direct, ...list].filter((item): item is string => Boolean(item));
        return [...new Set(scopes)];
    }

    private async findMarketAlertRule(config: Record<string, unknown>) {
        const alertRuleId = this.readString(config.alertRuleId);
        const alertType = this.readString(config.alertType);
        const ruleCode = this.readString(config.ruleCode);

        const where: Prisma.MarketAlertRuleWhereInput = {
            isActive: true,
            OR: [
                ...(alertRuleId ? [{ id: alertRuleId }] : []),
                ...(ruleCode ? [{ id: ruleCode }] : []),
                ...(alertType ? [{ type: alertType as never }] : []),
            ],
        };

        if (!where.OR || where.OR.length === 0) {
            return this.prisma.marketAlertRule.findFirst({
                where: { isActive: true },
                orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
            });
        }

        return this.prisma.marketAlertRule.findFirst({
            where,
            orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        });
    }

    private resolveAlertFieldPath(type: string): string | null {
        switch (type) {
            case 'DAY_CHANGE_ABS':
                return 'dayChange';
            case 'DAY_CHANGE_PCT':
                return 'dayChangePct';
            case 'CONTINUOUS_DAYS':
                return 'continuousDays';
            case 'DEVIATION_FROM_MEAN_PCT':
                return 'deviationFromMeanPct';
            default:
                return null;
        }
    }

    private resolveAlertExpectedValue(
        alertRule: {
            threshold: Prisma.Decimal | null;
            days: number | null;
            type: string;
        },
        config: Record<string, unknown>,
    ): Prisma.JsonValue | null {
        if (config.threshold !== undefined) {
            return this.readNumber(config.threshold);
        }
        if (config.value !== undefined) {
            return this.readNumber(config.value);
        }
        if (alertRule.type === 'CONTINUOUS_DAYS') {
            return alertRule.days ?? null;
        }
        return alertRule.threshold ? Number(alertRule.threshold) : null;
    }

    private resolveAlertOperator(type: string): string {
        if (type === 'DAY_CHANGE_ABS' || type === 'DAY_CHANGE_PCT' || type === 'DEVIATION_FROM_MEAN_PCT') {
            return 'ABS_GTE';
        }
        if (type === 'CONTINUOUS_DAYS') {
            return 'GTE';
        }
        return 'GTE';
    }

    private matchAlertRule(
        type: string,
        actualValue: unknown,
        expectedValue: Prisma.JsonValue | null,
        directionRaw: string | null,
    ): boolean {
        const actual = this.readNumber(actualValue);
        const expected = this.readNumber(expectedValue);
        if (actual === null || expected === null) {
            return false;
        }

        const direction = (directionRaw || 'BOTH').toUpperCase();
        const directionMatched =
            direction === 'BOTH' ||
            (direction === 'UP' && actual >= 0) ||
            (direction === 'DOWN' && actual <= 0);
        if (!directionMatched) {
            return false;
        }

        if (type === 'CONTINUOUS_DAYS') {
            return actual >= expected;
        }

        if (type === 'DAY_CHANGE_ABS' || type === 'DAY_CHANGE_PCT' || type === 'DEVIATION_FROM_MEAN_PCT') {
            return Math.abs(actual) >= expected;
        }

        return actual >= expected;
    }

    private matchMappingRule(matchModeRaw: string, pattern: string, actual: string): boolean {
        const matchMode = (matchModeRaw || '').trim().toUpperCase();
        if (matchMode === 'EXACT') {
            return actual === pattern;
        }
        if (matchMode === 'REGEX') {
            try {
                return new RegExp(pattern).test(actual);
            } catch {
                return false;
            }
        }
        return actual.includes(pattern);
    }

    private evaluateExtractionConditions(
        input: Record<string, unknown>,
        conditions: Prisma.JsonValue,
    ): RuleHitRecord[] {
        if (!Array.isArray(conditions)) {
            return [];
        }

        const hits: RuleHitRecord[] = [];
        for (let idx = 0; idx < conditions.length; idx += 1) {
            const condition = this.readObject(conditions[idx]);
            if (!condition) {
                continue;
            }
            const fieldPath =
                this.readString(condition.fieldPath) ??
                this.readString(condition.field) ??
                this.readString(condition.path);
            if (!fieldPath) {
                continue;
            }
            const operator = this.readString(condition.operator)?.toUpperCase() ?? 'EQ';
            const expectedValue = (condition.expectedValue ?? condition.value ?? null) as Prisma.JsonValue | null;
            const actualValue = this.readValueByPath(input, fieldPath);
            const matched = this.matchRule(actualValue, operator, expectedValue);
            hits.push({
                ruleCode: `EXTRACTION_CONDITION_${idx + 1}`,
                ruleName: this.readString(condition.name) ?? `Condition ${idx + 1}`,
                fieldPath,
                operator,
                expectedValue,
                actualValue,
                matched,
                weight: this.normalizeWeight(this.readNumber(condition.weight) ?? 1),
                source: 'EXTRACTION_RULE',
            });
        }

        return hits;
    }

    private readValueByPath(input: Record<string, unknown>, path: string): unknown {
        if (!path) {
            return undefined;
        }

        const normalizedPath = path
            .replace(/\[(\d+)\]/g, '.$1')
            .split('.')
            .map((segment) => segment.trim())
            .filter(Boolean);

        let current: unknown = input;
        for (const segment of normalizedPath) {
            if (current === null || current === undefined) {
                return undefined;
            }

            if (Array.isArray(current)) {
                const index = Number(segment);
                if (!Number.isInteger(index) || index < 0 || index >= current.length) {
                    return undefined;
                }
                current = current[index];
                continue;
            }

            if (typeof current !== 'object') {
                return undefined;
            }
            current = (current as Record<string, unknown>)[segment];
        }

        return current;
    }

    private matchRule(actualValue: unknown, operatorRaw: string, expectedValue: Prisma.JsonValue | null): boolean {
        const operator = operatorRaw.toUpperCase();
        switch (operator) {
            case 'GT':
                return this.compareNumber(actualValue, expectedValue, (a, b) => a > b);
            case 'GTE':
                return this.compareNumber(actualValue, expectedValue, (a, b) => a >= b);
            case 'LT':
                return this.compareNumber(actualValue, expectedValue, (a, b) => a < b);
            case 'LTE':
                return this.compareNumber(actualValue, expectedValue, (a, b) => a <= b);
            case 'EQ':
                return this.deepEqual(actualValue, expectedValue);
            case 'NEQ':
                return !this.deepEqual(actualValue, expectedValue);
            case 'IN': {
                if (!Array.isArray(expectedValue)) {
                    return false;
                }
                return expectedValue.some((item) => this.deepEqual(item, actualValue));
            }
            case 'NOT_IN': {
                if (!Array.isArray(expectedValue)) {
                    return false;
                }
                return !expectedValue.some((item) => this.deepEqual(item, actualValue));
            }
            case 'CONTAINS': {
                if (typeof actualValue === 'string' && typeof expectedValue === 'string') {
                    return actualValue.includes(expectedValue);
                }
                if (Array.isArray(actualValue)) {
                    return actualValue.some((item) => this.deepEqual(item, expectedValue));
                }
                return false;
            }
            case 'NOT_CONTAINS':
                return !this.matchRule(actualValue, 'CONTAINS', expectedValue);
            case 'EXISTS':
                return actualValue !== undefined && actualValue !== null;
            case 'NOT_EXISTS':
                return actualValue === undefined || actualValue === null;
            case 'BETWEEN': {
                if (!Array.isArray(expectedValue) || expectedValue.length < 2) {
                    return false;
                }
                const actualNumber = this.readNumber(actualValue);
                const lower = this.readNumber(expectedValue[0]);
                const upper = this.readNumber(expectedValue[1]);
                if (actualNumber === null || lower === null || upper === null) {
                    return false;
                }
                return actualNumber >= lower && actualNumber <= upper;
            }
            default:
                return false;
        }
    }

    private compareNumber(
        actualValue: unknown,
        expectedValue: Prisma.JsonValue | null,
        predicate: (actual: number, expected: number) => boolean,
    ): boolean {
        const actual = this.readNumber(actualValue);
        const expected = this.readNumber(expectedValue);
        if (actual === null || expected === null) {
            return false;
        }
        return predicate(actual, expected);
    }

    private normalizeWeight(weight: number): number {
        return Number.isFinite(weight) ? Math.max(1, Math.trunc(weight)) : 1;
    }

    private deepEqual(left: unknown, right: unknown): boolean {
        return JSON.stringify(left) === JSON.stringify(right);
    }

    private estimateHitScore(input: Record<string, unknown>): number {
        const directCandidates = [
            this.readNumber(input.score),
            this.readNumber(input.confidence),
            this.readNumber(input.riskScore),
        ].filter((value): value is number => value !== null);

        if (directCandidates.length > 0) {
            return this.averageScore(directCandidates);
        }

        const branches = input.branches;
        if (branches && typeof branches === 'object' && !Array.isArray(branches)) {
            const branchScores: number[] = [];
            for (const value of Object.values(branches as Record<string, unknown>)) {
                if (!value || typeof value !== 'object' || Array.isArray(value)) {
                    continue;
                }
                const branchObj = value as Record<string, unknown>;
                const candidate = [
                    this.readNumber(branchObj.score),
                    this.readNumber(branchObj.confidence),
                    this.readNumber(branchObj.hitScore),
                ].find((num): num is number => num !== null);
                if (candidate !== undefined) {
                    branchScores.push(candidate);
                }
            }
            if (branchScores.length > 0) {
                return this.averageScore(branchScores);
            }
        }

        return 70;
    }

    private averageScore(values: number[]): number {
        const sum = values.reduce((acc, value) => acc + value, 0);
        return this.toClampedScore(sum / values.length, 70);
    }

    private toClampedScore(value: unknown, fallback: number): number {
        const parsed = this.readNumber(value);
        const source = parsed === null ? fallback : parsed;
        return Math.max(0, Math.min(100, Math.round(source)));
    }

    private readNumber(value: unknown): number | null {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string' && value.trim() !== '') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        return null;
    }

    private readString(value: unknown): string | null {
        if (typeof value !== 'string') {
            return null;
        }
        const normalized = value.trim();
        return normalized ? normalized : null;
    }

    private readStringArray(value: unknown): string[] {
        if (!Array.isArray(value)) {
            return [];
        }
        return value
            .map((item) => this.readString(item))
            .filter((item): item is string => Boolean(item));
    }

    private readObject(value: unknown): Record<string, unknown> | null {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return null;
        }
        return value as Record<string, unknown>;
    }
}
