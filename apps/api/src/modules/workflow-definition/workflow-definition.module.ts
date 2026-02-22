import { Module } from '@nestjs/common';
import { WorkflowDefinitionController } from './workflow-definition.controller';
import { WorkflowDefinitionService } from './workflow-definition.service';
import { WorkflowDefinitionValidatorService } from './workflow-definition-validator.service';
import { WorkflowDslValidator } from './workflow-dsl-validator';
import { VariableResolver } from '../workflow-execution/engine/variable-resolver';

@Module({
  controllers: [WorkflowDefinitionController],
  providers: [WorkflowDefinitionService, WorkflowDslValidator, VariableResolver],
  exports: [WorkflowDefinitionService, WorkflowDefinitionValidatorService],
})
export class WorkflowDefinitionModule {}
