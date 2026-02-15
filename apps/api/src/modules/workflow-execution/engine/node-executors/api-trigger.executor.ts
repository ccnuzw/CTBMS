import { Injectable, Logger } from '@nestjs/common';
import { WorkflowNode } from '@packages/types';
import {
    NodeExecutionContext,
    NodeExecutionResult,
    WorkflowNodeExecutor,
} from '../node-executor.interface';

/**
 * API / ON_DEMAND 触发节点执行器
 *
 * 职责：
 * 1. 验证 API 触发的输入参数（必填字段、类型校验）
 * 2. 注入触发元数据（来源 IP、调用方标识、时间戳）
 * 3. 将外部传入的 params 与节点默认 config 合并
 * 4. 支持 callbackUrl 配置（异步回调通知）
 * 5. 输出标准化的触发上下文供下游节点消费
 */
@Injectable()
export class ApiTriggerNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'ApiTriggerNodeExecutor';
    private readonly logger = new Logger(this.name);

    supports(node: WorkflowNode): boolean {
        return node.type === 'api-trigger' || node.type === 'on-demand-trigger';
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        const { node, input, paramSnapshot, executionId, triggerUserId } = context;
        const config = (node.config as Record<string, unknown>) ?? {};

        this.logger.log(
            `[${executionId}] API 触发节点执行: nodeId=${node.id}, userId=${triggerUserId}`,
        );

        // ── 1. 参数验证 ──
        const requiredFields = (config.requiredFields as string[]) ?? [];
        const validationErrors: string[] = [];

        for (const field of requiredFields) {
            if (input[field] === undefined || input[field] === null) {
                validationErrors.push(`缺少必填参数: ${field}`);
            }
        }

        if (validationErrors.length > 0) {
            return {
                status: 'FAILED',
                output: { validationErrors },
                message: `API 触发参数验证失败: ${validationErrors.join('; ')}`,
            };
        }

        // ── 2. 类型校验（可选） ──
        const fieldTypes = (config.fieldTypes as Record<string, string>) ?? {};
        for (const [field, expectedType] of Object.entries(fieldTypes)) {
            const value = input[field];
            if (value !== undefined && value !== null) {
                const actualType = Array.isArray(value) ? 'array' : typeof value;
                if (actualType !== expectedType) {
                    validationErrors.push(
                        `参数 ${field} 类型错误: 期望 ${expectedType}, 实际 ${actualType}`,
                    );
                }
            }
        }

        if (validationErrors.length > 0) {
            return {
                status: 'FAILED',
                output: { validationErrors },
                message: `API 触发类型校验失败: ${validationErrors.join('; ')}`,
            };
        }

        // ── 3. 合并参数 ──
        const defaultValues = (config.defaultValues as Record<string, unknown>) ?? {};
        const mergedParams: Record<string, unknown> = {
            ...defaultValues,
            ...input,
        };

        // ── 4. 构建触发上下文 ──
        const triggerMeta: Record<string, unknown> = {
            triggerType: 'ON_DEMAND',
            triggerNodeId: node.id,
            triggerNodeType: node.type,
            triggeredAt: new Date().toISOString(),
            triggeredByUserId: triggerUserId,
            executionId,
        };

        // 注入调用方标识（如有）
        if (input._callerIdentity) {
            triggerMeta.callerIdentity = input._callerIdentity;
        }
        if (input._sourceIp) {
            triggerMeta.sourceIp = input._sourceIp;
        }
        if (input._callbackUrl) {
            triggerMeta.callbackUrl = input._callbackUrl;
        }

        // 实验标识（A/B 灰度）
        if (input._experimentId) {
            triggerMeta.experimentId = input._experimentId;
            triggerMeta.experimentVariant = input._experimentVariant;
        }

        // ── 5. 构建输出 ──
        const output: Record<string, unknown> = {
            ...mergedParams,
            _trigger: triggerMeta,
            _paramSnapshot: paramSnapshot ?? {},
        };

        // 移除内部标识字段（以 _ 开头的系统字段不传递给业务逻辑）
        const cleanedOutput: Record<string, unknown> = {};
        const systemFields: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(output)) {
            if (key.startsWith('_')) {
                systemFields[key] = value;
            } else {
                cleanedOutput[key] = value;
            }
        }

        this.logger.log(
            `[${executionId}] API 触发成功: ${Object.keys(cleanedOutput).length} 业务参数, ` +
            `${Object.keys(systemFields).length} 系统字段`,
        );

        return {
            status: 'SUCCESS',
            output: {
                ...cleanedOutput,
                _meta: systemFields,
            },
            message: `API 触发节点执行成功 (${Object.keys(mergedParams).length} params)`,
        };
    }
}
