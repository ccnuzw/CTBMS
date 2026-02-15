import { DebateReplayQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class WorkflowDebateReplayQueryRequest extends createZodDto(DebateReplayQuerySchema) {}
