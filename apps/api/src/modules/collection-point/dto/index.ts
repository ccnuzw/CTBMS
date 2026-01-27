import { createZodDto } from 'nestjs-zod';
import {
    CreateCollectionPointSchema,
    UpdateCollectionPointSchema,
    CollectionPointQuerySchema,
} from '@packages/types';

export class CreateCollectionPointDto extends createZodDto(CreateCollectionPointSchema) { }
export class UpdateCollectionPointDto extends createZodDto(UpdateCollectionPointSchema) { }
export class CollectionPointQueryDto extends createZodDto(CollectionPointQuerySchema) { }
