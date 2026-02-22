import { Body, Controller, Post } from '@nestjs/common';
import { ValidateWorkflowDslRequest } from '../workflow-definition/dto';
import { WorkflowDefinitionValidatorService } from '../workflow-definition/workflow-definition-validator.service';

@Controller('workflow-validations')
export class WorkflowValidationController {
  constructor(private readonly workflowDefinitionValidatorService: WorkflowDefinitionValidatorService) { }

  @Post()
  validateDsl(@Body() dto: ValidateWorkflowDslRequest) {
    return this.workflowDefinitionValidatorService.validateDsl(dto.dslSnapshot, dto.stage);
  }
}
