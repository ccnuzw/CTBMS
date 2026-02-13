import { createZodDto } from 'nestjs-zod';
import {
    CreateDecisionRecordSchema,
    UpdateDecisionRecordSchema,
    DecisionRecordQuerySchema,
} from '@packages/types';

export class CreateDecisionRecordDto extends createZodDto(CreateDecisionRecordSchema) { }
export class UpdateDecisionRecordDto extends createZodDto(UpdateDecisionRecordSchema) { }
export class DecisionRecordQueryDto extends createZodDto(DecisionRecordQuerySchema) { }
