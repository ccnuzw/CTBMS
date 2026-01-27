import { createZodDto } from 'nestjs-zod';
import {
    CreateIntelTaskTemplateSchema,
    UpdateIntelTaskTemplateSchema,
    BatchDistributeTasksSchema,
} from '@packages/types';

export class CreateIntelTaskTemplateDto extends createZodDto(CreateIntelTaskTemplateSchema) { }

export class UpdateIntelTaskTemplateDto extends createZodDto(UpdateIntelTaskTemplateSchema) { }

export class BatchDistributeTasksDto extends createZodDto(BatchDistributeTasksSchema) { }
