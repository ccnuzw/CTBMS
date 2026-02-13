import { Injectable, Logger } from '@nestjs/common';
import { WorkflowNodeExecutor, NodeExecutionContext, NodeExecutionResult } from '../node-executor.interface';
import type { WorkflowNode } from '@packages/types';

/**
 * 定时触发执行器
 *
 * 支持节点类型: cron-trigger
 *
 * 配置:
 *   config.cronExpression: string (cron 表达式, e.g. "0 9 * * 1-5")
 *   config.timezone: string (时区, 默认 "Asia/Shanghai")
 *   config.enabled: boolean (是否启用, 默认 true)
 *   config.description: string (触发描述)
 *   config.maxMissedRuns: number (最大允许错过次数, 默认 3)
 *   config.catchUpPolicy: 'SKIP' | 'RUN_ONCE' | 'RUN_ALL' (错过时的补偿策略, 默认 SKIP)
 */
@Injectable()
export class CronTriggerNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'CronTriggerNodeExecutor';
    private readonly logger = new Logger(CronTriggerNodeExecutor.name);

    supports(node: WorkflowNode): boolean {
        return node.type === 'cron-trigger';
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        const { node, input } = context;
        const config = node.config as Record<string, unknown>;

        const cronExpression = config.cronExpression as string | undefined;
        const timezone = (config.timezone as string) ?? 'Asia/Shanghai';
        const enabled = (config.enabled as boolean) ?? true;
        const catchUpPolicy = (config.catchUpPolicy as string) ?? 'SKIP';
        const description = (config.description as string) ?? '';

        if (!cronExpression) {
            return {
                status: 'FAILED',
                output: {},
                message: `cron-trigger 节点 ${node.name} 缺少 cronExpression 配置`,
            };
        }

        if (!enabled) {
            this.logger.log(`[${node.name}] cron-trigger 已禁用，跳过执行`);
            return {
                status: 'SKIPPED',
                output: {
                    triggerType: 'cron-trigger',
                    cronExpression,
                    enabled: false,
                    reason: '触发器已禁用',
                },
                message: `cron-trigger 已禁用`,
            };
        }

        // 校验 cron 表达式格式（基础校验：5 或 6 段）
        const cronParts = cronExpression.trim().split(/\s+/);
        if (cronParts.length < 5 || cronParts.length > 6) {
            return {
                status: 'FAILED',
                output: { cronExpression },
                message: `cron 表达式格式错误（需要 5~6 段）: ${cronExpression}`,
            };
        }

        const now = new Date();
        const scheduledTime = (input._scheduledTime as string) ?? now.toISOString();

        this.logger.log(
            `[${node.name}] cron-trigger 触发: expression=${cronExpression}, tz=${timezone}`,
        );

        return {
            status: 'SUCCESS',
            output: {
                ...input,
                triggerAccepted: true,
                triggerNodeId: node.id,
                triggerType: 'cron-trigger',
                cronExpression,
                timezone,
                catchUpPolicy,
                description,
                scheduledTime,
                triggeredAt: now.toISOString(),
            },
        };
    }
}
