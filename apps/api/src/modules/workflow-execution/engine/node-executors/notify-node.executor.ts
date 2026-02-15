import { Injectable } from '@nestjs/common';
import { WorkflowNode } from '@packages/types';
import {
    NodeExecutionContext,
    NodeExecutionResult,
    WorkflowNodeExecutor,
} from '../node-executor.interface';

@Injectable()
export class NotifyNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'NotifyNodeExecutor';
    private readonly notifyNodeTypes = new Set(['notify', 'report-generate', 'dashboard-publish']);

    supports(node: WorkflowNode): boolean {
        return this.notifyNodeTypes.has(node.type);
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        const channels = Array.isArray((context.node.config as Record<string, unknown>)?.channels)
            ? ((context.node.config as Record<string, unknown>).channels as unknown[])
                .map((channel) => String(channel))
            : ['DASHBOARD'];

        return {
            status: 'SUCCESS',
            output: {
                ...context.input,
                notified: true,
                channels,
                notifyNodeId: context.node.id,
                notifiedAt: new Date().toISOString(),
            },
        };
    }
}
