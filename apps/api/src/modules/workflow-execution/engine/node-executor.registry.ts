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
import { ConditionBranchNodeExecutor } from './node-executors/condition-branch.executor';
import { ParallelControlNodeExecutor } from './node-executors/parallel-control.executor';
import { DecisionMergeNodeExecutor } from './node-executors/decision-merge.executor';
import { CronTriggerNodeExecutor } from './node-executors/cron-trigger.executor';
import { EventTriggerNodeExecutor } from './node-executors/event-trigger.executor';
import { ContextBuilderNodeExecutor } from './node-executors/context-builder.executor';
import { JudgeAgentNodeExecutor } from './node-executors/judge-agent.executor';
import { ApprovalNodeExecutor } from './node-executors/approval.executor';

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
        private readonly conditionBranchNodeExecutor: ConditionBranchNodeExecutor,
        private readonly parallelControlNodeExecutor: ParallelControlNodeExecutor,
        private readonly decisionMergeNodeExecutor: DecisionMergeNodeExecutor,
        private readonly cronTriggerNodeExecutor: CronTriggerNodeExecutor,
        private readonly eventTriggerNodeExecutor: EventTriggerNodeExecutor,
        private readonly contextBuilderNodeExecutor: ContextBuilderNodeExecutor,
        private readonly judgeAgentNodeExecutor: JudgeAgentNodeExecutor,
        private readonly approvalNodeExecutor: ApprovalNodeExecutor,
    ) {
        // WHY: cron-trigger 和 event-trigger 必须在 ManualTriggerNodeExecutor 之前，
        // 因为 ManualTriggerNodeExecutor.supports() 会匹配所有 *-trigger 类型
        this.executors = [
            this.cronTriggerNodeExecutor,
            this.eventTriggerNodeExecutor,
            this.apiTriggerNodeExecutor,
            this.manualTriggerNodeExecutor,
            this.rulePackEvalNodeExecutor,
            this.riskGateNodeExecutor,
            this.notifyNodeExecutor,
            this.agentCallNodeExecutor,
            this.dataFetchNodeExecutor,
            this.computeNodeExecutor,
            this.debateRoundNodeExecutor,
            this.contextBuilderNodeExecutor,
            this.judgeAgentNodeExecutor,
            this.conditionBranchNodeExecutor,
            this.parallelControlNodeExecutor,
            this.decisionMergeNodeExecutor,
            this.approvalNodeExecutor,
            this.passthroughNodeExecutor, // 放最后作为 fallback
        ];
    }

    resolve(node: WorkflowNode): WorkflowNodeExecutor {
        return this.executors.find((executor) => executor.supports(node)) || this.passthroughNodeExecutor;
    }
}

