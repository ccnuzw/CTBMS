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
import { ComputeNodeExecutor } from './engine/node-executors/compute.executor';
import { VariableResolver } from './engine/variable-resolver';
import { EvidenceCollector } from './engine/evidence-collector';
import { ReplayAssembler } from './engine/replay-assembler';
import { DagScheduler } from './engine/dag-scheduler';

@Module({
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
        ComputeNodeExecutor,
        VariableResolver,
        EvidenceCollector,
        ReplayAssembler,
        DagScheduler,
    ],
    exports: [WorkflowExecutionService, VariableResolver, EvidenceCollector, ReplayAssembler, DagScheduler],
})
export class WorkflowExecutionModule { }


