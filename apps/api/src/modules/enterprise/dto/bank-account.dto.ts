import { CreateBankAccountSchema, UpdateBankAccountSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateBankAccountDto extends createZodDto(CreateBankAccountSchema) { }
export class UpdateBankAccountDto extends createZodDto(UpdateBankAccountSchema) { }
