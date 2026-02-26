import { StandardizationPreviewSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class StandardizationPreviewRequest extends createZodDto(StandardizationPreviewSchema) {}
