import { createZodDto } from 'nestjs-zod';
import { UserQuerySchema } from '@packages/types';

export class UserQueryRequest extends createZodDto(UserQuerySchema) { }
