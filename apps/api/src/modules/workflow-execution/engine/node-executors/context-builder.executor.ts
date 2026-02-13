import { Injectable, Logger } from '@nestjs/common';
import { WorkflowNodeExecutor, NodeExecutionContext, NodeExecutionResult } from '../node-executor.interface';
import type { WorkflowNode } from '@packages/types';

/**
 * 辩论上下文构建器
 *
 * 支持节点类型: context-builder
 *
 * 功能: 从多个上游数据源（行情、特征、规则、历史决策等）收集信息，
 * 构建结构化的辩论上下文，供后续 debate-round / judge-agent 使用。
 *
 * 配置:
 *   config.contextSchema: Array<{ key, sourceField, label, required }> (上下文字段映射)
 *   config.includeHistorical: boolean (是否包含历史决策参考, 默认 false)
 *   config.historicalLimit: number (历史决策条数, 默认 5)
 *   config.summaryPrompt: string (可选，用于生成上下文摘要的提示)
 *   config.maxContextSize: number (上下文最大字符数, 默认 10000)
 */
@Injectable()
export class ContextBuilderNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'ContextBuilderNodeExecutor';
    private readonly logger = new Logger(ContextBuilderNodeExecutor.name);

    supports(node: WorkflowNode): boolean {
        return node.type === 'context-builder';
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        const { node, input } = context;
        const config = node.config as Record<string, unknown>;

        const contextSchema = config.contextSchema as Array<{
            key: string;
            sourceField: string;
            label: string;
            required?: boolean;
        }> | undefined;
        const includeHistorical = (config.includeHistorical as boolean) ?? false;
        const historicalLimit = (config.historicalLimit as number) ?? 5;
        const maxContextSize = (config.maxContextSize as number) ?? 10000;

        // 从多个上游分支提取数据
        const branches = (input.branches as Record<string, Record<string, unknown>>) ?? {};
        const hasBranches = Object.keys(branches).length > 0;
        const sourceData = hasBranches ? this.flattenBranches(branches) : input;

        // 按 schema 构建结构化上下文
        const debateContext: Record<string, unknown> = {};
        const missingRequired: string[] = [];

        if (contextSchema && Array.isArray(contextSchema)) {
            for (const field of contextSchema) {
                const value = this.resolveFieldValue(field.sourceField, sourceData);
                if (value !== undefined && value !== null) {
                    debateContext[field.key] = value;
                } else if (field.required) {
                    missingRequired.push(`${field.label} (${field.sourceField})`);
                }
            }
        } else {
            // 无 schema 时，透传所有上游数据
            Object.assign(debateContext, sourceData);
        }

        if (missingRequired.length > 0) {
            return {
                status: 'FAILED',
                output: { debateContext, missingRequired },
                message: `context-builder 缺少必填字段: ${missingRequired.join(', ')}`,
            };
        }

        // 提取历史决策参考
        let historicalRef: unknown[] = [];
        if (includeHistorical) {
            const historyData = (sourceData.historicalDecisions as unknown[]) ??
                (sourceData.decisionHistory as unknown[]) ?? [];
            historicalRef = Array.isArray(historyData)
                ? historyData.slice(0, historicalLimit)
                : [];
        }

        // 构建上下文摘要
        const contextJson = JSON.stringify(debateContext);
        const isTruncated = contextJson.length > maxContextSize;
        const contextSize = contextJson.length;

        this.logger.log(
            `[${node.name}] context-builder: ${Object.keys(debateContext).length} 字段, ` +
            `size=${contextSize}, truncated=${isTruncated}`,
        );

        return {
            status: 'SUCCESS',
            output: {
                debateContext: isTruncated
                    ? JSON.parse(contextJson.slice(0, maxContextSize) + '"}')
                    : debateContext,
                contextFields: Object.keys(debateContext),
                contextSize,
                isTruncated,
                historicalRef,
                includeHistorical,
                sourceCount: hasBranches ? Object.keys(branches).length : 1,
                builtAt: new Date().toISOString(),
                _meta: {
                    executor: this.name,
                    schemaFieldCount: contextSchema?.length ?? 0,
                },
            },
        };
    }

    // ────────────────── 工具方法 ──────────────────

    /**
     * 将多分支输入展平为单层对象，用 branchId 前缀区分
     */
    private flattenBranches(
        branches: Record<string, Record<string, unknown>>,
    ): Record<string, unknown> {
        const flat: Record<string, unknown> = {};
        for (const [branchId, output] of Object.entries(branches)) {
            for (const [key, value] of Object.entries(output)) {
                if (key === '_meta') continue;
                flat[`${branchId}.${key}`] = value;
                // 同时保留无前缀版本（后写入的覆盖先写入的）
                flat[key] = value;
            }
        }
        return flat;
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
}
