import { Module } from '@nestjs/common';
import { WorkflowDefinitionController } from './workflow-definition.controller';
import { WorkflowDefinitionService } from './workflow-definition.service';
import { WorkflowDslValidator } from './workflow-dsl-validator';

@Module({
    controllers: [WorkflowDefinitionController],
    providers: [WorkflowDefinitionService, WorkflowDslValidator],
    exports: [WorkflowDefinitionService],
})
export class WorkflowDefinitionModule { }
