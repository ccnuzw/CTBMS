import { Injectable } from '@nestjs/common';
import { WorkflowNode } from '@packages/types';
import { WorkflowNodeExecutor } from './node-executor.interface';
import { ManualTriggerNodeExecutor } from './node-executors/manual-trigger.executor';
import { NotifyNodeExecutor } from './node-executors/notify-node.executor';
import { PassthroughNodeExecutor } from './node-executors/passthrough-node.executor';
import { RulePackEvalNodeExecutor } from './node-executors/rule-pack-eval.executor';

@Injectable()
export class NodeExecutorRegistry {
    private readonly executors: WorkflowNodeExecutor[];

    constructor(
        private readonly manualTriggerNodeExecutor: ManualTriggerNodeExecutor,
        private readonly rulePackEvalNodeExecutor: RulePackEvalNodeExecutor,
        private readonly notifyNodeExecutor: NotifyNodeExecutor,
        private readonly passthroughNodeExecutor: PassthroughNodeExecutor,
    ) {
        this.executors = [
            this.manualTriggerNodeExecutor,
            this.rulePackEvalNodeExecutor,
            this.notifyNodeExecutor,
            this.passthroughNodeExecutor,
        ];
    }

    resolve(node: WorkflowNode): WorkflowNodeExecutor {
        return this.executors.find((executor) => executor.supports(node)) || this.passthroughNodeExecutor;
    }
}
