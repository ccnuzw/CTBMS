import { Module } from '@nestjs/common';
import { WorkflowExecutionController } from './workflow-execution.controller';
import { WorkflowExecutionService } from './workflow-execution.service';
import { NodeExecutorRegistry } from './engine/node-executor.registry';
import { ManualTriggerNodeExecutor } from './engine/node-executors/manual-trigger.executor';
import { NotifyNodeExecutor } from './engine/node-executors/notify-node.executor';
import { PassthroughNodeExecutor } from './engine/node-executors/passthrough-node.executor';
import { RulePackEvalNodeExecutor } from './engine/node-executors/rule-pack-eval.executor';
import { RiskGateNodeExecutor } from './engine/node-executors/risk-gate.executor';
import { AgentCallNodeExecutor } from './engine/node-executors/agent-call.executor';
import { DataFetchNodeExecutor } from './engine/node-executors/data-fetch.executor';
import { FuturesDataFetchNodeExecutor } from './engine/node-executors/futures-data-fetch.executor';
import { ComputeNodeExecutor } from './engine/node-executors/compute.executor';
import { VariableResolver } from './engine/variable-resolver';
import { EvidenceCollector } from './engine/evidence-collector';
import { ReplayAssembler } from './engine/replay-assembler';
import { DagScheduler } from './engine/dag-scheduler';
import { DebateRoundNodeExecutor } from './engine/node-executors/debate-round.executor';
import { ApiTriggerNodeExecutor } from './engine/node-executors/api-trigger.executor';
import { ConditionBranchNodeExecutor } from './engine/node-executors/condition-branch.executor';
import { ParallelControlNodeExecutor } from './engine/node-executors/parallel-control.executor';
import { DecisionMergeNodeExecutor } from './engine/node-executors/decision-merge.executor';
import { CronTriggerNodeExecutor } from './engine/node-executors/cron-trigger.executor';
import { EventTriggerNodeExecutor } from './engine/node-executors/event-trigger.executor';
import { ContextBuilderNodeExecutor } from './engine/node-executors/context-builder.executor';
import { JudgeAgentNodeExecutor } from './engine/node-executors/judge-agent.executor';
import { ApprovalNodeExecutor } from './engine/node-executors/approval.executor';
import { DebateTraceModule } from '../debate-trace/debate-trace.module';
import { WorkflowExperimentModule } from '../workflow-experiment/workflow-experiment.module';
import { AIProviderFactory } from '../ai/providers/provider.factory';
import { AgentProfileModule } from '../agent-profile';
import { DecisionRecordModule } from '../decision-record/decision-record.module';


@Module({
    imports: [DebateTraceModule, WorkflowExperimentModule, AgentProfileModule, DecisionRecordModule],

    controllers: [WorkflowExecutionController],
    providers: [
        WorkflowExecutionService,
        NodeExecutorRegistry,
        ManualTriggerNodeExecutor,
        RulePackEvalNodeExecutor,
        RiskGateNodeExecutor,
        NotifyNodeExecutor,
        PassthroughNodeExecutor,
        AgentCallNodeExecutor,
        DataFetchNodeExecutor,
        FuturesDataFetchNodeExecutor,
        ComputeNodeExecutor,
        DebateRoundNodeExecutor,
        ApiTriggerNodeExecutor,
        ConditionBranchNodeExecutor,
        ParallelControlNodeExecutor,
        DecisionMergeNodeExecutor,
        CronTriggerNodeExecutor,
        EventTriggerNodeExecutor,
        ContextBuilderNodeExecutor,
        JudgeAgentNodeExecutor,
        ApprovalNodeExecutor,
        VariableResolver,
        EvidenceCollector,
        ReplayAssembler,
        DagScheduler,
        AIProviderFactory,
    ],
    exports: [WorkflowExecutionService, VariableResolver, EvidenceCollector, ReplayAssembler, DagScheduler],
})
export class WorkflowExecutionModule { }
