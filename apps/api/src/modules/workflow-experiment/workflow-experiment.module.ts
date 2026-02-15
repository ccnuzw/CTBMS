import { Module } from '@nestjs/common';
import { WorkflowExperimentController } from './workflow-experiment.controller';
import { WorkflowExperimentService } from './workflow-experiment.service';

@Module({
    controllers: [WorkflowExperimentController],
    providers: [WorkflowExperimentService],
    exports: [WorkflowExperimentService],
})
export class WorkflowExperimentModule { }
