import { Module } from '@nestjs/common';
import { WorkflowExecutionController } from './workflow-execution.controller';
import { WorkflowExecutionService } from './workflow-execution.service';
import { NodeExecutorRegistry } from './engine/node-executor.registry';
import { ManualTriggerNodeExecutor } from './engine/node-executors/manual-trigger.executor';
import { NotifyNodeExecutor } from './engine/node-executors/notify-node.executor';
import { PassthroughNodeExecutor } from './engine/node-executors/passthrough-node.executor';
import { RulePackEvalNodeExecutor } from './engine/node-executors/rule-pack-eval.executor';
import { RiskGateNodeExecutor } from './engine/node-executors/risk-gate.executor';

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
    ],
    exports: [WorkflowExecutionService],
})
export class WorkflowExecutionModule { }
