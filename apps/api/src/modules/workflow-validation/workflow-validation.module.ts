import { Module } from '@nestjs/common';
import { WorkflowDefinitionModule } from '../workflow-definition';
import { WorkflowValidationController } from './workflow-validation.controller';

@Module({
  imports: [WorkflowDefinitionModule],
  controllers: [WorkflowValidationController],
})
export class WorkflowValidationModule {}
