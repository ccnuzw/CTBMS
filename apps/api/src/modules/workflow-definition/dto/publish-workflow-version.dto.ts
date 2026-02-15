import { PublishWorkflowVersionSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class PublishWorkflowVersionRequest extends createZodDto(PublishWorkflowVersionSchema) { }
