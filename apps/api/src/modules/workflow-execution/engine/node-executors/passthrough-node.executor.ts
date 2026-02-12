import { Injectable } from '@nestjs/common';
import { WorkflowNode } from '@packages/types';
import {
    NodeExecutionContext,
    NodeExecutionResult,
    WorkflowNodeExecutor,
} from '../node-executor.interface';

@Injectable()
export class PassthroughNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'PassthroughNodeExecutor';

    supports(_node: WorkflowNode): boolean {
        return true;
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        const config = context.node.config as Record<string, unknown>;
        const delayMs = this.toDelayMs(config.delayMs);
        if (delayMs > 0) {
            await this.sleep(delayMs);
        }

        return {
            status: 'SUCCESS',
            output: {
                ...context.input,
                passthroughNodeId: context.node.id,
                passthroughNodeType: context.node.type,
                passthroughDelayMs: delayMs,
            },
        };
    }

    private toDelayMs(value: unknown): number {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return Math.max(0, Math.min(60_000, Math.trunc(value)));
        }
        if (typeof value === 'string' && value.trim() !== '') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return Math.max(0, Math.min(60_000, Math.trunc(parsed)));
            }
        }
        return 0;
    }

    private async sleep(ms: number): Promise<void> {
        if (ms <= 0) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
}
