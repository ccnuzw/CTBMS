import { createZodDto } from 'nestjs-zod';
import {
  CreateFuturesQuoteSnapshotSchema,
  FuturesQuoteQuerySchema,
  CalculateFuturesDerivedFeatureSchema,
  CalculateFuturesDerivedFeatureBatchSchema,
  FuturesDerivedFeatureQuerySchema,
  OpenPositionSchema,
  ClosePositionSchema,
  PositionQuerySchema,
  TradeLedgerQuerySchema,
} from '@packages/types';

export class CreateFuturesQuoteSnapshotRequest extends createZodDto(CreateFuturesQuoteSnapshotSchema) {}
export class FuturesQuoteQueryRequest extends createZodDto(FuturesQuoteQuerySchema) {}
export class CalculateFuturesDerivedFeatureRequest extends createZodDto(
  CalculateFuturesDerivedFeatureSchema,
) {}
export class CalculateFuturesDerivedFeatureBatchRequest extends createZodDto(
  CalculateFuturesDerivedFeatureBatchSchema,
) {}
export class FuturesDerivedFeatureQueryRequest extends createZodDto(FuturesDerivedFeatureQuerySchema) {}
export class OpenPositionRequest extends createZodDto(OpenPositionSchema) {}
export class ClosePositionRequest extends createZodDto(ClosePositionSchema) {}
export class PositionQueryRequest extends createZodDto(PositionQuerySchema) {}
export class TradeLedgerQueryRequest extends createZodDto(TradeLedgerQuerySchema) {}
