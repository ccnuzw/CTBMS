import {
    CreateEnterpriseSchema,
    UpdateEnterpriseSchema,
    EnterpriseQuerySchema,
} from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateEnterpriseDto extends createZodDto(CreateEnterpriseSchema) { }
export class UpdateEnterpriseDto extends createZodDto(UpdateEnterpriseSchema) { }
export class EnterpriseQueryDto extends createZodDto(EnterpriseQuerySchema) { }
