import { PreflightWorkflowDslSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class PreflightWorkflowDslRequest extends createZodDto(PreflightWorkflowDslSchema) {}
