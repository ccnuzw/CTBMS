import { MarketDataAggregateSchema } from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class MarketDataAggregateRequest extends createZodDto(MarketDataAggregateSchema) {}
