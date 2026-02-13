import { createZodDto } from 'nestjs-zod';
import {
    CreateWorkflowExperimentSchema,
    UpdateWorkflowExperimentSchema,
    WorkflowExperimentQuerySchema,
    ConcludeExperimentSchema,
    OnDemandTriggerSchema,
    RecordExperimentMetricsSchema,
} from '@packages/types';

export class CreateWorkflowExperimentDto extends createZodDto(CreateWorkflowExperimentSchema) { }
export class UpdateWorkflowExperimentDto extends createZodDto(UpdateWorkflowExperimentSchema) { }
export class WorkflowExperimentQueryDto extends createZodDto(WorkflowExperimentQuerySchema) { }
export class ConcludeExperimentDto extends createZodDto(ConcludeExperimentSchema) { }
export class OnDemandTriggerDto extends createZodDto(OnDemandTriggerSchema) { }
export class RecordExperimentMetricsDto extends createZodDto(RecordExperimentMetricsSchema) { }
