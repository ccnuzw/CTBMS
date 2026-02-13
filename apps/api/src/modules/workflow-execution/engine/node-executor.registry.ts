import { Injectable } from '@nestjs/common';
import { WorkflowNode } from '@packages/types';
import { WorkflowNodeExecutor } from './node-executor.interface';
import { ManualTriggerNodeExecutor } from './node-executors/manual-trigger.executor';
import { NotifyNodeExecutor } from './node-executors/notify-node.executor';
import { PassthroughNodeExecutor } from './node-executors/passthrough-node.executor';
import { RulePackEvalNodeExecutor } from './node-executors/rule-pack-eval.executor';
import { RiskGateNodeExecutor } from './node-executors/risk-gate.executor';
import { AgentCallNodeExecutor } from './node-executors/agent-call.executor';
import { DataFetchNodeExecutor } from './node-executors/data-fetch.executor';
import { ComputeNodeExecutor } from './node-executors/compute.executor';
import { DebateRoundNodeExecutor } from './node-executors/debate-round.executor';
import { ApiTriggerNodeExecutor } from './node-executors/api-trigger.executor';

@Injectable()
export class NodeExecutorRegistry {
    private readonly executors: WorkflowNodeExecutor[];

    constructor(
        private readonly manualTriggerNodeExecutor: ManualTriggerNodeExecutor,
        private readonly rulePackEvalNodeExecutor: RulePackEvalNodeExecutor,
        private readonly riskGateNodeExecutor: RiskGateNodeExecutor,
        private readonly notifyNodeExecutor: NotifyNodeExecutor,
        private readonly passthroughNodeExecutor: PassthroughNodeExecutor,
        private readonly agentCallNodeExecutor: AgentCallNodeExecutor,
        private readonly dataFetchNodeExecutor: DataFetchNodeExecutor,
        private readonly computeNodeExecutor: ComputeNodeExecutor,
        private readonly debateRoundNodeExecutor: DebateRoundNodeExecutor,
        private readonly apiTriggerNodeExecutor: ApiTriggerNodeExecutor,
    ) {
        this.executors = [
            this.manualTriggerNodeExecutor,
            this.apiTriggerNodeExecutor,
            this.rulePackEvalNodeExecutor,
            this.riskGateNodeExecutor,
            this.notifyNodeExecutor,
            this.agentCallNodeExecutor,
            this.dataFetchNodeExecutor,
            this.computeNodeExecutor,
            this.debateRoundNodeExecutor,
            this.passthroughNodeExecutor, // 放最后作为 fallback
        ];
    }

    resolve(node: WorkflowNode): WorkflowNodeExecutor {
        return this.executors.find((executor) => executor.supports(node)) || this.passthroughNodeExecutor;
    }
}

