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
        return {
            status: 'SUCCESS',
            output: {
                ...context.input,
                passthroughNodeId: context.node.id,
                passthroughNodeType: context.node.type,
            },
        };
    }
}
