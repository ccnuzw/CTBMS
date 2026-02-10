import { ValidateWorkflowDslSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ValidateWorkflowDslRequest extends createZodDto(ValidateWorkflowDslSchema) { }
