import { CreateWorkflowVersionSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateWorkflowVersionRequest extends createZodDto(CreateWorkflowVersionSchema) { }
