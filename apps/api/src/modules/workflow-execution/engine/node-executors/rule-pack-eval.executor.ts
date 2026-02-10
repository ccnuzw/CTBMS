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

@Injectable()
export class RulePackEvalNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'RulePackEvalNodeExecutor';
    private readonly ruleNodeTypes = new Set(['rule-pack-eval', 'rule-eval', 'alert-check']);

    constructor(private readonly prisma: PrismaService) { }

    supports(node: WorkflowNode): boolean {
        return this.ruleNodeTypes.has(node.type);
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        const config = context.node.config as Record<string, unknown>;
        const rulePackCode = typeof config.rulePackCode === 'string'
            ? config.rulePackCode.trim()
            : '';
        if (!rulePackCode) {
            throw new Error('规则节点缺少 rulePackCode 配置');
        }

        const minHitScore = this.toClampedScore(config.minHitScore, 60);
        const rulePack = await this.prisma.decisionRulePack.findFirst({
            where: {
                rulePackCode,
                isActive: true,
                OR: [
                    { ownerUserId: context.triggerUserId },
                    { templateSource: 'PUBLIC' },
                ],
            },
            include: {
                rules: {
                    where: { isActive: true },
                    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
                },
            },
        });

        if (!rulePack) {
            throw new Error(`规则包不存在或无权限访问: ${rulePackCode}`);
        }
        if (rulePack.rules.length === 0) {
            throw new Error(`规则包未配置可用规则: ${rulePackCode}`);
        }

        const ruleHits = rulePack.rules.map((rule) => this.evaluateRule(context.input, rule));
        const totalWeight = ruleHits.reduce((acc, hit) => acc + hit.weight, 0);
        const matchedWeight = ruleHits
            .filter((hit) => hit.matched)
            .reduce((acc, hit) => acc + hit.weight, 0);
        const hitScore = totalWeight > 0
            ? this.toClampedScore((matchedWeight / totalWeight) * 100, 0)
            : this.estimateHitScore(context.input);
        const passed = hitScore >= minHitScore;

        return {
            status: 'SUCCESS',
            output: {
                ...context.input,
                rulePackCode,
                rulePackName: rulePack.name,
                rulePackVersion: rulePack.version,
                hitScore,
                minHitScore,
                passed,
                matchedRuleCount: ruleHits.filter((hit) => hit.matched).length,
                totalRuleCount: ruleHits.length,
                ruleHits,
                evaluatedAt: new Date().toISOString(),
            },
        };
    }

    private evaluateRule(input: Record<string, unknown>, rule: DecisionRuleRecord) {
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
        };
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
}
