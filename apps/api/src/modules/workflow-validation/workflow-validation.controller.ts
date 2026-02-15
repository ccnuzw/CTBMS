import { Body, Controller, Post } from '@nestjs/common';
import { ValidateWorkflowDslRequest } from '../workflow-definition/dto';
import { WorkflowDefinitionService } from '../workflow-definition';

@Controller('workflow-validations')
export class WorkflowValidationController {
  constructor(private readonly workflowDefinitionService: WorkflowDefinitionService) {}

  @Post()
  validateDsl(@Body() dto: ValidateWorkflowDslRequest) {
    return this.workflowDefinitionService.validateDsl(dto.dslSnapshot, dto.stage);
  }
}
