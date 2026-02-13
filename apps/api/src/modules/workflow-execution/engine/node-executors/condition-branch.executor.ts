import { Injectable, Logger } from '@nestjs/common';
import { WorkflowNodeExecutor, NodeExecutionContext, NodeExecutionResult } from '../node-executor.interface';
import type { WorkflowNode } from '@packages/types';

/**
 * 条件分支执行器
 *
 * 支持节点类型: if-else, switch
 *
 * if-else 配置:
 *   config.conditions: Array<{ field, operator, value, branchId }>
 *   config.defaultBranch: string (默认分支 ID)
 *
 * switch 配置:
 *   config.switchField: string (用于匹配的字段)
 *   config.cases: Array<{ value, branchId }>
 *   config.defaultBranch: string
 */
@Injectable()
export class ConditionBranchNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'ConditionBranchNodeExecutor';
    private readonly logger = new Logger(ConditionBranchNodeExecutor.name);

    supports(node: WorkflowNode): boolean {
        return node.type === 'if-else' || node.type === 'switch';
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        const { node, input } = context;
        const config = node.config as Record<string, unknown>;

        if (node.type === 'if-else') {
            return this.executeIfElse(config, input, node);
        }

        return this.executeSwitch(config, input, node);
    }

    // ────────────────── if-else ──────────────────

    private executeIfElse(
        config: Record<string, unknown>,
        input: Record<string, unknown>,
        node: WorkflowNode,
    ): NodeExecutionResult {
        const conditions = config.conditions as Array<{
            field: string;
            operator: string;
            value: unknown;
            branchId: string;
        }> | undefined;

        const defaultBranch = (config.defaultBranch as string) || 'false';

        if (!conditions || !Array.isArray(conditions) || conditions.length === 0) {
            this.logger.warn(`[${node.name}] if-else 无 conditions，走默认分支: ${defaultBranch}`);
            return {
                status: 'SUCCESS',
                output: {
                    selectedBranch: defaultBranch,
                    evaluationResult: false,
                    reason: '无条件配置',
                },
            };
        }

        // 依次评估条件，匹配第一个为 true 的分支
        for (const condition of conditions) {
            const actual = this.resolveFieldValue(condition.field, input);
            const isMatch = this.evaluateCondition(actual, condition.operator, condition.value);

            if (isMatch) {
                this.logger.log(`[${node.name}] 条件匹配: ${condition.field} ${condition.operator} → 分支 ${condition.branchId}`);
                return {
                    status: 'SUCCESS',
                    output: {
                        selectedBranch: condition.branchId,
                        evaluationResult: true,
                        matchedCondition: {
                            field: condition.field,
                            operator: condition.operator,
                            expectedValue: condition.value,
                            actualValue: actual,
                        },
                    },
                };
            }
        }

        this.logger.log(`[${node.name}] 所有条件未匹配，走默认分支: ${defaultBranch}`);
        return {
            status: 'SUCCESS',
            output: {
                selectedBranch: defaultBranch,
                evaluationResult: false,
                reason: '所有条件均未匹配',
            },
        };
    }

    // ────────────────── switch ──────────────────

    private executeSwitch(
        config: Record<string, unknown>,
        input: Record<string, unknown>,
        node: WorkflowNode,
    ): NodeExecutionResult {
        const switchField = config.switchField as string;
        const cases = config.cases as Array<{ value: unknown; branchId: string }> | undefined;
        const defaultBranch = (config.defaultBranch as string) || 'default';

        if (!switchField) {
            return {
                status: 'FAILED',
                output: {},
                message: `switch 节点 ${node.name} 缺少 switchField 配置`,
            };
        }

        const switchValue = this.resolveFieldValue(switchField, input);

        if (cases && Array.isArray(cases)) {
            for (const caseItem of cases) {
                if (this.isEqual(switchValue, caseItem.value)) {
                    this.logger.log(`[${node.name}] switch 匹配: ${switchField}=${String(switchValue)} → 分支 ${caseItem.branchId}`);
                    return {
                        status: 'SUCCESS',
                        output: {
                            selectedBranch: caseItem.branchId,
                            switchField,
                            switchValue,
                            matchedCase: caseItem.value,
                        },
                    };
                }
            }
        }

        this.logger.log(`[${node.name}] switch 无匹配，走默认分支: ${defaultBranch}`);
        return {
            status: 'SUCCESS',
            output: {
                selectedBranch: defaultBranch,
                switchField,
                switchValue,
                reason: '无匹配 case',
            },
        };
    }

    // ────────────────── 工具方法 ──────────────────

    private resolveFieldValue(field: string, input: Record<string, unknown>): unknown {
        // 支持点分路径: "result.status" → input.result.status
        const parts = field.split('.');
        let current: unknown = input;
        for (const part of parts) {
            if (current === null || current === undefined || typeof current !== 'object') {
                return undefined;
            }
            current = (current as Record<string, unknown>)[part];
        }
        return current;
    }

    private evaluateCondition(actual: unknown, operator: string, expected: unknown): boolean {
        switch (operator) {
            case 'eq': return actual === expected;
            case 'neq': return actual !== expected;
            case 'gt': return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
            case 'gte': return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
            case 'lt': return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
            case 'lte': return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
            case 'in': return Array.isArray(expected) && expected.includes(actual);
            case 'not_in': return Array.isArray(expected) && !expected.includes(actual);
            case 'contains': return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected);
            case 'exists': return actual !== undefined && actual !== null;
            case 'not_exists': return actual === undefined || actual === null;
            case 'truthy': return !!actual;
            case 'falsy': return !actual;
            default: return false;
        }
    }

    private isEqual(a: unknown, b: unknown): boolean {
        if (a === b) return true;
        if (typeof a === 'number' && typeof b === 'string') return a === Number(b);
        if (typeof a === 'string' && typeof b === 'number') return Number(a) === b;
        return String(a) === String(b);
    }
}
