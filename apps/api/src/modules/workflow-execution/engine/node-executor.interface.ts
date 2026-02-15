import { WorkflowNode } from '@packages/types';

export interface NodeExecutionContext {
    executionId: string;
    triggerUserId: string;
    node: WorkflowNode;
    input: Record<string, unknown>;
    paramSnapshot?: Record<string, unknown>;
}

export interface NodeExecutionResult {
    status?: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    output: Record<string, unknown>;
    message?: string;
}

export interface WorkflowNodeExecutor {
    readonly name: string;
    supports(node: WorkflowNode): boolean;
    execute(context: NodeExecutionContext): Promise<NodeExecutionResult>;
}
