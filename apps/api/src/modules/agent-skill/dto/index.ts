import { createZodDto } from 'nestjs-zod';
import {
  ReviewSkillDraftSchema,
  SandboxSkillDraftSchema,
  RevokeSkillRuntimeGrantSchema,
} from '@packages/types';

export class SandboxSkillDraftRequest extends createZodDto(SandboxSkillDraftSchema) {}
export class ReviewSkillDraftRequest extends createZodDto(ReviewSkillDraftSchema) {}
export class RevokeSkillRuntimeGrantRequest extends createZodDto(RevokeSkillRuntimeGrantSchema) {}
