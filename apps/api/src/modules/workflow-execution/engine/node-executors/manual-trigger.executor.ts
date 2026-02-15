import { Injectable } from '@nestjs/common';
import { WorkflowNode } from '@packages/types';
import {
    NodeExecutionContext,
    NodeExecutionResult,
    WorkflowNodeExecutor,
} from '../node-executor.interface';

@Injectable()
export class ManualTriggerNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'ManualTriggerNodeExecutor';

    supports(node: WorkflowNode): boolean {
        return node.type === 'trigger' || node.type.endsWith('-trigger');
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        return {
            status: 'SUCCESS',
            output: {
                ...context.input,
                triggerAccepted: true,
                triggerNodeId: context.node.id,
                triggerType: context.node.type,
                triggeredAt: new Date().toISOString(),
            },
        };
    }
}
