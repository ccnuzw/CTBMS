import { Injectable, Logger } from '@nestjs/common';
import { AgentToolCallRequest, AgentToolCallResponse, AgentToolDefinition } from '@packages/types';
import { NodeExecutorRegistry } from '../workflow-execution/engine/node-executor.registry';
import { NodeExecutionContext } from '../workflow-execution/engine/node-executor.interface';
import { BUILTIN_TOOL_CATALOG, findToolById, toOpenAIFunctions } from './tool-catalog';
import { randomUUID } from 'crypto';

/**
 * 工具适配服务
 *
 * 桥接 LLM Agent 的 function calling 与现有 NodeExecutor 体系。
 *
 * 职责：
 *   1. 提供工具目录给 LLM（getAvailableTools / getOpenAIFunctions）
 *   2. 解析 LLM 的 tool call → 构造 NodeExecutionContext → 调用 NodeExecutor
 *   3. 将 NodeExecutionResult → AgentToolCallResponse（含中文可读摘要）
 */
@Injectable()
export class ToolAdapterService {
    private readonly logger = new Logger(ToolAdapterService.name);

    constructor(
        private readonly nodeExecutorRegistry: NodeExecutorRegistry,
    ) { }

    /** 获取全部可用工具定义 */
    getAvailableTools(): AgentToolDefinition[] {
        return BUILTIN_TOOL_CATALOG;
    }

    /** 获取 OpenAI function calling 格式的工具列表 */
    getOpenAIFunctions() {
        return toOpenAIFunctions(BUILTIN_TOOL_CATALOG);
    }

    /** 执行一次工具调用 */
    async executeTool(request: AgentToolCallRequest): Promise<AgentToolCallResponse> {
        const startTime = Date.now();
        const toolDef = findToolById(request.toolId);

        if (!toolDef) {
            return {
                toolId: request.toolId,
                status: 'FAILED',
                data: {},
                summary: `未找到工具「${request.toolId}」`,
                error: `Unknown tool: ${request.toolId}`,
                durationMs: Date.now() - startTime,
            };
        }

        const nodeType = toolDef._nodeType;
        if (!nodeType) {
            return {
                toolId: request.toolId,
                status: 'FAILED',
                data: {},
                summary: `工具「${toolDef.displayName}」未关联底层执行器`,
                error: `No _nodeType mapping for ${request.toolId}`,
                durationMs: Date.now() - startTime,
            };
        }

        try {
            // 构造虚拟节点以匹配 NodeExecutor.supports()
            const virtualNode = {
                id: `tool-${request.toolId}-${Date.now().toString(36)}`,
                type: nodeType,
                name: toolDef.displayName,
                enabled: true,
                config: this.mapParamsToConfig(request.toolId, request.params),
            };

            const executor = this.nodeExecutorRegistry.resolve(virtualNode);

            const context: NodeExecutionContext = {
                executionId: `tool-call-${randomUUID()}`,
                triggerUserId: request.context?.userId ?? 'agent-system',
                node: virtualNode,
                input: request.params,
            };

            this.logger.log(`执行工具调用: ${toolDef.displayName} (${request.toolId})`);

            const result = await executor.execute(context);

            const durationMs = Date.now() - startTime;
            const summary = this.buildChineseSummary(toolDef, request.params, result.output, result.status);

            return {
                toolId: request.toolId,
                status: result.status === 'FAILED' ? 'FAILED' : 'SUCCESS',
                data: result.output,
                summary,
                error: result.status === 'FAILED' ? (result.message ?? '执行失败') : undefined,
                durationMs,
            };
        } catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`工具调用失败: ${request.toolId}`, err.stack);
            return {
                toolId: request.toolId,
                status: 'FAILED',
                data: {},
                summary: `执行「${toolDef.displayName}」时发生错误: ${err.message}`,
                error: err.message,
                durationMs: Date.now() - startTime,
            };
        }
    }

    /**
     * 将 LLM 传入的参数映射到 NodeExecutor 需要的 config 格式
     *
     * 不同工具需要不同的映射逻辑，因为 LLM 看到的参数名
     * 是面向业务的简化版本，而 NodeExecutor 内部使用的是技术字段名
     */
    private mapParamsToConfig(
        toolId: string,
        params: Record<string, unknown>,
    ): Record<string, unknown> {
        switch (toolId) {
            case 'query_market_data':
                return {
                    connectorCode: params.connectorCode ?? 'DEFAULT_MARKET',
                    dataSourceCode: params.connectorCode ?? 'DEFAULT_MARKET',
                    filters: {
                        commodity: params.commodity ? [params.commodity] : undefined,
                        regionCode: params.regionCode ? [params.regionCode] : undefined,
                    },
                    timeRangeType: 'LAST_N_DAYS',
                    lookbackDays: params.lookbackDays ?? 7,
                };

            case 'ai_analyze':
                return {
                    agentProfileCode: params.agentCode ?? 'DEFAULT_ANALYST',
                    agentCode: params.agentCode ?? 'DEFAULT_ANALYST',
                    temperatureOverride: params.temperature ?? 0.7,
                    temperature: params.temperature ?? 0.7,
                    returnReasoning: true,
                    _analysisGoal: params.analysisGoal,
                    _context: params.context,
                };

            case 'multi_perspective_discuss':
                return {
                    maxRounds: params.maxRounds ?? 3,
                    judgePolicy: params.judgePolicy ?? 'WEIGHTED',
                    participants: Array.isArray(params.perspectives)
                        ? (params.perspectives as string[]).map((p, i) => ({
                            agentCode: `AUTO_PARTICIPANT_${i}`,
                            role: `参与者 ${i + 1}`,
                            perspective: p,
                            weight: 1,
                        }))
                        : [],
                };

            case 'evaluate_rules':
                return {
                    rulePackCode: params.rulePackCode,
                    ruleVersionPolicy: 'LOCKED',
                    minHitScore: params.minHitScore ?? 60,
                };

            case 'generate_report':
                return {
                    reportType: params.reportType,
                    title: params.title,
                    sections: params.sections,
                    commodity: params.commodity,
                };

            case 'send_notification':
                return {
                    channel: params.channel,
                    title: params.title,
                    content: params.content,
                    recipients: params.recipients,
                };

            case 'run_workflow':
                return {
                    subflowId: params.workflowId,
                    inputParams: params.inputParams,
                };

            default:
                // 直接透传参数
                return { ...params };
        }
    }

    /** 生成中文可读摘要 */
    private buildChineseSummary(
        tool: AgentToolDefinition,
        params: Record<string, unknown>,
        output: Record<string, unknown>,
        status?: string,
    ): string {
        if (status === 'FAILED') {
            return `「${tool.displayName}」执行失败`;
        }

        switch (tool.toolId) {
            case 'query_market_data':
                return `已获取${params.commodity || ''}行情数据（近${params.lookbackDays || 7}天）`;
            case 'query_futures_data':
                return `已获取${params.commodity || ''}期货数据`;
            case 'search_knowledge':
                return `已从知识库检索到相关资料`;
            case 'ai_analyze':
                return `AI已完成分析：${params.analysisGoal || ''}`;
            case 'multi_perspective_discuss':
                return `多方讨论已完成（${params.maxRounds || 3}轮），已出裁判结论`;
            case 'evaluate_rules':
                return `规则评估完成（规则包: ${params.rulePackCode}）`;
            case 'risk_check':
                return `风险检查完成`;
            case 'generate_report':
                return `已生成${params.reportType || ''}报告「${params.title || ''}」`;
            case 'run_workflow':
                return `已执行工作流 ${params.workflowId}`;
            default:
                return `「${tool.displayName}」执行完毕`;
        }
    }
}
