import { WorkflowPublishAuditQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class WorkflowPublishAuditQueryRequest extends createZodDto(WorkflowPublishAuditQuerySchema) { }
