import { Injectable, Logger } from '@nestjs/common';
import { WorkflowEdge, WorkflowNode } from '@packages/types';

/**
 * 变量解析上下文
 */
export interface VariableResolutionContext {
    /** 当前节点 ID */
    currentNodeId: string;
    /** 已执行节点的输出 Map <nodeId, output> */
    outputsByNode: Map<string, Record<string, unknown>>;
    /** 参数快照 */
    paramSnapshot?: Record<string, unknown>;
    /** 执行元数据 */
    meta?: {
        executionId: string;
        triggerUserId: string;
        timestamp: string;
    };
}

/**
 * 数据血缘条目
 */
export interface DataLineageEntry {
    /** 变量表达式 */
    expression: string;
    /** 解析后的值 */
    resolvedValue: unknown;
    /** 来源节点 ID */
    sourceNodeId: string | null;
    /** 来源字段路径 */
    sourceFieldPath: string;
    /** 解析时间 */
    resolvedAt: string;
}

/**
 * 变量解析结果
 */
export interface VariableResolutionResult {
    /** 解析后的值 */
    resolved: Record<string, unknown>;
    /** 数据血缘记录 */
    lineage: DataLineageEntry[];
    /** 未解析的变量 */
    unresolvedVars: string[];
}

/**
 * 变量解析器
 *
 * 功能:
 * 1. 跨节点变量引用: {{nodeId.fieldPath}} → 解析为对应节点输出的字段值
 * 2. 参数引用: {{params.paramCode}} → 解析为参数快照中的值
 * 3. 元数据引用: {{meta.executionId}} / {{meta.timestamp}}
 * 4. 数据血缘追踪: 记录每个变量的来源节点和字段路径
 * 5. 默认值: {{nodeId.field | default: 0}} 语法
 */
@Injectable()
export class VariableResolver {
    private readonly logger = new Logger(VariableResolver.name);

    /**
     * 解析变量映射
     *
     * @param mapping 变量映射配置 { targetField: "{{source.expression}}" }
     * @param context 解析上下文
     */
    resolveMapping(
        mapping: Record<string, unknown>,
        context: VariableResolutionContext,
    ): VariableResolutionResult {
        const resolved: Record<string, unknown> = {};
        const lineage: DataLineageEntry[] = [];
        const unresolvedVars: string[] = [];

        for (const [targetField, expression] of Object.entries(mapping)) {
            if (typeof expression === 'string' && this.isExpression(expression)) {
                const result = this.resolveExpression(expression, context);
                resolved[targetField] = result.value;
                if (result.lineageEntry) {
                    lineage.push(result.lineageEntry);
                }
                if (result.isUnresolved) {
                    unresolvedVars.push(expression);
                }
            } else {
                // 非表达式直接透传
                resolved[targetField] = expression;
            }
        }

        return { resolved, lineage, unresolvedVars };
    }

    /**
     * 解析模板字符串中的所有变量引用
     *
     * @param template 含有 {{expression}} 的模板字符串
     * @param context 解析上下文
     */
    resolveTemplate(
        template: string,
        context: VariableResolutionContext,
    ): { text: string; lineage: DataLineageEntry[] } {
        const lineage: DataLineageEntry[] = [];

        const text = template.replace(/\{\{([^}]+)\}\}/g, (match, expr: string) => {
            const result = this.resolveExpression(match, context);
            if (result.lineageEntry) {
                lineage.push(result.lineageEntry);
            }
            return result.value !== undefined ? String(result.value) : match;
        });

        return { text, lineage };
    }

    /**
     * 构建完整的数据血缘图
     *
     * @param nodes 工作流节点列表
     * @param edges 工作流边列表
     * @param outputsByNode 各节点输出
     */
    buildLineageGraph(
        nodes: WorkflowNode[],
        edges: WorkflowEdge[],
        outputsByNode: Map<string, Record<string, unknown>>,
    ): Record<string, DataLineageEntry[]> {
        const lineageGraph: Record<string, DataLineageEntry[]> = {};

        for (const node of nodes) {
            const nodeOutput = outputsByNode.get(node.id);
            if (!nodeOutput) continue;

            const nodeLineage: DataLineageEntry[] = [];

            // 追踪每个输出字段的来源
            for (const [field, value] of Object.entries(nodeOutput)) {
                if (field === '_meta') continue;

                // 查找输入数据边
                const incomingEdges = edges.filter((e) => e.to === node.id);
                for (const edge of incomingEdges) {
                    const sourceOutput = outputsByNode.get(edge.from);
                    if (!sourceOutput) continue;

                    // 检查字段是否来自上游
                    if (sourceOutput[field] !== undefined) {
                        nodeLineage.push({
                            expression: `{{${edge.from}.${field}}}`,
                            resolvedValue: value,
                            sourceNodeId: edge.from,
                            sourceFieldPath: field,
                            resolvedAt: new Date().toISOString(),
                        });
                    }
                }
            }

            if (nodeLineage.length > 0) {
                lineageGraph[node.id] = nodeLineage;
            }
        }

        return lineageGraph;
    }

    // ────────────────── 私有方法 ──────────────────

    /**
     * 判断字符串是否为表达式
     */
    private isExpression(value: string): boolean {
        return /\{\{.+\}\}/.test(value);
    }

    /**
     * 解析单个表达式
     *
     * 支持格式:
     * - {{nodeId.field.path}}      → 节点输出字段
     * - {{params.paramCode}}       → 参数快照
     * - {{meta.executionId}}       → 执行元数据
     * - {{nodeId.field | default: value}} → 含默认值
     */
    private resolveExpression(
        rawExpr: string,
        context: VariableResolutionContext,
    ): {
        value: unknown;
        lineageEntry: DataLineageEntry | null;
        isUnresolved: boolean;
    } {
        // 提取 {{ ... }} 内的表达式
        const innerMatch = rawExpr.match(/\{\{\s*(.+?)\s*\}\}/);
        if (!innerMatch) {
            return { value: rawExpr, lineageEntry: null, isUnresolved: false };
        }

        const inner = innerMatch[1];

        // 检查是否有默认值 (| default: xxx)
        const defaultMatch = inner.match(/^(.+?)\s*\|\s*default\s*:\s*(.+)$/);
        const expression = defaultMatch ? defaultMatch[1].trim() : inner.trim();
        const defaultValue = defaultMatch ? this.parseDefaultValue(defaultMatch[2].trim()) : undefined;

        // 按 . 分割路径
        const parts = expression.split('.');
        if (parts.length < 2) {
            return { value: defaultValue ?? rawExpr, lineageEntry: null, isUnresolved: true };
        }

        const scope = parts[0];
        const fieldPath = parts.slice(1).join('.');

        let value: unknown;
        let sourceNodeId: string | null = null;

        if (scope === 'params') {
            // 参数引用
            value = this.resolveDeepPath(context.paramSnapshot ?? {}, fieldPath);
            sourceNodeId = null;
        } else if (scope === 'meta') {
            // 元数据引用
            value = context.meta ? this.resolveDeepPath(context.meta as Record<string, unknown>, fieldPath) : undefined;
            sourceNodeId = null;
        } else {
            // 节点输出引用
            const nodeOutput = context.outputsByNode.get(scope);
            if (nodeOutput) {
                value = this.resolveDeepPath(nodeOutput, fieldPath);
                sourceNodeId = scope;
            }
        }

        // 应用默认值
        if (value === undefined || value === null) {
            if (defaultValue !== undefined) {
                value = defaultValue;
            } else {
                return {
                    value: undefined,
                    lineageEntry: null,
                    isUnresolved: true,
                };
            }
        }

        const lineageEntry: DataLineageEntry = {
            expression: rawExpr,
            resolvedValue: value,
            sourceNodeId,
            sourceFieldPath: fieldPath,
            resolvedAt: new Date().toISOString(),
        };

        return { value, lineageEntry, isUnresolved: false };
    }

    /**
     * 深层路径解析
     */
    private resolveDeepPath(obj: Record<string, unknown>, path: string): unknown {
        let current: unknown = obj;
        for (const key of path.split('.')) {
            if (current && typeof current === 'object') {
                if (Array.isArray(current)) {
                    const idx = parseInt(key, 10);
                    if (Number.isFinite(idx)) {
                        current = current[idx];
                    } else {
                        return undefined;
                    }
                } else {
                    current = (current as Record<string, unknown>)[key];
                }
            } else {
                return undefined;
            }
        }
        return current;
    }

    /**
     * 解析默认值字面量
     */
    private parseDefaultValue(raw: string): unknown {
        if (raw === 'null') return null;
        if (raw === 'true') return true;
        if (raw === 'false') return false;
        const num = Number(raw);
        if (Number.isFinite(num)) return num;
        // 字符串（去除引号）
        if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
            return raw.slice(1, -1);
        }
        return raw;
    }
}
