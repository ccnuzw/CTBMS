import { MarketDataQuerySchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class MarketDataQueryRequest extends createZodDto(MarketDataQuerySchema) {}
