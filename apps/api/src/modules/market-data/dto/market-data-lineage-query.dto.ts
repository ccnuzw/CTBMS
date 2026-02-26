import { MarketDataLineageQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class MarketDataLineageQueryRequest extends createZodDto(MarketDataLineageQuerySchema) {}
