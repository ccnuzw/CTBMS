import { Injectable, Logger } from '@nestjs/common';
import { WorkflowNodeExecutor, NodeExecutionContext, NodeExecutionResult } from '../node-executor.interface';
import type { WorkflowNode } from '@packages/types';

/**
 * 事件触发执行器
 *
 * 支持节点类型: event-trigger
 *
 * 配置:
 *   config.eventType: string (事件类型, e.g. "PRICE_ALERT", "DATA_UPDATE", "SIGNAL_FIRED")
 *   config.eventSource: string (事件来源, e.g. "market-data", "risk-engine")
 *   config.filterConditions: Array<{ field, operator, value }> (事件过滤条件)
 *   config.enabled: boolean (是否启用, 默认 true)
 *   config.debounceMs: number (防抖间隔毫秒, 默认 0)
 *   config.maxConcurrent: number (最大并发触发数, 默认 1)
 */
@Injectable()
export class EventTriggerNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'EventTriggerNodeExecutor';
    private readonly logger = new Logger(EventTriggerNodeExecutor.name);

    supports(node: WorkflowNode): boolean {
        return node.type === 'event-trigger';
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        const { node, input } = context;
        const config = node.config as Record<string, unknown>;

        const eventType = config.eventType as string | undefined;
        const eventSource = (config.eventSource as string) ?? 'unknown';
        const enabled = (config.enabled as boolean) ?? true;
        const debounceMs = (config.debounceMs as number) ?? 0;
        const maxConcurrent = (config.maxConcurrent as number) ?? 1;
        const filterConditions = config.filterConditions as Array<{
            field: string;
            operator: string;
            value: unknown;
        }> | undefined;

        if (!eventType) {
            return {
                status: 'FAILED',
                output: {},
                message: `event-trigger 节点 ${node.name} 缺少 eventType 配置`,
            };
        }

        if (!enabled) {
            this.logger.log(`[${node.name}] event-trigger 已禁用，跳过执行`);
            return {
                status: 'SKIPPED',
                output: {
                    triggerType: 'event-trigger',
                    eventType,
                    enabled: false,
                    reason: '触发器已禁用',
                },
                message: `event-trigger 已禁用`,
            };
        }

        // 校验事件过滤条件
        const incomingEvent = input._event as Record<string, unknown> | undefined;
        if (filterConditions && filterConditions.length > 0 && incomingEvent) {
            const filterResult = this.evaluateFilters(filterConditions, incomingEvent);
            if (!filterResult.passed) {
                this.logger.log(
                    `[${node.name}] event-trigger 过滤未通过: ${filterResult.reason}`,
                );
                return {
                    status: 'SKIPPED',
                    output: {
                        triggerType: 'event-trigger',
                        eventType,
                        filterPassed: false,
                        reason: filterResult.reason,
                    },
                    message: `事件未通过过滤条件: ${filterResult.reason}`,
                };
            }
        }

        const now = new Date();
        this.logger.log(
            `[${node.name}] event-trigger 触发: type=${eventType}, source=${eventSource}`,
        );

        return {
            status: 'SUCCESS',
            output: {
                ...input,
                triggerAccepted: true,
                triggerNodeId: node.id,
                triggerType: 'event-trigger',
                eventType,
                eventSource,
                debounceMs,
                maxConcurrent,
                eventPayload: incomingEvent ?? null,
                triggeredAt: now.toISOString(),
            },
        };
    }

    // ────────────────── 过滤条件评估 ──────────────────

    private evaluateFilters(
        conditions: Array<{ field: string; operator: string; value: unknown }>,
        event: Record<string, unknown>,
    ): { passed: boolean; reason?: string } {
        for (const condition of conditions) {
            const actual = this.resolveFieldValue(condition.field, event);
            const isMatch = this.evaluateCondition(actual, condition.operator, condition.value);

            if (!isMatch) {
                return {
                    passed: false,
                    reason: `${condition.field} ${condition.operator} ${String(condition.value)} 不满足 (实际值: ${String(actual)})`,
                };
            }
        }
        return { passed: true };
    }

    private resolveFieldValue(field: string, obj: Record<string, unknown>): unknown {
        const parts = field.split('.');
        let current: unknown = obj;
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
            default: return false;
        }
    }
}
