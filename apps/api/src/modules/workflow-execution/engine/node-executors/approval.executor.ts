import { Injectable, Logger } from '@nestjs/common';
import {
    WorkflowNodeExecutor,
    NodeExecutionContext,
    NodeExecutionResult,
} from '../node-executor.interface';
import type { WorkflowNode } from '@packages/types';

/**
 * 人工审批节点执行器
 *
 * 覆盖节点类型: approval
 *
 * 配置:
 *   config.approvers: string[] (审批人代码列表)
 *   config.minApprovals: number (最少通过人数, 默认 1)
 *   config.timeoutHours: number (审批超时小时数, 默认 24)
 *   config.escalationPolicy: 'AUTO_APPROVE' | 'AUTO_REJECT' | 'ESCALATE' (超时策略, 默认 AUTO_REJECT)
 *   config.approvalType: 'ANY' | 'ALL' | 'MAJORITY' (审批模式, 默认 ANY)
 */
@Injectable()
export class ApprovalNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'ApprovalNodeExecutor';
    private readonly logger = new Logger(ApprovalNodeExecutor.name);

    supports(node: WorkflowNode): boolean {
        return node.type === 'approval';
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        const { node, input } = context;
        const config = node.config as Record<string, unknown>;

        const approvers = (config.approvers as string[] | undefined) ?? [];
        const minApprovals = (config.minApprovals as number) ?? 1;
        const timeoutHours = (config.timeoutHours as number) ?? 24;
        const escalationPolicy = (config.escalationPolicy as string) ?? 'AUTO_REJECT';
        const approvalType = (config.approvalType as string) ?? 'ANY';

        // 校验审批人配置
        if (approvers.length === 0) {
            return {
                status: 'FAILED',
                output: {},
                message: `审批节点 ${node.name} 未配置审批人`,
            };
        }

        if (minApprovals > approvers.length) {
            return {
                status: 'FAILED',
                output: {},
                message: `审批节点 ${node.name}: minApprovals(${minApprovals}) 超过审批人数(${approvers.length})`,
            };
        }

        // 检查是否已有外部审批结果通过输入传入
        const externalApproval = input._approvalResult as
            | { approved: boolean; approvedBy?: string[]; comment?: string }
            | undefined;

        if (externalApproval) {
            this.logger.log(
                `[${node.name}] 收到外部审批结果: approved=${String(externalApproval.approved)}`,
            );

            return {
                status: externalApproval.approved ? 'SUCCESS' : 'FAILED',
                output: {
                    ...input,
                    approvalNodeId: node.id,
                    approved: externalApproval.approved,
                    approvedBy: externalApproval.approvedBy ?? [],
                    approvalComment: externalApproval.comment ?? '',
                    approvalType,
                    resolvedAt: new Date().toISOString(),
                },
                message: externalApproval.approved
                    ? '审批已通过'
                    : `审批被拒绝: ${externalApproval.comment ?? '无说明'}`,
            };
        }

        // 没有外部审批结果 — 生成待审批信号
        const deadlineAt = new Date(Date.now() + timeoutHours * 60 * 60 * 1000).toISOString();

        this.logger.log(
            `[${node.name}] 等待人工审批: approvers=${approvers.join(',')}, ` +
            `type=${approvalType}, min=${minApprovals}, deadline=${deadlineAt}`,
        );

        return {
            status: 'SUCCESS',
            output: {
                ...input,
                approvalNodeId: node.id,
                pendingApproval: true,
                approved: false,
                approvers,
                minApprovals,
                approvalType,
                escalationPolicy,
                timeoutHours,
                deadlineAt,
                requestedAt: new Date().toISOString(),
                approvalStatus: 'PENDING',
            },
            message: `等待人工审批 (审批人: ${approvers.join(', ')}, 截止: ${deadlineAt})`,
        };
    }
}
