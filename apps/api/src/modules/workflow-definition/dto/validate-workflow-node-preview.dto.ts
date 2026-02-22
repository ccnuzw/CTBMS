import { ValidateWorkflowNodePreviewSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class ValidateWorkflowNodePreviewRequest extends createZodDto(
  ValidateWorkflowNodePreviewSchema,
) {}
